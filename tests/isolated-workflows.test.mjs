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
  SUPABASE_SERVICE_ROLE_KEY: "test-store-service-role",
  POS_SUPABASE_URL: "https://pos.example",
  POS_SUPABASE_SERVICE_ROLE_KEY: "test-pos-service-role",
  CUSTOMER_SESSION_SECRET: "test-customer-secret",
  FIREBASE_API_KEY: "test-firebase-key",
  ADMIN_UID: "admin-uid",
  ALLOWED_ORIGINS: "https://thier-decor-v3.pages.dev,https://thierdecor.com,https://www.thierdecor.com"
};

async function withFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await run(); }
  finally { globalThis.fetch = original; }
}

async function customerToken(customerId = "customer-1") {
  const payload = { sub: customerId, exp: Math.floor(Date.now() / 1000) + 3600 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.CUSTOMER_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return body + "." + Buffer.from(signature).toString("base64url");
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function adminRequest(action, extra = {}) {
  return worker.fetch(new Request("https://api.example/", {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer firebase-admin-test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, ...extra })
  }), env);
}

function firebaseLookup(url, init) {
  assert.equal(url.hostname, "identitytoolkit.googleapis.com");
  assert.equal(init.method, "POST");
  return jsonResponse({ users: [{ localId: "admin-uid", disabled: false }] });
}

test("isolated customer checkout rebuilds trusted price and totals from Store DB", async () => {
  const calls = [];
  const savedOrder = {
    id: 12345, customerId: "customer-1", customerName: "Test Customer",
    customerPhone: "0550000000", total: 1100, status: "new"
  };
  const customer = {
    id: "customer-1", name: "Test Customer", phone: "0550000000",
    points: 0, isBlocked: false, isTop: false, password: "never-return",
    recoveryPin: "never-return"
  };

  await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ host: url.hostname, path: url.pathname, query: url.search, init });
    assert.equal(url.hostname, "store.example", "customer checkout must use only the Store DB");

    if (url.pathname.endsWith("/customers") && url.search.includes("isBlocked")) {
      return jsonResponse([{ ...customer }]);
    }
    if (url.pathname.endsWith("/products")) {
      return jsonResponse([{
        id: 11, name: "Moule", price: 500, cost: 200, qty: 10,
        isPack: false, packItems: [], promoPrice: null, promoStart: null, promoEnd: null
      }]);
    }
    if (url.pathname.endsWith("/rpc/td_compute_delivery_price")) return jsonResponse(100);
    if (url.pathname.endsWith("/orders") && url.search.includes("id=eq.12345")) {
      if ((!init.method || init.method === "GET") && calls.filter(x => x.path.endsWith("/orders")).length === 1) {
        return jsonResponse([]);
      }
      return jsonResponse([savedOrder]);
    }
    if (url.pathname.endsWith("/rpc/td_create_order")) {
      const payload = JSON.parse(init.body).p_order;
      assert.equal(payload.items[0].price, 500, "browser price must be ignored");
      assert.equal(payload.items[0].cost, 200, "cost must come from the trusted Store DB row");
      assert.equal(payload.itemsTotal, 1000);
      assert.equal(payload.deliveryPrice, 100);
      assert.equal(payload.total, 1100);
      return jsonResponse({ ok: true, order_id: 12345 });
    }
    if (url.pathname.endsWith("/customers") && url.search.includes("isVip")) {
      return jsonResponse([{ ...customer }]);
    }
    throw new Error("Unexpected isolated Store DB request: " + url);
  }, async () => {
    const token = await customerToken();
    const response = await worker.fetch(new Request("https://api.example/", {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "createOrder",
        order: {
          id: 12345, customerId: "customer-1",
          items: [{ id: 11, qty: 2, name: "Forged name", price: 1, cost: 0 }],
          itemsTotal: 2, total: 2, deliveryPrice: 0, wilayaCode: 16,
          courier: "noest", deliveryType: "home"
        }
      })
    }), env);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.order.id, 12345);
    assert.equal("password" in body.customer, false);
    assert.equal("recoveryPin" in body.customer, false);
    assert.ok(calls.some(call => call.path.endsWith("/rpc/td_create_order")), JSON.stringify({ body, calls: calls.map(call => ({ path: call.path, query: call.query })) }));
  });
});

test("isolated admin listOrders is Firebase-gated and reads only the Store DB", async () => {
  await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "identitytoolkit.googleapis.com") return firebaseLookup(url, init);
    assert.equal(url.hostname, "store.example");
    assert.ok(url.pathname.endsWith("/orders"));
    return jsonResponse([{ id: 12345, status: "new" }]);
  }, async () => {
    const response = await adminRequest("listOrders");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Cache-Control") || "", /no-store/);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.orders[0].id, 12345);
  });
});

test("isolated POS sale commits stock in Store DB before recording invoice in POS DB", async () => {
  const calls = [];
  const requestKey = "8d3d5f2a-7c91-4a2b-8f31-6e4b9a1c2d30";
  const operationId = "7c2a5d9e-4b31-4f8a-9c62-1d3e5f7a9b20";

  await withFetch(async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "identitytoolkit.googleapis.com") return firebaseLookup(url, init);

    calls.push({ host: url.hostname, path: url.pathname, init });
    if (url.hostname === "store.example" && url.pathname.endsWith("/rpc/td_pos_commit_stock")) {
      const payload = JSON.parse(init.body).p_sale;
      assert.equal(payload.request_key, requestKey);
      assert.deepEqual(payload.items, [{ id: 11, qty: 2 }]);
      return jsonResponse({
        ok: true,
        operation_id: operationId,
        items: [{
          product_id: 11, product_name: "Moule", quantity: 2,
          unit_price: 500, unit_cost: 200, line_total: 1000,
          is_pack: false, pack_snapshot: []
        }],
        subtotal: 1000, discount: 0, total: 1000,
        created_at: "2026-11-17T10:00:00.000Z"
      });
    }
    if (url.hostname === "pos.example" && url.pathname.endsWith("/rpc/td_pos_record_sale")) {
      const payload = JSON.parse(init.body).p_sale;
      assert.equal(payload.request_key, requestKey);
      assert.equal(payload.stock_operation_id, operationId);
      assert.equal(payload.items[0].unit_cost, 200);
      return jsonResponse({ ok: true, invoice_no: "TD-TEST-0001", id: "test-sale-id" });
    }
    throw new Error("Unexpected isolated POS request: " + url);
  }, async () => {
    const response = await adminRequest("adminCreateStoreSale", {
      requestKey,
      items: [{ id: 11, qty: 2 }],
      discount: 0,
      paymentMethod: "cash",
      customerName: "Test POS Customer"
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.sale.invoice_no, "TD-TEST-0001");
    assert.deepEqual(calls.map(call => call.host), ["store.example", "pos.example"]);
  });
});


test("storefront frontend does not require or query the browser Supabase client", async () => {
  const appSource = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.doesNotMatch(appSource, /window\\.supabaseClient/);
  assert.doesNotMatch(appSource, /\\.from\\s*\\(/);
  assert.doesNotMatch(appSource, /\\.rpc\\s*\\(/);
  assert.match(appSource, /fetchPublicSettingsViaWorker/);
  assert.match(appSource, /fetchPublicCatalogViaWorker/);
  assert.match(appSource, /fetchAdminOrdersViaWorker/);
  assert.match(appSource, /fetchCustomerDataViaWorker/);
});
