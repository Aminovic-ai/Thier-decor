import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync, webcrypto } from "node:crypto";

test("WebCrypto PBKDF2-SHA256 output matches existing Node PBKDF2 format", async () => {
  const password = "ThierDecor-compatibility-test";
  const salt = Uint8Array.from({ length: 16 }, (_, i) => i);
  const iterations = 310000;

  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  const webCryptoHex = Buffer.from(bits).toString("hex");
  const nodeHex = pbkdf2Sync(password, Buffer.from(salt), iterations, 32, "sha256").toString("hex");

  assert.equal(webCryptoHex, nodeHex);
  assert.equal(webCryptoHex.length, 64);
});
