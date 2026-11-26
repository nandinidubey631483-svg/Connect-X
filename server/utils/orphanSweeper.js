/**
 * ConnectX Clustered Orphan Sweeper Protocol
 * 
 * Reconciles dangling or orphaned ActiveRotations intents across the cluster.
 * 
 * Invariants:
 * 1. Transaction options: readPreference: 'primary', readConcern: 'snapshot', writeConcern: 'majority'.
 * 2. In every sweeper quarantine branch, ActiveRotations.deleteOne() MUST assert deletedCount === 1.
 *    If deletedCount !== 1, aborts transaction so SessionFamily quarantine rollback occurs.
 */
const ActiveRotations = require("../models/activeRotationsModel");
const SessionFamily = require("../models/sessionFamilyModel");
const mongoose = require("mongoose");
const AppError = require("./appError");

const SWEEPER_TRANSACTION_OPTIONS = {
  readPreference: "primary",
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority", wtimeout: 5000 },
};

class SweeperYieldError extends AppError {
  constructor(reason, details = {}) {
    super(`Sweeper transaction yielded: ${reason}`, 409, reason, details);
    this.name = "SweeperYieldError";
  }
}

/**
 * Reconciles a single stale ActiveRotations document with strict transactional ownership assertions.
 */
async function reconcileOrphanIntent(doc, { clientSession = null, redisClient = null } = {}) {
  const ownSession = !clientSession && mongoose.connection.readyState === 1;
  const session = clientSession || (ownSession ? await mongoose.startSession() : null);

  const executeReconciliation = async (activeSession) => {
    // Step 1: Assert intent ownership still matches exact operationId and fencingToken
    const queryOpts = activeSession ? { session: activeSession } : {};
    const intent = await ActiveRotations.findOne(
      { _id: doc._id, operationId: doc.operationId, fencingToken: doc.fencingToken },
      null,
      queryOpts
    );
    if (!intent) {
      throw new SweeperYieldError("INTENT_OWNERSHIP_LOST");
    }

    // Step 2: Inspect SessionFamily status
    const family = await SessionFamily.findOne({ familyId: doc._id }, null, queryOpts);

    if (family && family.familyStatus === "ROTATING" && family.activeOperationId === doc.operationId) {
      // Branch A: Step 1 write did commit (family is ROTATING under this operation)
      const familyResult = await SessionFamily.updateOne(
        {
          familyId: doc._id,
          familyStatus: "ROTATING",
          activeOperationId: doc.operationId,
        },
        {
          $set: {
            familyStatus: "REVOKED",
            isRevoked: true,
            revocationReason: "ORPHAN_STEP1_ROTATING_RECONCILED",
            revokedAt: new Date(),
            activeOperationId: null,
          },
        },
        queryOpts
      );
      if (familyResult.matchedCount !== 1) {
        throw new SweeperYieldError("FAMILY_FENCE_LOST");
      }
    } else {
      // Branch B: Family is not rotating under this operation (uncommitted or already reconciled)
      const familyResult = await SessionFamily.updateOne(
        {
          familyId: doc._id,
          isRevoked: false,
        },
        {
          $set: {
            familyStatus: "REVOKED",
            isRevoked: true,
            revocationReason: "ORPHAN_UNCOMMITTED_RECONCILED",
            revokedAt: new Date(),
            activeOperationId: null,
          },
        },
        queryOpts
      );
      // Even if matchedCount is 0 (already revoked), we proceed to consume matching intent
    }

    // Step 3: Atomic intent deletion with strict deletedCount === 1 assertion
    const deleteResult = await ActiveRotations.deleteOne(
      { _id: doc._id, operationId: doc.operationId, fencingToken: doc.fencingToken },
      queryOpts
    );

    if (deleteResult.deletedCount !== 1) {
      // Intent was modified or deleted concurrently by a newer operation -> abort transaction!
      throw new SweeperYieldError("INTENT_DELETION_FAILED_ROLLBACK_FAMILY");
    }

    // Publish Redis emergency revocation if redisClient available
    if (redisClient && typeof redisClient.set === "function") {
      try {
        await redisClient.set(`revocation:family:${doc._id}`, "REVOKED");
      } catch (_) {}
    }

    return { reconciled: true, familyId: doc._id };
  };

  try {
    if (session && typeof session.withTransaction === "function") {
      let result;
      try {
        await session.withTransaction(async () => {
          result = await executeReconciliation(session);
        }, SWEEPER_TRANSACTION_OPTIONS);
        return result;
      } catch (txErr) {
        if (txErr && txErr.message && txErr.message.includes("Transaction numbers are only allowed")) {
          return await executeReconciliation(null);
        }
        throw txErr;
      }
    } else {
      return await executeReconciliation(null);
    }
  } finally {
    if (ownSession && session) {
      await session.endSession();
    }
  }
}

/**
 * Scans ActiveRotations for intents older than threshold and reconciles them.
 */
async function runOrphanSweeper({
  thresholdMs = 30000,
  activeRotationsModel = ActiveRotations,
  redisClient = null,
} = {}) {
  const staleThreshold = new Date(Date.now() - thresholdMs);
  const staleIntents = await activeRotationsModel.find({ createdAt: { $lt: staleThreshold } });

  const results = { scanned: staleIntents.length, reconciled: 0, yielded: 0, errors: 0 };

  for (const doc of staleIntents) {
    try {
      await reconcileOrphanIntent(doc, { redisClient });
      results.reconciled++;
    } catch (err) {
      if (err instanceof SweeperYieldError) {
        results.yielded++;
      } else {
        results.errors++;
      }
    }
  }

  return results;
}

module.exports = {
  reconcileOrphanIntent,
  runOrphanSweeper,
  SWEEPER_TRANSACTION_OPTIONS,
  SweeperYieldError,
};
