/**
 * ConnectX Module 2: Token Utilities & Cryptographic Primitives Unit & Integration Tests
 * Uses Node.js native test runner (node:test and node:assert)
 */
const { test, describe } = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");

const {
  signAccessToken,
  verifyAccessToken,
  decodeToken,
  ISSUER,
  AUDIENCE,
} = require("../utils/jwtUtils");

const {
  hashToken,
  generateRefreshToken,
  generateSignedCsrfToken,
  verifySignedCsrfToken,
  constantTimeEqual,
} = require("../utils/cryptoUtils");

const {
  getNextFencingToken,
  createInMemoryFencingStore,
  LUA_INSTALL_FENCING_BLOCK,
} = require("../utils/fencingSequence");

const TEST_SECRET = "test_super_secret_key_at_least_32_characters_long_123456789";
const TEST_CSRF_SECRET = "test_csrf_secret_key_at_least_32_characters_long_987654321";

describe("ConnectX Module 2: Token Utilities & Cryptographic Primitives Tests", () => {
  // -------------------------------------------------------------------------
  // 1. RFC 7519 JWT Signing and Verification Tests
  // -------------------------------------------------------------------------
  describe("RFC 7519 JWT Utilities", () => {
    test("signs valid access token with standard RFC 7519 claims", () => {
      const token = signAccessToken({
        userId: "65b9e1234567890abcdef123",
        familyId: "fam_a1b2c3d4e5f6g7h8",
        secretOverride: TEST_SECRET,
      });

      assert.strictEqual(typeof token, "string");
      const decoded = decodeToken(token);

      assert.strictEqual(decoded.sub, "65b9e1234567890abcdef123");
      assert.strictEqual(decoded.familyId, "fam_a1b2c3d4e5f6g7h8");
      assert.strictEqual(decoded.iss, ISSUER);
      assert.strictEqual(decoded.aud, AUDIENCE);
      assert.ok(decoded.exp > decoded.iat);
    });

    test("verifies valid access token and returns decoded payload", () => {
      const token = signAccessToken({
        userId: "user_valid_456",
        familyId: "fam_valid_789",
        secretOverride: TEST_SECRET,
      });

      const payload = verifyAccessToken(token, TEST_SECRET);
      assert.strictEqual(payload.sub, "user_valid_456");
      assert.strictEqual(payload.familyId, "fam_valid_789");
      assert.strictEqual(payload.iss, "connectx-api");
      assert.strictEqual(payload.aud, "connectx-client");
    });

    test("rejects tampered token signature with TOKEN_INVALID", () => {
      const token = signAccessToken({
        userId: "user_tamper",
        familyId: "fam_tamper",
        secretOverride: TEST_SECRET,
      });

      // Tamper with signature portion
      const parts = token.split(".");
      const tamperedSig = parts[2].slice(0, -4) + (parts[2].endsWith("abcd") ? "ef01" : "abcd");
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

      assert.throws(
        () => verifyAccessToken(tamperedToken, TEST_SECRET),
        (err) => {
          assert.strictEqual(err.code, "TOKEN_INVALID");
          assert.strictEqual(err.statusCode, 401);
          return true;
        }
      );
    });

    test("rejects token signed with unauthorized secret", () => {
      const wrongSecret = "wrong_unauthorized_secret_key_at_least_32_chars_long";
      const token = signAccessToken({
        userId: "user_secret",
        familyId: "fam_secret",
        secretOverride: wrongSecret,
      });

      assert.throws(
        () => verifyAccessToken(token, TEST_SECRET),
        (err) => {
          assert.strictEqual(err.code, "TOKEN_INVALID");
          return true;
        }
      );
    });

    test("rejects expired access token with AUTH_EXPIRED", () => {
      // Create a token that expired 10 seconds ago
      const token = jwt.sign(
        { sub: "user_expired", familyId: "fam_expired" },
        TEST_SECRET,
        {
          issuer: ISSUER,
          audience: AUDIENCE,
          expiresIn: "-10s",
        }
      );

      assert.throws(
        () => verifyAccessToken(token, TEST_SECRET),
        (err) => {
          assert.strictEqual(err.code, "AUTH_EXPIRED");
          assert.strictEqual(err.statusCode, 401);
          return true;
        }
      );
    });

    test("rejects token with missing mandatory claims (sub or familyId)", () => {
      const incompleteToken = jwt.sign(
        { sub: "user_only" }, // Missing familyId
        TEST_SECRET,
        {
          issuer: ISSUER,
          audience: AUDIENCE,
          expiresIn: "15m",
        }
      );

      assert.throws(
        () => verifyAccessToken(incompleteToken, TEST_SECRET),
        (err) => {
          assert.strictEqual(err.code, "TOKEN_MALFORMED");
          return true;
        }
      );
    });

    test("rejects token with mismatched issuer or audience", () => {
      const badAudienceToken = jwt.sign(
        { sub: "user_bad_aud", familyId: "fam_bad" },
        TEST_SECRET,
        {
          issuer: ISSUER,
          audience: "wrong-client",
          expiresIn: "15m",
        }
      );

      assert.throws(
        () => verifyAccessToken(badAudienceToken, TEST_SECRET),
        (err) => {
          assert.strictEqual(err.code, "TOKEN_INVALID");
          return true;
        }
      );
    });

    test("rejects token with unapproved algorithm or alg: none (strict algorithm allowlisting)", () => {
      // 1. Test token with alg: HS512 (not in allowlist ['HS256'])
      const hs512Token = jwt.sign(
        { sub: "user_hs512", familyId: "fam_hs512" },
        TEST_SECRET,
        {
          algorithm: "HS512",
          issuer: ISSUER,
          audience: AUDIENCE,
          expiresIn: "15m",
        }
      );

      assert.throws(
        () => verifyAccessToken(hs512Token, TEST_SECRET),
        (err) => {
          assert.strictEqual(err.code, "TOKEN_INVALID");
          assert.match(err.message, /invalid algorithm/i);
          return true;
        }
      );

      // 2. Test token with alg: none attack
      const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const nonePayload = Buffer.from(
        JSON.stringify({ sub: "user_none", familyId: "fam_none", iss: ISSUER, aud: AUDIENCE, exp: Math.floor(Date.now() / 1000) + 900 })
      ).toString("base64url");
      const noneToken = `${noneHeader}.${nonePayload}.`;

      assert.throws(
        () => verifyAccessToken(noneToken, TEST_SECRET),
        (err) => {
          assert.strictEqual(err.code, "TOKEN_INVALID");
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. SHA-256 Refresh-Token Hashing Tests
  // -------------------------------------------------------------------------
  describe("SHA-256 Token Hashing", () => {
    test("hashToken generates consistent SHA-256 lowercase hex hash", () => {
      const input = "test_raw_bearer_token_string_12345";
      const hash1 = hashToken(input);
      const hash2 = hashToken(input);

      assert.strictEqual(typeof hash1, "string");
      assert.strictEqual(hash1.length, 64);
      assert.strictEqual(hash1, hash2);
      assert.match(hash1, /^[a-f0-9]{64}$/);
    });

    test("generateRefreshToken produces high-entropy distinct tokens with valid hashes", () => {
      const token1 = generateRefreshToken();
      const token2 = generateRefreshToken();

      assert.strictEqual(typeof token1.rawToken, "string");
      assert.strictEqual(token1.rawToken.length, 64); // 32 bytes in hex = 64 chars
      assert.strictEqual(token1.tokenHash, hashToken(token1.rawToken));

      assert.notStrictEqual(token1.rawToken, token2.rawToken);
      assert.notStrictEqual(token1.tokenHash, token2.tokenHash);
    });

    test("hashToken throws on invalid or empty input", () => {
      assert.throws(() => hashToken(""), (err) => err.code === "CRYPTO_ERROR");
      assert.throws(() => hashToken(null), (err) => err.code === "CRYPTO_ERROR");
    });
  });

  // -------------------------------------------------------------------------
  // 3. HMAC-SHA256 Signed CSRF Double-Submit Verification Tests
  // -------------------------------------------------------------------------
  describe("HMAC-SHA256 Signed CSRF Double-Submit", () => {
    test("generates valid signed CSRF token pair (T and T.S)", () => {
      const { csrfToken, signedCookieValue } = generateSignedCsrfToken(TEST_CSRF_SECRET);

      assert.strictEqual(typeof csrfToken, "string");
      assert.strictEqual(csrfToken.length, 64); // 32 bytes in hex

      const parts = signedCookieValue.split(".");
      assert.strictEqual(parts.length, 2);
      assert.strictEqual(parts[0], csrfToken);
      assert.strictEqual(parts[1].length, 64); // HMAC-SHA256 signature is 64 hex characters
    });

    test("verifies valid matching CSRF header and signed cookie", () => {
      const { csrfToken, signedCookieValue } = generateSignedCsrfToken(TEST_CSRF_SECRET);
      const isValid = verifySignedCsrfToken(csrfToken, signedCookieValue, TEST_CSRF_SECRET);
      assert.strictEqual(isValid, true);
    });

    test("rejects missing header token with CSRF_MISSING", () => {
      const { signedCookieValue } = generateSignedCsrfToken(TEST_CSRF_SECRET);
      assert.throws(
        () => verifySignedCsrfToken(null, signedCookieValue, TEST_CSRF_SECRET),
        (err) => err.code === "CSRF_MISSING" && err.statusCode === 403
      );
    });

    test("rejects missing cookie with CSRF_MISSING", () => {
      assert.throws(
        () => verifySignedCsrfToken("valid_header_token", null, TEST_CSRF_SECRET),
        (err) => err.code === "CSRF_MISSING" && err.statusCode === 403
      );
    });

    test("rejects malformed cookie format with CSRF_INVALID_FORMAT", () => {
      assert.throws(
        () => verifySignedCsrfToken("header_token", "single_part_token_without_dot", TEST_CSRF_SECRET),
        (err) => err.code === "CSRF_INVALID_FORMAT"
      );
      assert.throws(
        () => verifySignedCsrfToken("header_token", "part1.part2.part3", TEST_CSRF_SECRET),
        (err) => err.code === "CSRF_INVALID_FORMAT"
      );
    });

    test("rejects tampered cookie signature with CSRF_SIGNATURE_INVALID", () => {
      const { csrfToken, signedCookieValue } = generateSignedCsrfToken(TEST_CSRF_SECRET);
      const [token, sig] = signedCookieValue.split(".");
      // Tamper with signature
      const tamperedSig = sig.slice(0, -4) + "0000";
      const tamperedCookie = `${token}.${tamperedSig}`;

      assert.throws(
        () => verifySignedCsrfToken(csrfToken, tamperedCookie, TEST_CSRF_SECRET),
        (err) => err.code === "CSRF_SIGNATURE_INVALID" && err.statusCode === 403
      );
    });

    test("rejects token signed with untrusted secret key (cookie-injection defense)", () => {
      const attackerSecret = "attacker_forged_secret_key_at_least_32_characters_1";
      const { csrfToken, signedCookieValue } = generateSignedCsrfToken(attackerSecret);

      assert.throws(
        () => verifySignedCsrfToken(csrfToken, signedCookieValue, TEST_CSRF_SECRET),
        (err) => err.code === "CSRF_SIGNATURE_INVALID"
      );
    });

    test("rejects mismatched header token vs valid signed cookie token with CSRF_MISMATCH", () => {
      const pair1 = generateSignedCsrfToken(TEST_CSRF_SECRET);
      const pair2 = generateSignedCsrfToken(TEST_CSRF_SECRET);

      // Present header from pair1, but cookie from pair2
      assert.throws(
        () => verifySignedCsrfToken(pair1.csrfToken, pair2.signedCookieValue, TEST_CSRF_SECRET),
        (err) => err.code === "CSRF_MISMATCH" && err.statusCode === 403
      );
    });

    test("constant-time CSRF verification safely handles inputs of differing lengths without throwing RangeError", () => {
      // 1. Direct constantTimeEqual verification
      assert.strictEqual(constantTimeEqual("short", "much_longer_string_value"), false);
      assert.strictEqual(constantTimeEqual("exact_match_123", "exact_match_123"), true);
      assert.strictEqual(constantTimeEqual("", "non_empty"), false);
      assert.strictEqual(constantTimeEqual(null, "str"), false);

      // 2. verifySignedCsrfToken with truncated header token
      const { csrfToken, signedCookieValue } = generateSignedCsrfToken(TEST_CSRF_SECRET);
      const truncatedHeader = csrfToken.slice(0, 10); // Length 10 vs 64

      assert.throws(
        () => verifySignedCsrfToken(truncatedHeader, signedCookieValue, TEST_CSRF_SECRET),
        (err) => {
          // Must cleanly produce CSRF_MISMATCH and NOT throw unhandled RangeError
          assert.strictEqual(err.code, "CSRF_MISMATCH");
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Monotonic Fencing Sequence Generator Tests
  // -------------------------------------------------------------------------
  describe("Monotonic Fencing Sequence Generator", () => {
    test("in-memory accelerated store issues strictly increasing sequence tokens", async () => {
      const inMemoryRedis = createInMemoryFencingStore();
      let mockDbCounter = 0;

      const mockCounterModel = {
        async findOneAndUpdate(query, update) {
          mockDbCounter += update.$inc.seq;
          return { _id: query._id, seq: mockDbCounter };
        },
      };

      const t1 = await getNextFencingToken({
        redisClient: inMemoryRedis,
        counterModel: mockCounterModel,
        blockSize: 100,
      });

      const t2 = await getNextFencingToken({
        redisClient: inMemoryRedis,
        counterModel: mockCounterModel,
        blockSize: 100,
      });

      const t3 = await getNextFencingToken({
        redisClient: inMemoryRedis,
        counterModel: mockCounterModel,
        blockSize: 100,
      });

      assert.strictEqual(t1, 1);
      assert.strictEqual(t2, 2);
      assert.strictEqual(t3, 3);
      assert.ok(t3 > t2 && t2 > t1);
    });

    test("automatically reserves next block from MongoDB when block is exhausted", async () => {
      const inMemoryRedis = createInMemoryFencingStore();
      let mockDbCounter = 0;

      const mockCounterModel = {
        async findOneAndUpdate(query, update) {
          mockDbCounter += update.$inc.seq;
          return { _id: query._id, seq: mockDbCounter };
        },
      };

      // Set tiny block size of 3 to test boundary exhaustion
      const blockSize = 3;

      const t1 = await getNextFencingToken({ redisClient: inMemoryRedis, counterModel: mockCounterModel, blockSize });
      const t2 = await getNextFencingToken({ redisClient: inMemoryRedis, counterModel: mockCounterModel, blockSize });
      const t3 = await getNextFencingToken({ redisClient: inMemoryRedis, counterModel: mockCounterModel, blockSize });

      assert.strictEqual(t1, 1);
      assert.strictEqual(t2, 2);
      assert.strictEqual(t3, 3);

      // 4th token exhausts block (upper bound was 3) -> should reserve next block (upper bound 6)
      const t4 = await getNextFencingToken({ redisClient: inMemoryRedis, counterModel: mockCounterModel, blockSize });
      assert.strictEqual(t4, 4);
      assert.strictEqual(mockDbCounter, 6);
    });

    test("Lua script prevents sequence regression when installing block", () => {
      const inMemoryRedis = createInMemoryFencingStore();
      const keySeq = "auth:fencing_sequence";
      const keyUpper = "auth:fencing_upper_bound";

      // Initialize with upper bound 10000 and current sequence 5000
      inMemoryRedis.set(keyUpper, 10000);
      inMemoryRedis.set(keySeq, 5000);

      // Attempt to install a lower baseline (e.g. 8000)
      const result = inMemoryRedis.eval(LUA_INSTALL_FENCING_BLOCK, 2, keySeq, keyUpper, 8000, 2000);
      assert.strictEqual(result, 0); // Must be rejected!

      // Upper bound remains 10000
      assert.strictEqual(inMemoryRedis.get(keyUpper), "10000");
    });

    test("direct MongoDB counter fallback issues monotonic tokens when Redis is absent", async () => {
      let mockSeq = 100;
      const mockCounterModel = {
        async findOneAndUpdate(query, update) {
          mockSeq += update.$inc.seq;
          return { _id: query._id, seq: mockSeq };
        },
      };

      const t1 = await getNextFencingToken({ redisClient: null, counterModel: mockCounterModel });
      const t2 = await getNextFencingToken({ redisClient: null, counterModel: mockCounterModel });
      const t3 = await getNextFencingToken({ redisClient: null, counterModel: mockCounterModel });

      assert.strictEqual(t1, 101);
      assert.strictEqual(t2, 102);
      assert.strictEqual(t3, 103);
    });

    test("concurrent token requests receive distinct strictly monotonic tokens", async () => {
      const inMemoryRedis = createInMemoryFencingStore();
      let mockDbCounter = 0;
      const mockCounterModel = {
        async findOneAndUpdate(query, update) {
          mockDbCounter += update.$inc.seq;
          return { _id: query._id, seq: mockDbCounter };
        },
      };

      // Launch 50 concurrent requests
      const promises = Array.from({ length: 50 }, () =>
        getNextFencingToken({ redisClient: inMemoryRedis, counterModel: mockCounterModel, blockSize: 20 })
      );

      const tokens = await Promise.all(promises);
      const uniqueTokens = new Set(tokens);

      // Verify all 50 tokens are unique
      assert.strictEqual(uniqueTokens.size, 50);

      // Verify min is 1 and max is 50
      assert.strictEqual(Math.min(...tokens), 1);
      assert.strictEqual(Math.max(...tokens), 50);
    });

    test("delayed worker resuming after a long pause cannot issue a lower token than already issued", async () => {
      const sharedRedis = createInMemoryFencingStore();
      let mockDbCounter = 0;
      const mockCounterModel = {
        async findOneAndUpdate(query, update) {
          mockDbCounter += update.$inc.seq;
          return { _id: query._id, seq: mockDbCounter };
        },
      };

      // Worker A starts and issues token 1
      const tokenA1 = await getNextFencingToken({
        redisClient: sharedRedis,
        counterModel: mockCounterModel,
        blockSize: 100,
      });
      assert.strictEqual(tokenA1, 1);

      // Worker A pauses/stalls...
      // Meanwhile, Worker B issues tokens 2 through 25
      const workerBTokens = [];
      for (let i = 0; i < 24; i++) {
        const tokenB = await getNextFencingToken({
          redisClient: sharedRedis,
          counterModel: mockCounterModel,
          blockSize: 100,
        });
        workerBTokens.push(tokenB);
      }
      assert.strictEqual(workerBTokens[0], 2);
      assert.strictEqual(workerBTokens[workerBTokens.length - 1], 25);

      // Worker A now resumes and requests its next token
      const tokenA2 = await getNextFencingToken({
        redisClient: sharedRedis,
        counterModel: mockCounterModel,
        blockSize: 100,
      });

      // Proof of Monotonicity: Worker A MUST receive token 26 > 25.
      // It can NEVER receive a token <= 25 from its earlier state.
      assert.strictEqual(tokenA2, 26);
      assert.ok(tokenA2 > workerBTokens[workerBTokens.length - 1]);
    });

    test("delayed worker attempting to install an older reserved block cannot regress sequence or upper bound", async () => {
      const sharedRedis = createInMemoryFencingStore();
      const keySeq = "auth:fencing_sequence";
      const keyUpper = "auth:fencing_upper_bound";

      // Initialize store at block upper bound 100, sequence at 100 (block exhausted)
      sharedRedis.set(keyUpper, 100);
      sharedRedis.set(keySeq, 100);

      // Worker 1 reserves next block (upper bound 200, blockSize 100)
      const worker1Upper = 200;

      // Worker 2 concurrently reserves next block (upper bound 300, blockSize 100)
      const worker2Upper = 300;

      // Worker 2 finishes faster and installs upper bound 300
      const install2Result = sharedRedis.eval(LUA_INSTALL_FENCING_BLOCK, 2, keySeq, keyUpper, worker2Upper, 100);
      assert.strictEqual(install2Result, 1);
      assert.strictEqual(sharedRedis.get(keyUpper), "300");

      // Worker 2 advances the sequence by issuing tokens 101, 102, 103
      sharedRedis.set(keySeq, 103);

      // Delayed Worker 1 now arrives and tries to install its older block (upper bound 200)
      const install1Result = sharedRedis.eval(LUA_INSTALL_FENCING_BLOCK, 2, keySeq, keyUpper, worker1Upper, 100);

      // Invariant: Lua script MUST reject Worker 1's older block installation
      assert.strictEqual(install1Result, 0);

      // Upper bound remains at 300, sequence remains at 103 (no regression)
      assert.strictEqual(sharedRedis.get(keyUpper), "300");
      assert.strictEqual(sharedRedis.get(keySeq), "103");

      // Next token issued is 104 > 103
      const mockCounterModel = {
        async findOneAndUpdate() {
          throw new Error("Should not call DB since upper bound 300 is active");
        },
      };
      const nextToken = await getNextFencingToken({
        redisClient: sharedRedis,
        counterModel: mockCounterModel,
        blockSize: 100,
      });
      assert.strictEqual(nextToken, 104);
    });

    test("monotonicity across Redis outage failover to MongoDB and subsequent Redis recovery handoff", async () => {
      let authoritativeMongoSeq = 0;
      const mockCounterModel = {
        async findOneAndUpdate(query, update) {
          authoritativeMongoSeq += update.$inc.seq;
          return { _id: query._id, seq: authoritativeMongoSeq };
        },
      };

      // Phase 1: Redis is active. Reserves block 1..10000.
      const redisInstance1 = createInMemoryFencingStore();
      const blockSize = 10000;

      const t1 = await getNextFencingToken({ redisClient: redisInstance1, counterModel: mockCounterModel, blockSize });
      const t2 = await getNextFencingToken({ redisClient: redisInstance1, counterModel: mockCounterModel, blockSize });
      assert.strictEqual(t1, 1);
      assert.strictEqual(t2, 2);
      assert.strictEqual(authoritativeMongoSeq, 10000); // 10,000 reserved in MongoDB

      // Phase 2: Redis suffers an outage (redisClient becomes null)
      // Workers fall back directly to MongoDB standalone mode ($inc: 1)
      const t3 = await getNextFencingToken({ redisClient: null, counterModel: mockCounterModel });
      const t4 = await getNextFencingToken({ redisClient: null, counterModel: mockCounterModel });

      // Because MongoDB seq was 10000, fallback tokens are 10001, 10002
      assert.strictEqual(t3, 10001);
      assert.strictEqual(t4, 10002);
      // Invariant: t3 > t2 (10001 > 2) - strictly monotonic across outage failover!
      assert.ok(t3 > t2);

      // Phase 3: Redis recovers (restarted clean state)
      const redisInstance2 = createInMemoryFencingStore();

      // First token through recovered Redis reserves new block from MongoDB (10002 + 10000 = 20002)
      // Base becomes 20002 - 10000 = 10002
      // Sequence resumes from 10003
      const t5 = await getNextFencingToken({ redisClient: redisInstance2, counterModel: mockCounterModel, blockSize });
      const t6 = await getNextFencingToken({ redisClient: redisInstance2, counterModel: mockCounterModel, blockSize });

      assert.strictEqual(t5, 10003);
      assert.strictEqual(t6, 10004);
      // Invariant: t5 > t4 (10003 > 10002) - strictly monotonic across recovery!
      assert.ok(t5 > t4);
      assert.strictEqual(authoritativeMongoSeq, 20002);
    });

    test("Redis sequence-key loss: new worker resumes and generates strictly higher token than prior tokens", async () => {
      const sharedRedis = createInMemoryFencingStore();
      let mockDbCounter = 0;
      const mockCounterModel = {
        async findOneAndUpdate(query, update) {
          mockDbCounter += update.$inc.seq;
          return { _id: query._id, seq: mockDbCounter };
        },
        async findOne(query) {
          return { _id: query._id, seq: mockDbCounter };
        },
      };

      // Worker 1 issues tokens 1 through 50
      let lastToken = 0;
      for (let i = 0; i < 50; i++) {
        lastToken = await getNextFencingToken({
          redisClient: sharedRedis,
          counterModel: mockCounterModel,
          blockSize: 10000,
        });
      }
      assert.strictEqual(lastToken, 50);
      assert.strictEqual(mockDbCounter, 10000);

      // State loss: sequence keys in Redis are lost / deleted / flushed
      sharedRedis.del("auth:fencing_sequence");
      sharedRedis.del("auth:fencing_upper_bound");

      // New Worker 2 resumes token generation
      const worker2Token = await getNextFencingToken({
        redisClient: sharedRedis,
        counterModel: mockCounterModel,
        blockSize: 10000,
      });

      // Proof: Worker 2 MUST receive 10001, which is strictly > 50
      assert.strictEqual(worker2Token, 10001);
      assert.ok(worker2Token > lastToken);
      assert.strictEqual(mockDbCounter, 20000);
    });

    test("Redis snapshot rollback to older block: new worker resumes and generates strictly higher token", async () => {
      const sharedRedis = createInMemoryFencingStore();
      let mockDbCounter = 0;
      const mockCounterModel = {
        async findOneAndUpdate(query, update) {
          mockDbCounter += update.$inc.seq;
          return { _id: query._id, seq: mockDbCounter };
        },
        async findOne(query) {
          return { _id: query._id, seq: mockDbCounter };
        },
      };

      // Worker 1 issues tokens into Block 1 (upper 100) and advances to Block 2 (upper 200)
      let highestIssuedToken = 0;
      for (let i = 0; i < 150; i++) {
        highestIssuedToken = await getNextFencingToken({
          redisClient: sharedRedis,
          counterModel: mockCounterModel,
          blockSize: 100,
        });
      }
      assert.strictEqual(highestIssuedToken, 150);
      assert.strictEqual(mockDbCounter, 200);

      // Simulate Redis persistence rollback to older Block 1 snapshot on restart:
      // When Redis restarts with an older snapshot, the server process generates a new run_id
      sharedRedis.restart("restored_snapshot_run_id_456");
      sharedRedis.set("auth:fencing_upper_bound", 100);
      sharedRedis.set("auth:fencing_sequence", 50);

      // New Worker 2 resumes token generation
      const worker2Token = await getNextFencingToken({
        redisClient: sharedRedis,
        counterModel: mockCounterModel,
        blockSize: 100,
      });

      // Proof: Worker 2 detects Redis restarted with stale snapshot,
      // invalidates stale keys, reserves Block 3 (300), and issues 201 > 150!
      assert.strictEqual(worker2Token, 201);
      assert.ok(worker2Token > highestIssuedToken);
      assert.strictEqual(mockDbCounter, 300);
    });

    test("Redis restart / replica failover (run_id changed): new worker resumes and generates strictly higher token", async () => {
      const sharedRedis = createInMemoryFencingStore();
      let mockDbCounter = 0;
      const mockCounterModel = {
        async findOneAndUpdate(query, update) {
          mockDbCounter += update.$inc.seq;
          return { _id: query._id, seq: mockDbCounter };
        },
        async findOne(query) {
          return { _id: query._id, seq: mockDbCounter };
        },
      };

      // Worker 1 issues tokens 1 through 50
      let lastToken = 0;
      for (let i = 0; i < 50; i++) {
        lastToken = await getNextFencingToken({
          redisClient: sharedRedis,
          counterModel: mockCounterModel,
          blockSize: 10000,
        });
      }
      assert.strictEqual(lastToken, 50);

      // Simulate Redis crash & restart or replica failover:
      // The server instance run_id changes. Even if old in-memory snapshot was present at sequence 20:
      sharedRedis.restart("promoted_replica_run_id_999");
      sharedRedis.set("auth:fencing_sequence", 20);

      // New Worker 2 resumes token generation
      const worker2Token = await getNextFencingToken({
        redisClient: sharedRedis,
        counterModel: mockCounterModel,
        blockSize: 10000,
      });

      // Proof: Run_id mismatch causes stale sequence to be discarded, reserving Block 2 (20000)
      // Worker 2 receives 10001, which is strictly > 50!
      assert.strictEqual(worker2Token, 10001);
      assert.ok(worker2Token > lastToken);
      assert.strictEqual(mockDbCounter, 20000);
    });

    test("Redis sequence rollback below block baseline is rejected by Lua and forced to advance", async () => {
      const sharedRedis = createInMemoryFencingStore();
      let mockDbCounter = 0;
      const mockCounterModel = {
        async findOneAndUpdate(query, update) {
          mockDbCounter += update.$inc.seq;
          return { _id: query._id, seq: mockDbCounter };
        },
        async findOne(query) {
          return { _id: query._id, seq: mockDbCounter };
        },
      };

      // Issue tokens across Block 1 (100) and into Block 2 (200)
      for (let i = 0; i < 120; i++) {
        await getNextFencingToken({
          redisClient: sharedRedis,
          counterModel: mockCounterModel,
          blockSize: 100,
        });
      }
      assert.strictEqual(mockDbCounter, 200);

      // Simulate partial state rollback on restart / replica failover:
      sharedRedis.restart("replica_failover_run_id_789");
      sharedRedis.set("auth:fencing_sequence", 50);

      // Worker requests token
      const nextToken = await getNextFencingToken({
        redisClient: sharedRedis,
        counterModel: mockCounterModel,
        blockSize: 100,
      });

      // Proof: Run_id mismatch discards stale sequence, forces fresh reservation (300), issues 201 > 120!
      assert.strictEqual(nextToken, 201);
      assert.ok(nextToken > 120);
      assert.strictEqual(mockDbCounter, 300);
    });
  });
});
