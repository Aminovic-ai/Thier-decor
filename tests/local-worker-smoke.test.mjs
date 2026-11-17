import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const config = new URL("../wrangler.test.toml", import.meta.url);
const repoRoot = new URL("../", import.meta.url);

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

test("Worker runs locally with isolated config and fails closed without credentials", async () => {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn("npx", [
    "--yes", "wrangler@4.135.0", "dev",
    "--config", config.pathname,
    "--ip", "127.0.0.1",
    "--port", String(port),
    "--log-level", "error"
  ], {
    cwd: new URL(repoRoot).pathname,
    env: { ...process.env, CI: "1", NO_UPDATE_NOTIFIER: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); });

  try {
    let health;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null) {
        throw new Error(`Wrangler exited early (${child.exitCode}):\n${logs}`);
      }
      try {
        health = await fetch(origin + "/", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "health" })
        });
        break;
      } catch {
        await delay(500);
      }
    }

    assert.ok(health, `Local Worker did not start. Wrangler output:\n${logs}`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("Access-Control-Allow-Origin"), origin);
    assert.match(health.headers.get("Cache-Control") || "", /no-store/);
    assert.deepEqual(await health.json(), {
      success: true, service: "thier-decor-api-v2", version: 2
    });

    const unauthorized = await fetch(origin + "/", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "listOrders" })
    });
    assert.equal(unauthorized.status, 401, "admin routes must reject missing Firebase credentials");

    const customer = await fetch(origin + "/", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "customerData" })
    });
    assert.equal(customer.status, 401, "customer routes must reject missing session credentials");

    const wrongOrigin = await fetch(origin + "/", {
      method: "POST",
      headers: { Origin: "https://untrusted.invalid", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "health" })
    });
    assert.equal(wrongOrigin.status, 403, "untrusted browser origins must be rejected");

    const preflight = await fetch(origin + "/", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise(resolve => child.once("exit", resolve)),
      delay(5000)
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
});
