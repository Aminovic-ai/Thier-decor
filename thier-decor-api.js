/**
 * Thier Décor API Worker
 * Cloudflare Worker
 *
 * Required bindings:
 * SUPABASE_URL             Variable
 * SUPABASE_SERVICE_ROLE_KEY Secret
 * FIREBASE_API_KEY         Secret or Variable
 * ADMIN_UID                Variable
 * CUSTOMER_SESSION_SECRET  Secret
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function fail(message, status = 400) {
  return json({ success: false, error: message }, status);
}

function normalizePhone(value) {
  let p = String(value || "").replace(/\D/g, "");

  if (p.startsWith("00213")) p = p.slice(5);
  else if (p.startsWith("213")) p = p.slice(3);

  if (p.startsWith("0")) p = p.slice(1);

  return p;
}

function phoneVariants(value) {
  const n = normalizePhone(value);
  if (!n) return [];

  return [...new Set([
    n,
    "0" + n,
    "213" + n,
    "00213" + n
  ])];
}

async function sha256(text) {
  const data = new TextEncoder().encode(String(text));
  const hash = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  let s = value.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";

  const binary = atob(s);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function signCustomerToken(customerId, env) {
  const secret = env.CUSTOMER_SESSION_SECRET;

  if (!secret) throw new Error("CUSTOMER_SESSION_SECRET is missing");

  const payload = {
    sub: String(customerId),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
  };

  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload))
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  );

  return body + "." + base64UrlEncode(new Uint8Array(signature));
}

async function verifyCustomerToken(token, env) {
  try {
    if (!token || !env.CUSTOMER_SESSION_SECRET) return null;

    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [body, signature] = parts;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.CUSTOMER_SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature),
      new TextEncoder().encode(body)
    );

    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body))
    );

    if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch (_) {
    return null;
  }
}

function supabaseHeaders(env, extra = {}) {
  return {
    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
    ...extra
  };
}

function supabaseUrl(env, path) {
  return env.SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/" + path;
}

async function dbRequest(env, path, options = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase configuration is missing");
  }

  const response = await fetch(supabaseUrl(env, path), {
    ...options,
    headers: supabaseHeaders(env, options.headers || {})
  });

  const text = await response.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  if (!response.ok) {
    console.error("Supabase error:", response.status, data);
    throw new Error(
      typeof data === "object" && data?.message
        ? data.message
        : "Database request failed"
    );
  }

  return data;
}

async function findCustomerByPhone(phone, env) {
  const variants = phoneVariants(phone);

  for (const variant of variants) {
    const query = new URLSearchParams({
      select: "*",
      phone: "eq." + variant,
      limit: "1"
    });

    const rows = await dbRequest(
      env,
      "customers?" + query.toString()
    );

    if (Array.isArray(rows) && rows.length) {
      return rows[0];
    }
  }

  return null;
}

function safeCustomer(customer) {
  if (!customer) return null;

  const copy = { ...customer };

  delete copy.password;
  delete copy.recoveryPin;

  return copy;
}

async function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";

  if (!header.startsWith("Bearer ")) return null;

  return header.slice(7).trim();
}

async function verifyFirebaseAdmin(request, env) {
  const token = await getBearerToken(request);

  if (!token || !env.FIREBASE_API_KEY || !env.ADMIN_UID) {
    return false;
  }

  const url =
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" +
    encodeURIComponent(env.FIREBASE_API_KEY);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token })
  });

  if (!response.ok) return false;

  const result = await response.json();
  const user = result.users?.[0];

  return !!(
    user &&
    user.localId === env.ADMIN_UID &&
    user.disabled !== true
  );
}

async function requireCustomer(request, env) {
  const token = await getBearerToken(request);
  return await verifyCustomerToken(token, env);
}

/* ---------------- CUSTOMER LOGIN ---------------- */

async function customerLogin(body, env) {
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");

  if (!phone || !password) {
    return fail("يرجى إدخال رقم الهاتف وكلمة المرور.", 400);
  }

  const customer = await findCustomerByPhone(phone, env);

  if (!customer) {
    return fail("رقم الهاتف غير مسجل.", 401);
  }

  const hashedPassword = await sha256(password);

  if (String(customer.password || "") !== hashedPassword) {
    return fail("كلمة المرور غير صحيحة.", 401);
  }

  if (customer.isBlocked === true) {
    return fail("هذا الحساب محظور.", 403);
  }

  const token = await signCustomerToken(customer.id, env);

  return json({
    success: true,
    customer: safeCustomer(customer),
    token
  });
}

/* ---------------- CUSTOMER REGISTER ---------------- */

async function customerRegister(body, env) {
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  const recoveryPin = String(body.recoveryPin || "").trim();

  if (!name || !phone || !password || !recoveryPin) {
    return fail("يرجى إكمال جميع البيانات المطلوبة.");
  }

  if (password.length < 4) {
    return fail("كلمة المرور قصيرة جداً.");
  }

  if (recoveryPin.length < 2) {
    return fail("رمز الاسترجاع غير صالح.");
  }

  const existing = await findCustomerByPhone(phone, env);

  if (existing) {
    return fail(
      "رقم الهاتف مسجل مسبقاً. يرجى تسجيل الدخول.",
      409
    );
  }

  const customer = {
    id: Date.now(),
    name,
    phone,
    password: await sha256(password),
    isVip: false,
    isTop: false,
    isBlocked: false,
    points: 0,
    recoveryPin,
    wishlist: []
  };

  const inserted = await dbRequest(
    env,
    "customers?select=*",
    {
      method: "POST",
      headers: {
        "Prefer": "return=representation"
      },
      body: JSON.stringify(customer)
    }
  );

  const created = Array.isArray(inserted)
    ? inserted[0]
    : inserted;

  if (!created) {
    return fail("تعذر إنشاء الحساب.", 500);
  }

  const token = await signCustomerToken(created.id, env);

  return json({
    success: true,
    customer: safeCustomer(created),
    token
  });
}


/* ---------------- CUSTOMER PASSWORD RECOVERY ---------------- */
async function customerResetPassword(body, env) {
  const phone = String(body.phone || "").trim();
  const recoveryPin = String(body.recoveryPin || "").trim();
  const password = String(body.password || "");
  if (!phone || !recoveryPin || password.length < 4) return fail("تحقق من رقم الهاتف ورمز الاسترجاع وكلمة المرور (4 أحرف على الأقل).");
  const customer = await findCustomerByPhone(phone, env);
  if (!customer || !customer.recoveryPin || String(customer.recoveryPin) !== recoveryPin) return fail("رقم الهاتف أو رمز الاسترجاع غير صحيح.", 401);
  if (customer.isBlocked === true) return fail("هذا الحساب محظور.", 403);
  await dbRequest(env, "customers?id=eq." + encodeURIComponent(customer.id), {
    method: "PATCH", headers: { "Prefer": "return=minimal" },
    body: JSON.stringify({ password: await sha256(password) })
  });
  return json({ success: true });
}

/* ---------------- CUSTOMER PROFILE ---------------- */
async function updateCustomerProfile(request, body, env) {
  const session = await requireCustomer(request, env);
  if (!session) return fail("انتهت جلسة الزبون. سجّل الدخول مجدداً.", 401);
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const address = String(body.address || "").trim();
  if (!name || !phone) return fail("الاسم ورقم الهاتف إجباريان.");
  const rows = await dbRequest(env, "customers?select=id,phone&id=eq." + encodeURIComponent(session.sub) + "&limit=1");
  const current = rows?.[0];
  if (!current) return fail("الحساب غير موجود.", 404);
  if (normalizePhone(current.phone) !== normalizePhone(phone)) {
    const duplicate = await findCustomerByPhone(phone, env);
    if (duplicate && String(duplicate.id) !== String(session.sub)) return fail("رقم الهاتف مستعمل من حساب آخر.", 409);
    const orders = await dbRequest(env, "orders?select=id&customerPhone=eq." + encodeURIComponent(current.phone) + "&limit=1");
    if (orders?.length) return fail("لا يمكن تغيير رقم الهاتف بعد وجود طلبيات سابقة. اتصل بالمتجر.", 409);
  }
  const updated = await dbRequest(env, "customers?id=eq." + encodeURIComponent(session.sub) + "&select=id,name,phone,address,points,wishlist,isVip,isTop,isBlocked", {
    method: "PATCH", headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ name, phone, address })
  });
  if (!Array.isArray(updated) || !updated.length) return fail("لم يؤكد الخادم حفظ التعديلات.", 409);
  return json({ success: true, customer: safeCustomer(updated[0]) });
}

/* ---------------- CUSTOMER DATA ---------------- */

async function customerData(request, env) {
  const session = await requireCustomer(request, env);

  if (!session) {
    return fail("انتهت جلسة الزبون. يرجى تسجيل الدخول مجدداً.", 401);
  }

  const id = encodeURIComponent(session.sub);

  const customers = await dbRequest(
    env,
    "customers?select=*&id=eq." + id + "&limit=1"
  );

  const customer = customers?.[0];

  if (!customer || customer.isBlocked === true) {
    return fail("الحساب غير متاح.", 403);
  }

  const orders = await dbRequest(
    env,
    "orders?select=*&customerId=eq." + id +
    "&order=createdAt.desc&limit=100"
  );

  const messages = await dbRequest(
    env,
    "messages?select=*&customerId=eq." + id +
    "&order=date.desc&limit=100"
  );

  return json({
    success: true,
    customer: safeCustomer(customer),
    orders: orders || [],
    messages: messages || []
  });
}

/* ---------------- ADMIN ORDERS ---------------- */

async function listOrders(env) {
  const orders = await dbRequest(
    env,
    "orders?select=*&order=createdAt.desc&limit=1000"
  );

  return json({
    success: true,
    orders: orders || []
  });
}

/* ---------------- ADMIN DATA ---------------- */

async function listAdminData(env) {
  const [
    products,
    customers,
    messages,
    requests,
    expenses,
    settings
  ] = await Promise.all([
    dbRequest(env, "products?select=*&order=createdAt.desc&limit=2000"),
    dbRequest(env, "customers?select=*&order=createdAt.desc&limit=2000"),
    dbRequest(env, "messages?select=*&order=date.desc&limit=2000"),
    dbRequest(env, "requests?select=*&order=date.desc&limit=2000"),
    dbRequest(env, "expenses?select=*&order=date.desc&limit=2000"),
    dbRequest(env, "settings?select=*&limit=1")
  ]);

  return json({
    success: true,
    data: {
      products: products || [],
      customers: (customers || []).map(safeCustomer),
      messages: messages || [],
      requests: requests || [],
      expenses: expenses || [],
      settings: settings?.[0] || {}
    }
  });
}
/* ---------------- UPDATE ORDER STATUS ---------------- */

async function updateOrderStatus(body, env) {
  const id = body.id;
  const status = String(body.status || "");

  const allowedStatuses = [
    "new",
    "confirmed",
    "on_the_way",
    "out_for_delivery",
    "delivered",
    "cancelled"
  ];

  if (id === undefined || !allowedStatuses.includes(status)) {
    return fail("بيانات تحديث الطلبية غير صحيحة.");
  }

  const query = new URLSearchParams({
    id: "eq." + String(id),
    select: "*"
  });

  const updated = await dbRequest(
    env,
    "orders?" + query.toString(),
    {
      method: "PATCH",
      headers: {
        "Prefer": "return=representation"
      },
      body: JSON.stringify({ status })
    }
  );

  if (!Array.isArray(updated) || !updated.length) {
    return fail("لم يتم العثور على الطلبية.", 404);
  }

  return json({
    success: true,
    order: updated[0]
  });
}

/* ---------------- MAIN ROUTER ---------------- */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (request.method !== "POST") {
      return fail("Method not allowed.", 405);
    }

    let body;

    try {
      body = await request.json();
    } catch (_) {
      return fail("Invalid JSON body.");
    }

    const action = String(body.action || "");

    try {
      switch (action) {
        case "customerLogin":
          return await customerLogin(body, env);

        case "customerRegister":
          return await customerRegister(body, env);

        case "customerData":
          return await customerData(request, env);

        case "customerResetPassword":
          return await customerResetPassword(body, env);

        case "updateCustomerProfile":
          return await updateCustomerProfile(request, body, env);

        case "listOrders":
        case "listAdminData":
        case "updateOrderStatus": {
          const isAdmin = await verifyFirebaseAdmin(request, env);

          if (!isAdmin) {
            return fail("غير مصرح لك بتنفيذ هذا الإجراء.", 401);
          }

          if (action === "listOrders") {
            return await listOrders(env);
          }

          if (action === "listAdminData") {
            return await listAdminData(env);
          }

          return await updateOrderStatus(body, env);
        }

        default:
          return fail("Unknown action.", 404);
      }
    } catch (error) {
      console.error("Worker error:", error);

      return fail(
        "حدث خطأ داخلي في الخادم. يرجى المحاولة لاحقاً.",
        500
      );
    }
  }
};
