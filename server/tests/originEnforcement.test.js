/**
 * ConnectX Socket.IO Origin & CSWSH Enforcement Tests
 */
const { test, describe } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

describe("Socket.IO Strict Origin & CSWSH Enforcement Tests", () => {
  test("rejection of untrusted origin with 403 Forbidden", async () => {
    const res = await fetch("http://localhost:5000/socket.io/?EIO=4&transport=polling", {
      headers: {
        Origin: "http://malicious-site.com",
      },
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.code, 4);
    assert.match(body.message, /CORS_POLICY_VIOLATION/);
  });

  test("acceptance of trusted origin with 200 OK and session handshake", async () => {
    const res = await fetch("http://localhost:5000/socket.io/?EIO=4&transport=polling", {
      headers: {
        Origin: "http://localhost:3000",
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("access-control-allow-origin"), "http://localhost:3000");
    const text = await res.text();
    assert.match(text, /sid/);
  });
});
