import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2 } from "node:crypto";
import { webcrypto } from "node:crypto";

const deriveWithNodeCrypto = (password, salt, iterations) =>
  new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, 32, "sha256", (error, key) => {
      if (error) reject(error);
      else resolve(new Uint8Array(key));
    });
  });

test("node:crypto PBKDF2 matches WebCrypto PBKDF2-SHA256 at 310,000 iterations", async () => {
  const password = "ThierDecor compatibility test";
  const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
  const iterations = 310000;

  const nodeKey = await deriveWithNodeCrypto(password, salt, iterations);
  const imported = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const webKey = new Uint8Array(await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    imported,
    256
  ));

  assert.deepEqual(nodeKey, webKey);
  assert.equal(nodeKey.length, 32);
});
