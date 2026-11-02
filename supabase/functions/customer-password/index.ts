// Internal PBKDF2 service for Thier Décor customer credentials.
// Requests are authenticated by the Supabase Functions gateway (verify_jwt = true).
// The Cloudflare API Worker calls this endpoint with its server-side service-role key.
const encoder = new TextEncoder();

function hasServiceRoleClaim(request: Request): boolean {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payloadPart = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadPart + "=".repeat((4 - payloadPart.length % 4) % 4);
    const claims = JSON.parse(atob(padded));
    return claims?.role === "service_role";
  } catch {
    return false;
  }
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
  // The gateway validates the JWT signature; this additional claim check blocks anon/authenticated callers.
  if (!hasServiceRoleClaim(request)) return json({ success: false, error: "Forbidden" }, 403);

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
