import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workerSource = await readFile(new URL("../thier-decor-api.js", import.meta.url), "utf8");
const { default: worker } = await import(
  "data:text/javascript;base64," + Buffer.from(workerSource, "utf8").toString("base64")
);

const origin = "https://thierdecor.com";
const env = {
  SUPABASE_URL: "https://store.example",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  CUSTOMER_SESSION_SECRET: "test-customer-secret",
  ALLOWED_ORIGINS: origin
};

async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await run(); }
  finally { globalThis.fetch = original; }
}

async function customerToken(customerId = "customer-1") {
  const payload = {
    sub: customerId,
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.CUSTOMER_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  );
  return body + "." + Buffer.from(signature).toString("base64url");
}

test("public settings expose only storefront-safe custom price fields and are edge-cacheable", async () => {
  await withFetch(async () => new Response(JSON.stringify([{
    shopName: "Thier Décor",
    customPrices: {
      "9": { yalidine: { desk: "400", home: 500, internalNote: "private" }, secretCourier: { home: 99 } },
      __categoryOrder: ["résine", 42],
      __featuredProductIds: ["123456", "not-an-id"],
      __adminOnly: "must-not-leak"
    },
    coupons: ["PRIVATE-COUPON"],
    manualSalesAdjustment: 999
  }]), { status: 200, headers: { "Content-Type": "application/json" } }), async () => {
    const response = await worker.fetch(new Request("https://api.example/public/settings", {
      headers: { Origin: origin }
    }), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=30, stale-while-revalidate=300");
    assert.equal(response.headers.get("Cloudflare-CDN-Cache-Control"), "public, max-age=60, stale-while-revalidate=300");
    assert.equal(response.headers.get("Vary"), "Origin");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    const body = await response.json();
    assert.deepEqual(body.settings.customPrices, {
      "9": { yalidine: { desk: 400, home: 500 } },
      __categoryOrder: ["résine"],
      __featuredProductIds: ["123456"]
    });
    assert.equal("coupons" in body.settings, false);
    assert.equal("manualSalesAdjustment" in body.settings, false);
  });
});

test("public endpoints reject arbitrary query variants without contacting Supabase", async () => {
  await withFetch(async () => {
    throw new Error("Supabase must not be called for invalid query strings");
  }, async () => {
    for (const url of [
      "https://api.example/public/settings?x=1",
      "https://api.example/public/catalog?ids=1,2",
      "https://api.example/public/catalog?x=1",
      "https://api.example/public/catalog?all=2",
      "https://api.example/public/catalog?all=1&all=1"
    ]) {
      const response = await worker.fetch(new Request(url, { headers: { Origin: origin } }), env);
      assert.equal(response.status, 400, url);
      assert.match(response.headers.get("Cache-Control") || "", /no-store/);
    }
  });
});

test("guest catalog reads only the server-selected featured products and omits private columns", async () => {
  const calls = [];
  await withFetch(async input => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith("/settings")) {
      return new Response(JSON.stringify([{ customPrices: { __featuredProductIds: ["11", "22"] } }]), { status: 200 });
    }
    if (url.pathname.endsWith("/products")) {
      return new Response(JSON.stringify([{ id: 11, name: "Moule", price: 500, qty: 2, image_urls: [] }]), { status: 200 });
    }
    throw new Error("Unexpected Supabase request: " + url);
  }, async () => {
    const response = await worker.fetch(new Request("https://api.example/public/catalog", {
      headers: { Origin: origin }
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.products.map(product => product.id), [11]);
    const productCall = calls.find(url => url.pathname.endsWith("/products"));
    assert.ok(productCall);
    assert.match(productCall.searchParams.get("id"), /in\.\(11,22\)/);
    assert.ok(!productCall.searchParams.get("select").split(",").includes("cost"));
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=30, stale-while-revalidate=300");
  });
});

test("full catalog requires a valid customer session and is always private no-store", async () => {
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return new Response(JSON.stringify([{ id: 11, name: "Moule", price: 500, qty: 2 }]), { status: 200 });
  }, async () => {
    const guestResponse = await worker.fetch(new Request("https://api.example/public/catalog?all=1", {
      headers: { Origin: origin }
    }), env);
    assert.equal(guestResponse.status, 401);
    assert.match(guestResponse.headers.get("Cache-Control") || "", /no-store/);
    assert.equal(calls, 0);

    const token = await customerToken();
    const customerResponse = await worker.fetch(new Request("https://api.example/public/catalog?all=1", {
      headers: { Origin: origin, Authorization: "Bearer " + token }
    }), env);
    assert.equal(customerResponse.status, 200);
    assert.match(customerResponse.headers.get("Cache-Control") || "", /private/);
    assert.match(customerResponse.headers.get("Cache-Control") || "", /no-store/);
    assert.equal(calls, 1);
  });
});


test("admin product endpoint rejects requests without Firebase admin authentication", async () => {
  await withFetch(async () => {
    throw new Error("Supabase must not be called for unauthenticated admin requests");
  }, async () => {
    const response = await worker.fetch(new Request("https://api.example/", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adminListProducts" })
    }), env);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("Cache-Control") || "", /no-store/);
  });
});

test("disallowed browser origins are rejected before database access", async () => {
  await withFetch(async () => {
    throw new Error("Supabase must not be called for a disallowed origin");
  }, async () => {
    const response = await worker.fetch(new Request("https://api.example/public/catalog", {
      headers: { Origin: "https://attacker.example" }
    }), env);
    assert.equal(response.status, 403);
    assert.match(response.headers.get("Cache-Control") || "", /no-store/);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  });
});

test("every admin and POS action rejects unauthenticated requests before database access", async () => {
  const adminActions = [
    "listOrders", "adminListProducts", "listAdminData", "updateOrderStatus",
    "adminUpsertProduct", "adminDeleteProduct", "adminSetCustomerFlags",
    "adminDeleteCustomer", "adminReplyMessage", "adminDeleteMessage",
    "adminCreateExpense", "adminDeleteExpense", "adminUpdateSettings",
    "adminUpdateOrderTracking", "adminSetOrderPaid", "adminSetOrderFreeDelivery",
    "adminSetRequestStatus", "adminDeleteRequest", "adminCouponUsage",
    "adminMigrateLegacyImages", "adminNotifyCustomerProductAvailable",
    "adminCreateStoreSale", "adminListPOSSales", "adminGetPOSSaleInvoice",
    "adminRecoverPendingStoreSales", "adminDeleteOrder", "adminEditOrder",
    "adminVisitStats"
  ];

  await withFetch(async () => {
    throw new Error("Supabase must not be called for unauthenticated admin actions");
  }, async () => {
    for (const action of adminActions) {
      const response = await worker.fetch(new Request("https://api.example/", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      }), env);
      assert.equal(response.status, 401, action);
      assert.match(response.headers.get("Cache-Control") || "", /no-store/, action);
    }
  });
});
