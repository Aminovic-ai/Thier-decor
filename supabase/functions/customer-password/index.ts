// Internal PBKDF2 service for Thier Décor customer credentials.
// Requests use the Supabase secret API key at the gateway and a separate shared
// internal secret between this function and the Cloudflare Worker. The shared
// secret is never exposed to browsers.
const encoder = new TextEncoder();

function constantTimeSecretEqual(actual: string, expected: string): boolean {
  let diff = actual.length ^ expected.length;
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    diff |= (actual.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0 && actual.length > 0;
}

function hasInternalServiceSecret(request: Request): boolean {
  const expected = Deno.env.get("CUSTOMER_PASSWORD_SERVICE_SECRET") || "";
  const supplied = request.headers.get("x-td-internal-key") || "";
  return expected.length >= 32 && constantTimeSecretEqual(supplied, expected);
}

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[a-f0-9]{2})+$/i.test(hex)) throw new Error("Invalid salt");
  return Uint8Array.from(hex.match(/.{2}/g)!, (part) => Number.parseInt(part, 16));
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function derive(value: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(value),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  // verify_jwt is disabled because sb_secret_* is not a JWT. Authenticate the
  // Worker independently with a high-entropy shared secret stored as a function secret.
  if (!hasInternalServiceSecret(request)) return json({ success: false, error: "Forbidden" }, 403);

  try {
    const body = await request.json();
    if (!body || typeof body !== "object") return json({ success: false, error: "Invalid request" }, 400);

    if (body.action === "hash") {
      const value = body.value;
      const iterations = body.iterations;
      if (typeof value !== "string" || value.length < 1 || value.length > 1024) {
        return json({ success: false, error: "Invalid password value" }, 400);
      }
      // New credentials retain the existing serialized format and work factor.
      if (iterations !== 310000) return json({ success: false, error: "Unsupported work factor" }, 400);
      const salt = body.salt == null
        ? crypto.getRandomValues(new Uint8Array(16))
        : hexToBytes(String(body.salt));
      if (salt.length !== 16) return json({ success: false, error: "Invalid salt length" }, 400);

      const derived = await derive(value, salt, iterations);
      return json({ success: true, hash: `pbkdf2$${iterations}$${bytesToHex(salt)}$${derived}` });
    }

    if (body.action === "verify") {
      const stored = body.stored;
      const supplied = body.supplied;
      if (typeof stored !== "string" || typeof supplied !== "string" || supplied.length > 1024) {
        return json({ success: false, error: "Invalid verification request" }, 400);
      }
      const parts = stored.split("$");
      if (parts.length !== 4 || parts[0] !== "pbkdf2") {
        return json({ success: false, error: "Invalid stored hash" }, 400);
      }
      const iterations = Number(parts[1]);
      if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) {
        return json({ success: false, error: "Unsupported stored work factor" }, 400);
      }
      const salt = hexToBytes(parts[2]);
      if (salt.length !== 16 || !/^[a-f0-9]{64}$/i.test(parts[3])) {
        return json({ success: false, error: "Invalid stored hash format" }, 400);
      }
      const candidate = `pbkdf2$${iterations}$${parts[2].toLowerCase()}$${await derive(supplied, salt, iterations)}`;
      return json({ success: true, valid: constantTimeEqual(candidate, stored.toLowerCase()) });
    }

    return json({ success: false, error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Customer password function failed:", error);
    return json({ success: false, error: "Password operation failed" }, 500);
  }
});
