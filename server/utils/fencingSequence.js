/**
 * ConnectX Monotonic Fencing Sequence Generator
 * 
 * Architecture:
 * - Persistent Single Source of Truth: MongoDB Counter model (majority write concern)
 * - In-Memory / Distributed Acceleration: Redis Lua upper-bound reservation
 * - Invariant: Sequence numbers strictly increase monotonically across restarts, failovers, and parallel instances.
 */
const Counter = require("../models/counterModel");
const AppError = require("./appError");

const FENCING_SEQUENCE_ID = "auth_fencing_sequence";
const DEFAULT_BLOCK_SIZE = 10000;

// Redis Lua script: Generates next sequence number bounded by upper bound
const LUA_GENERATE_FENCING_TOKEN = `
local current = redis.call('GET', KEYS[1])
local upper = redis.call('GET', KEYS[2])
if not current or not upper then
    return -1 -- Uninitialized
end
local currentNum = tonumber(current)
local upperNum = tonumber(upper)
if currentNum + 1 > upperNum then
    return 0 -- Block exhausted
else
    return redis.call('INCR', KEYS[1])
end
`;

// Redis Lua script: Atomically sets upper bound and ensures sequence doesn't regress
const LUA_INSTALL_FENCING_BLOCK = `
local upper = redis.call('GET', KEYS[2])
local targetUpper = tonumber(ARGV[1])
local blockSize = tonumber(ARGV[2])
if not upper or targetUpper > tonumber(upper) then
    redis.call('SET', KEYS[2], tostring(targetUpper))
    local current = redis.call('GET', KEYS[1])
    if not current then
        local targetBase = targetUpper - blockSize
        redis.call('SET', KEYS[1], tostring(targetBase))
    end
    return 1
else
    return 0
end
`;

/**
 * Helper to obtain the active Redis server instance run_id.
 * Unique across server restarts and replica failovers.
 */
async function getRedisRunId(redisClient) {
  if (!redisClient) return null;
  if (typeof redisClient.getRunId === "function") {
    return redisClient.getRunId();
  }
  if (typeof redisClient.info === "function") {
    try {
      const infoStr = await redisClient.info("server");
      const match = infoStr && infoStr.match(/run_id:([a-f0-9]+)/i);
      if (match) return match[1];
    } catch (_) {}
  }
  return null;
}

/**
 * Creates an in-memory mock store implementing Redis sequence operations with exact Lua semantics.
 * Ideal for unit testing and local development without an active Redis instance.
 */
function createInMemoryFencingStore({ runId = "in_memory_run_id_default" } = {}) {
  const store = new Map();
  let currentRunId = runId;

  return {
    get(key) {
      return store.get(key) || null;
    },
    set(key, val) {
      store.set(key, String(val));
    },
    del(key) {
      store.delete(key);
    },
    getRunId() {
      return currentRunId;
    },
    restart(newRunId = `run_id_${Date.now()}_${Math.random().toString(36).slice(2)}`) {
      currentRunId = newRunId;
    },
    eval(script, numKeys, key1, key2, arg1, arg2) {
      if (script === LUA_GENERATE_FENCING_TOKEN) {
        const current = store.get(key1);
        const upper = store.get(key2);
        if (!current || !upper) return -1;
        const currentNum = parseInt(current, 10);
        const upperNum = parseInt(upper, 10);
        if (currentNum + 1 > upperNum) {
          return 0; // Block exhausted
        }
        const next = currentNum + 1;
        store.set(key1, String(next));
        return next;
      }

      if (script === LUA_INSTALL_FENCING_BLOCK) {
        const upper = store.get(key2);
        const targetUpper = parseInt(arg1, 10);
        const blockSize = parseInt(arg2, 10);
        const upperNum = upper ? parseInt(upper, 10) : -1;
        if (!upper || targetUpper > upperNum) {
          store.set(key2, String(targetUpper));
          const current = store.get(key1);
          if (!current) {
            const targetBase = targetUpper - blockSize;
            store.set(key1, String(targetBase));
          }
          return 1;
        }
        return 0;
      }

      throw new Error("Unknown script passed to in-memory store");
    },
  };
}

/**
 * Fetches the next authoritative block from MongoDB Counter with majority write concern.
 */
async function reserveNextBlockFromMongo(counterModel = Counter, blockSize = DEFAULT_BLOCK_SIZE) {
  const result = await counterModel.findOneAndUpdate(
    { _id: FENCING_SEQUENCE_ID },
    { $inc: { seq: blockSize } },
    {
      upsert: true,
      returnDocument: "after",
      writeConcern: { w: "majority" },
    }
  );
  return result.seq;
}

/**
 * Obtains the next globally monotonic fencing token.
 * 
 * Strategy:
 * 1. If redisClient (or in-memory store) is provided:
 *    - Executes Lua upper-bound generation script.
 *    - If uninitialized or block exhausted: reserves next block from MongoDB Counter, installs it via Lua, and returns token.
 * 2. If redisClient is NOT provided (direct MongoDB fallback):
 *    - Increments MongoDB Counter by 1 with majority write concern.
 */
async function getNextFencingToken({
  redisClient = null,
  counterModel = Counter,
  blockSize = DEFAULT_BLOCK_SIZE,
  maxRetries = 5,
} = {}) {
  // Path A: Accelerated Redis/In-Memory Sequence with Lua Upper Bound
  if (redisClient) {
    const keySequence = "auth:fencing_sequence";
    const keyUpper = "auth:fencing_upper_bound";
    const keyRunId = "auth:fencing_run_id";

    // Durability Check 1: Detect Redis failover / restart (server run_id changed)
    const activeRunId = await getRedisRunId(redisClient);
    if (activeRunId) {
      const storedRunId = await redisClient.get(keyRunId);
      if (storedRunId && storedRunId !== activeRunId) {
        // Redis has restarted or failed over to another instance/replica.
        // Stale in-memory keys from prior instance cannot be trusted -> discard them
        if (typeof redisClient.del === "function") {
          await redisClient.del(keySequence);
          await redisClient.del(keyUpper);
        }
      }
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      let token = await redisClient.eval(LUA_GENERATE_FENCING_TOKEN, 2, keySequence, keyUpper);

      if (token > 0) {
        return token;
      }

      // Token <= 0 indicates uninitialized (-1) or block exhausted/invalid (0)
      // Synchronously reserve new block from MongoDB
      const targetUpper = await reserveNextBlockFromMongo(counterModel, blockSize);

      // Atomically install new upper bound in Redis
      await redisClient.eval(LUA_INSTALL_FENCING_BLOCK, 2, keySequence, keyUpper, targetUpper, blockSize);
      if (activeRunId) {
        await redisClient.set(keyRunId, activeRunId);
      }

      // Re-attempt generation
      token = await redisClient.eval(LUA_GENERATE_FENCING_TOKEN, 2, keySequence, keyUpper, blockSize);

      if (token > 0) {
        return token;
      }
    }

    throw new AppError("Failed to issue fencing token after block reservation", 500, "SEQUENCE_ERROR");
  }

  // Path B: Standalone MongoDB Direct Majority Increment Fallback
  const result = await counterModel.findOneAndUpdate(
    { _id: FENCING_SEQUENCE_ID },
    { $inc: { seq: 1 } },
    {
      upsert: true,
      returnDocument: "after",
      writeConcern: { w: "majority" },
    }
  );

  return result.seq;
}

module.exports = {
  getNextFencingToken,
  reserveNextBlockFromMongo,
  createInMemoryFencingStore,
  LUA_GENERATE_FENCING_TOKEN,
  LUA_INSTALL_FENCING_BLOCK,
  FENCING_SEQUENCE_ID,
  DEFAULT_BLOCK_SIZE,
};
