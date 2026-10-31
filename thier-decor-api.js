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
  const rows = await dbRequest(env, "rpc/td_find_customer_by_phone", {
    method: "POST",
    body: JSON.stringify({ p_phone: String(phone || "") })
  });

  return Array.isArray(rows) && rows.length ? rows[0] : null;
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

/* ---------------- CUSTOMER ORDER CREATION ---------------- */
async function createCustomerOrder(request, body, env) {
  const session = await requireCustomer(request, env);
  if (!session) return fail("انتهت جلسة الزبون. سجّل الدخول مجدداً.", 401);

  const order = body.order;
  if (!order || typeof order !== "object" || Array.isArray(order)) {
    return fail("بيانات الطلبية غير صالحة.", 400);
  }
  if (String(order.customerId || "") !== String(session.sub)) {
    return fail("لا يمكنك إنشاء طلبية لحساب زبون آخر.", 403);
  }

  const customerRows = await dbRequest(
    env,
    "customers?select=id,name,phone,points,isBlocked&id=eq." +
      encodeURIComponent(session.sub) + "&limit=1"
  );
  const customer = customerRows?.[0];
  if (!customer || customer.isBlocked === true) {
    return fail("الحساب غير متاح.", 403);
  }

  // Ignore client-supplied identity fields; use the official account data.
  const trustedOrder = {
    ...order,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone
  };

  let created;
  try {
    created = await dbRequest(env, "rpc/td_create_order", {
      method: "POST",
      body: JSON.stringify({ p_order: trustedOrder })
    });
  } catch (error) {
    const reason = String(error?.message || "");
    if (reason.includes("Insufficient stock")) {
      return fail("بعض المنتجات لم تعد متوفرة بالكمية المطلوبة. حدّث السلة وحاول مجدداً.", 409);
    }
    if (reason.includes("At least 200 loyalty points")) {
      return fail("رصيد نقاطك غير كافٍ. ألغِ خيار التوصيل المجاني أو اجمع نقاطاً إضافية.", 409);
    }
    if (reason.includes("Coupon could not be consumed")) {
      return fail("الكوبون منتهي أو غير صالح أو استُنفدت استعمالاته.", 409);
    }
    if (reason.includes("Order ID already belongs")) {
      return fail("تعذر التحقق من الطلبية. حدّث الصفحة قبل إعادة المحاولة.", 409);
    }
    console.error("Customer order RPC failed:", error);
    return fail("تعذر إتمام الطلبية. تحقق من الاتصال وحاول مجدداً.", 409);
  }
  if (!created?.ok || !created.order_id) {
    return fail("لم يتم تأكيد إنشاء الطلبية.", 409);
  }

  const [orders, refreshedCustomers] = await Promise.all([
    dbRequest(env, "orders?select=*&id=eq." + encodeURIComponent(created.order_id) + "&limit=1"),
    dbRequest(env, "customers?select=id,name,phone,points,isVip,isTop,isBlocked,wishlist,address&id=eq." + encodeURIComponent(session.sub) + "&limit=1")
  ]);
  if (!orders?.length || !refreshedCustomers?.length) {
    return fail("تعذر تأكيد بيانات الطلبية بعد الحفظ. حدّث صفحة طلباتك قبل إعادة المحاولة.", 202);
  }

  return json({
    success: true,
    order: orders[0],
    customer: safeCustomer(refreshedCustomers[0]),
    pointsRedeemed: Number(created.points_redeemed || 0)
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

  let inserted;
  try {
    inserted = await dbRequest(
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
  } catch (error) {
    const reason = String(error?.message || "");
    if (reason.includes("duplicate key") || reason.includes("customers_phone_canonical_uidx")) {
      return fail("رقم الهاتف مسجل مسبقاً. يرجى تسجيل الدخول.", 409);
    }
    throw error;
  }

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
  const requests = await dbRequest(
    env,
    "requests?select=*&customerId=eq." + id +
    "&order=date.desc&limit=100"
  );

  return json({
    success: true,
    customer: safeCustomer(customer),
    orders: orders || [],
    messages: messages || [],
    requests: requests || []
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
  const id = Number(body.id);
  const status = String(body.status || "");
  if (!Number.isSafeInteger(id) || id <= 0) return fail("رقم الطلبية غير صحيح.");
  const result = await dbRequest(env, "rpc/td_admin_update_order_status", {
    method: "POST",
    body: JSON.stringify({ p_order_id: id, p_status: status })
  });
  if (!result?.ok) return fail("لم يتم تأكيد تحديث الطلبية.", 409);
  const rows = await dbRequest(env, "orders?select=*&id=eq." + encodeURIComponent(id) + "&limit=1");
  if (!rows?.length) return fail("تعذر قراءة الطلبية بعد التحديث.", 404);
  return json({ success: true, order: rows[0], pointsAwarded: Number(result.points_awarded || 0) });
}



/* ---------------- AUTHENTICATED CUSTOMER MUTATIONS ---------------- */
async function customerUpdateWishlist(request, body, env) {
  const session = await requireCustomer(request, env);
  if (!session) return fail("انتهت جلسة الزبون. سجّل الدخول مجدداً.", 401);
  if (!Array.isArray(body.wishlist) || body.wishlist.length > 500) return fail("قائمة المفضلة غير صالحة.");
  const wishlist = [...new Set(body.wishlist.map(x => Number(x)).filter(x => Number.isSafeInteger(x) && x > 0))];
  const rows = await patchRow(env, "customers", session.sub, { wishlist }, "id,wishlist");
  return json({ success: true, wishlist: rows.wishlist || [] });
}
async function customerAddReview(request, body, env) {
  const session = await requireCustomer(request, env);
  if (!session) return fail("انتهت جلسة الزبون. سجّل الدخول مجدداً.", 401);
  const productId = positiveId(body.productId, "معرّف المنتج");
  const stars = Number(body.stars);
  const reviewText = cleanText(body.text, 1200, "التقييم");
  if (!Number.isInteger(stars) || stars < 1 || stars > 5 || !reviewText) return fail("التقييم غير صالح.");
  const customers = await dbRequest(env, "customers?select=id,name,isBlocked&id=eq." + encodeURIComponent(session.sub) + "&limit=1");
  const customer = customers?.[0];
  if (!customer || customer.isBlocked) return fail("الحساب غير متاح.", 403);
  const orders = await dbRequest(env, "orders?select=id,items,status&customerId=eq." + encodeURIComponent(session.sub) + "&status=eq.delivered&limit=100");
  const hasPurchased = (orders || []).some(o => Array.isArray(o.items) && o.items.some(i => Number(i.id) === productId || (Array.isArray(i.packItems) && i.packItems.some(p => Number(p.id) === productId))));
  if (!hasPurchased) return fail("يمكنك تقييم المنتجات بعد استلام طلبية تحتوي عليها.", 403);
  const products = await dbRequest(env, "products?select=id,reviews&id=eq." + encodeURIComponent(productId) + "&limit=1");
  const product = products?.[0];
  if (!product) return fail("المنتج غير موجود.", 404);
  const reviews = Array.isArray(product.reviews) ? product.reviews.slice(0, 499) : [];
  reviews.push({ name: cleanText(customer.name, 120, "الاسم"), stars, text: reviewText, date: new Date().toISOString() });
  await patchRow(env, "products", productId, { reviews }, "id,reviews");
  return json({ success: true, reviews });
}
async function customerCreateRequest(request, body, env) {
  const session = await requireCustomer(request, env);
  if (!session) return fail("انتهت جلسة الزبون. سجّل الدخول مجدداً.", 401);
  const productName = cleanText(body.productName, 180, "اسم المنتج");
  const details = cleanText(body.details, 2000, "التفاصيل");
  const qty = Number(body.qty);
  if (!productName || !Number.isSafeInteger(qty) || qty < 1 || qty > 1000) return fail("بيانات الطلب الخاص غير صالحة.");
  const rows = await dbRequest(env, "customers?select=id,name,phone,isTop,isBlocked&id=eq." + encodeURIComponent(session.sub) + "&limit=1");
  const customer = rows?.[0];
  if (!customer || customer.isBlocked) return fail("الحساب غير متاح.", 403);
  const record = { id: Date.now(), customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, productName, qty, details, date: new Date().toISOString(), status: "pending", isTopCustomer: customer.isTop === true };
  const inserted = await dbRequest(env, "requests?select=id", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(record) });
  if (!Array.isArray(inserted) || !inserted.length) return fail("لم يؤكد الخادم إرسال الطلب.", 409);
  return json({ success: true, request: record });
}
async function customerSendMessage(request, body, env) {
  const token = await getBearerToken(request);
  const session = token ? await verifyCustomerToken(token, env) : null;
  const messageText = cleanText(body.text, 5000, "نص الرسالة");
  if (!messageText) return fail("اكتب رسالتك أولاً.");
  let customerId = null, name = "زائر", phone = "غير متوفر";
  if (session) {
    const rows = await dbRequest(env, "customers?select=id,name,phone,isBlocked&id=eq." + encodeURIComponent(session.sub) + "&limit=1");
    const customer = rows?.[0];
    if (!customer || customer.isBlocked) return fail("الحساب غير متاح.", 403);
    customerId = customer.id; name = customer.name; phone = customer.phone;
  }
  const record = { id: Date.now(), customerId, name, phone, text: messageText, date: new Date().toISOString(), reply: null };
  const inserted = await dbRequest(env, "messages?select=id", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(record) });
  if (!Array.isArray(inserted) || !inserted.length) return fail("لم يؤكد الخادم إرسال الرسالة.", 409);
  return json({ success: true, message: record });
}
async function customerConfirmReceipt(request, body, env) {
  const session = await requireCustomer(request, env);
  if (!session) return fail("انتهت جلسة الزبون. سجّل الدخول مجدداً.", 401);
  const id = positiveId(body.id, "معرّف الطلبية");
  const rows = await dbRequest(env, "orders?select=id,customerId,status&id=eq." + encodeURIComponent(id) + "&limit=1");
  const order = rows?.[0];
  if (!order || String(order.customerId) !== String(session.sub)) return fail("الطلبية غير موجودة في حسابك.", 404);
  if (!["confirmed","on_the_way","out_for_delivery"].includes(order.status)) return fail("لا يمكن تأكيد استلام هذه الطلبية في حالتها الحالية.", 409);
  return await updateOrderStatus({ id, status: "delivered" }, env);
}

/* ---------------- ALLOW-LISTED ADMIN MUTATIONS ---------------- */
function positiveId(value, label = "المعرّف") {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(label + " غير صحيح.");
  return id;
}
function cleanText(value, max, label) {
  const text = String(value ?? "").trim();
  if (text.length > max) throw new Error(label + " طويل جداً.");
  return text;
}
async function patchRow(env, table, id, patch, select = "id") {
  const rows = await dbRequest(env, table + "?id=eq." + encodeURIComponent(id) + "&select=" + select, {
    method: "PATCH",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify(patch)
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error("لم يتم العثور على السجل أو لم يؤكد الخادم التعديل.");
  return rows[0];
}
async function deleteRow(env, table, id) {
  const rows = await dbRequest(env, table + "?id=eq." + encodeURIComponent(id) + "&select=id", {
    method: "DELETE",
    headers: { "Prefer": "return=representation" }
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error("لم يؤكد الخادم حذف السجل.");
  return rows[0];
}
async function adminMutation(action, body, env) {
  switch (action) {
    case "adminUpsertProduct": {
      const id = body.id == null ? Date.now() : positiveId(body.id, "معرّف المنتج");
      const source = body.product;
      if (!source || typeof source !== "object" || Array.isArray(source)) return fail("بيانات المنتج غير صالحة.");
      const allowed = ["name","price","cost","qty","category","desc","images","isPack","packItems","isSpecial","promoPrice","promoStart","promoEnd","reviews","createdAt"];
      const product = {};
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(source, key)) product[key] = source[key];
      product.name = cleanText(product.name, 180, "اسم المنتج");
      product.price = Number(product.price);
      product.cost = Number(product.cost || 0);
      product.qty = Number(product.qty);
      if (!product.name || !Number.isFinite(product.price) || product.price <= 0 || !Number.isFinite(product.cost) || product.cost < 0 || !Number.isFinite(product.qty) || product.qty < 0) return fail("تحقق من اسم المنتج والسعر والتكلفة والكمية.");
      if (product.images !== undefined && (!Array.isArray(product.images) || product.images.length > 12 || product.images.some(x => typeof x !== "string" || x.length > 900000))) return fail("صور المنتج غير صالحة.");
      if (product.packItems !== undefined && (!Array.isArray(product.packItems) || product.packItems.length > 60)) return fail("مكونات الباقة غير صالحة.");
      if (product.isPack === true && (!Array.isArray(product.packItems) || !product.packItems.length)) return fail("يجب تحديد مكونات الباقة.");
      product.id = id;
      if (body.id == null) product.createdAt = new Date().toISOString();
      const rows = await dbRequest(env, "products?on_conflict=id&select=id", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(product)
      });
      if (!Array.isArray(rows) || !rows.length) return fail("لم يؤكد الخادم حفظ المنتج.", 409);
      return json({ success: true, productId: rows[0].id });
    }
    case "adminDeleteProduct": {
      const id = positiveId(body.id, "معرّف المنتج");
      await deleteRow(env, "products", id);
      return json({ success: true });
    }
    case "adminSetCustomerFlags": {
      const id = positiveId(body.id, "معرّف الزبون");
      const flags = body.flags;
      if (!flags || typeof flags !== "object" || Array.isArray(flags)) return fail("بيانات حالة الزبون غير صالحة.");
      const patch = {};
      for (const key of ["isVip","isTop","isBlocked"]) {
        if (Object.prototype.hasOwnProperty.call(flags, key)) {
          if (typeof flags[key] !== "boolean") return fail("قيمة حالة الزبون غير صالحة.");
          patch[key] = flags[key];
        }
      }
      if (!Object.keys(patch).length) return fail("لا توجد تغييرات.");
      await patchRow(env, "customers", id, patch);
      return json({ success: true });
    }
    case "adminDeleteCustomer": {
      const id = positiveId(body.id, "معرّف الزبون");
      await deleteRow(env, "customers", id);
      return json({ success: true });
    }
    case "adminReplyMessage": {
      const id = positiveId(body.id, "معرّف الرسالة");
      const reply = cleanText(body.reply, 10000, "الرد");
      if (!reply) return fail("اكتب الرد أولاً.");
      await patchRow(env, "messages", id, { reply, repliedAt: new Date().toISOString() });
      return json({ success: true });
    }
    case "adminDeleteMessage": {
      await deleteRow(env, "messages", positiveId(body.id, "معرّف الرسالة"));
      return json({ success: true });
    }
    case "adminCreateExpense": {
      const expense = body.expense;
      if (!expense || typeof expense !== "object" || Array.isArray(expense)) return fail("بيانات المصروف غير صالحة.");
      const title = cleanText(expense.title, 180, "عنوان المصروف");
      const amount = Number(expense.amount);
      if (!title || !Number.isFinite(amount) || amount < 0) return fail("تحقق من عنوان المصروف ومبلغه.");
      const row = { id: positiveId(expense.id || Date.now(), "معرّف المصروف"), title, amount, date: cleanText(expense.date || new Date().toISOString(), 80, "التاريخ") };
      const rows = await dbRequest(env, "expenses?select=id", { method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(row) });
      if (!Array.isArray(rows) || !rows.length) return fail("لم يؤكد الخادم إضافة المصروف.", 409);
      return json({ success: true, expenseId: rows[0].id });
    }
    case "adminDeleteExpense": {
      await deleteRow(env, "expenses", positiveId(body.id, "معرّف المصروف"));
      return json({ success: true });
    }
    case "adminUpdateSettings": {
      const source = body.settings;
      if (!source || typeof source !== "object" || Array.isArray(source)) return fail("إعدادات المتجر غير صالحة.");
      const allowed = ["shopName","shopPhone","shopAddress","promoText","promoActive","adActive","adText","adEndTime","adImages","customPrices","manualSalesAdjustment","coupons"];
      const patch = {};
      for (const key of allowed) if (Object.prototype.hasOwnProperty.call(source, key)) patch[key] = source[key];
      if (!Object.keys(patch).length) return fail("لا توجد إعدادات للتحديث.");
      if (patch.shopName !== undefined) patch.shopName = cleanText(patch.shopName, 120, "اسم المتجر");
      if (patch.shopPhone !== undefined) patch.shopPhone = cleanText(patch.shopPhone, 40, "هاتف المتجر");
      if (patch.shopAddress !== undefined) patch.shopAddress = cleanText(patch.shopAddress, 300, "عنوان المتجر");
      if (patch.adImages !== undefined && (!Array.isArray(patch.adImages) || patch.adImages.length > 12 || patch.adImages.some(x => typeof x !== "string" || x.length > 900000))) return fail("صور الإشهار غير صالحة.");
      if (patch.coupons !== undefined && (!Array.isArray(patch.coupons) || patch.coupons.length > 500)) return fail("قائمة الكوبونات غير صالحة.");
      const rows = await dbRequest(env, "settings?id=eq.1&select=id", { method: "PATCH", headers: { "Prefer": "return=representation" }, body: JSON.stringify(patch) });
      if (!Array.isArray(rows) || !rows.length) return fail("لم يؤكد الخادم حفظ الإعدادات.", 409);
      return json({ success: true });
    }
    case "adminUpdateOrderTracking": {
      const id = positiveId(body.id, "معرّف الطلبية");
      const trackingNumber = cleanText(body.trackingNumber, 120, "كود التتبع");
      await patchRow(env, "orders", id, { trackingNumber });
      return json({ success: true });
    }
    case "adminSetOrderPaid": {
      const id = positiveId(body.id, "معرّف الطلبية");
      const rows = await dbRequest(env, "orders?select=id,total&id=eq." + encodeURIComponent(id) + "&limit=1");
      const order = rows?.[0];
      if (!order) return fail("الطلبية غير موجودة.", 404);
      const paidAmount = Number(body.paidAmount);
      if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > Number(order.total)) return fail("مبلغ الدفع خارج النطاق.");
      await patchRow(env, "orders", id, { paidAmount });
      return json({ success: true });
    }
    case "adminSetOrderFreeDelivery": {
      const id = positiveId(body.id, "معرّف الطلبية");
      const rows = await dbRequest(env, "orders?select=id,itemsTotal,discount,status&id=eq." + encodeURIComponent(id) + "&limit=1");
      const order = rows?.[0];
      if (!order) return fail("الطلبية غير موجودة.", 404);
      if (order.status === "delivered" || order.status === "cancelled") return fail("لا يمكن تعديل توصيل طلبية مسلّمة أو ملغاة.", 409);
      const total = Math.max(0, Number(order.itemsTotal || 0) - Number(order.discount || 0));
      await patchRow(env, "orders", id, { deliveryPrice: 0, total });
      return json({ success: true });
    }
    case "adminSetRequestStatus": {
      const id = positiveId(body.id, "معرّف الطلب");
      const status = String(body.status || "");
      if (!["pending","fulfilled","rejected"].includes(status)) return fail("حالة الطلب غير صالحة.");
      await patchRow(env, "requests", id, { status });
      return json({ success: true });
    }
    case "adminDeleteRequest": {
      await deleteRow(env, "requests", positiveId(body.id, "معرّف الطلب"));
      return json({ success: true });
    }
    case "adminCouponUsage": {
      const usage = await dbRequest(env, "rpc/td_promo_usage_stats", { method: "POST", body: "{}" });
      return json({ success: true, usage: usage || {} });
    }
    default:
      return fail("Unknown admin mutation.", 404);
  }
}


async function adminNotifyCustomerProductAvailable(body, env) {
  const requestId = positiveId(body.requestId, "معرّف الطلب الخاص");
  const rows = await dbRequest(env, "requests?select=id,customerId,customerName,customerPhone,productName,status&id=eq." + encodeURIComponent(requestId) + "&limit=1");
  const request = rows?.[0];
  if (!request) return fail("الطلب الخاص غير موجود.", 404);
  if (request.status !== "fulfilled") return fail("يجب تلبية الطلب قبل إرسال الإشعار.", 409);
  const message = {
    id: Date.now(), customerId: request.customerId || null, name: request.customerName || "زبون",
    phone: request.customerPhone || "", text: "🎉 " + cleanText(request.productName, 180, "اسم المنتج"),
    date: new Date().toISOString(), reply: null
  };
  const inserted = await dbRequest(env, "messages?select=id", {
    method: "POST", headers: { "Prefer": "return=representation" }, body: JSON.stringify(message)
  });
  if (!Array.isArray(inserted) || !inserted.length) return fail("لم يؤكد الخادم إرسال الإشعار.", 409);
  return json({ success: true, message });
}
async function adminDeleteOrder(body, env) {
  const id = positiveId(body.id, "معرّف الطلبية");
  const result = await dbRequest(env, "rpc/td_admin_delete_order", { method: "POST", body: JSON.stringify({ p_order_id: id }) });
  if (!result?.ok) return fail("تعذر حذف الطلبية أو استعادة المخزون بأمان.", 409);
  return json({ success: true, orderId: id });
}
async function adminEditOrder(body, env) {
  const id = positiveId(body.id, "معرّف الطلبية");
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) return fail("قائمة منتجات الطلبية غير صالحة.");
  const result = await dbRequest(env, "rpc/td_admin_edit_order", {
    method: "POST", body: JSON.stringify({ p_order_id: id, p_items: body.items })
  });
  if (!result?.ok) return fail("تعذر تعديل الطلبية والمخزون ضمن معاملة واحدة.", 409);
  const rows = await dbRequest(env, "orders?select=*&id=eq." + encodeURIComponent(id) + "&limit=1");
  if (!rows?.length) return fail("تعذر قراءة الطلبية بعد التعديل.", 404);
  return json({ success: true, order: rows[0] });
}
async function adminVisitStats(env) {
  const stats = await dbRequest(env, "rpc/td_get_visit_stats", { method: "POST", body: "{}" });
  return json({ success: true, visits: stats || {} });
}
async function recordVisit(body, env) {
  const path = cleanText(body.path || "/", 240, "مسار الصفحة").replace(/[^a-zA-Z0-9/_?=&.-]/g, "").slice(0, 240) || "/";
  const sessionKey = cleanText(body.sessionKey, 80, "معرّف الجلسة");
  if (!/^[a-f0-9-]{24,80}$/i.test(sessionKey)) return fail("معرّف جلسة الزيارة غير صالح.");
  const result = await dbRequest(env, "rpc/td_record_visit_safe", {
    method: "POST", body: JSON.stringify({ p_path: path, p_session_key: sessionKey })
  });
  return json({ success: true, recorded: result?.recorded === true });
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

        case "createOrder":
          return await createCustomerOrder(request, body, env);

        case "customerResetPassword":
          return await customerResetPassword(body, env);

        case "updateCustomerProfile":
          return await updateCustomerProfile(request, body, env);

        case "customerUpdateWishlist":
          return await customerUpdateWishlist(request, body, env);

        case "customerAddReview":
          return await customerAddReview(request, body, env);

        case "customerCreateRequest":
          return await customerCreateRequest(request, body, env);

        case "customerSendMessage":
          return await customerSendMessage(request, body, env);

        case "customerConfirmReceipt":
          return await customerConfirmReceipt(request, body, env);

        case "recordVisit":
          return await recordVisit(body, env);

        case "listOrders":
        case "listAdminData":
        case "updateOrderStatus":
        case "adminUpsertProduct":
        case "adminDeleteProduct":
        case "adminSetCustomerFlags":
        case "adminDeleteCustomer":
        case "adminReplyMessage":
        case "adminDeleteMessage":
        case "adminCreateExpense":
        case "adminDeleteExpense":
        case "adminUpdateSettings":
        case "adminUpdateOrderTracking":
        case "adminSetOrderPaid":
        case "adminSetOrderFreeDelivery":
        case "adminSetRequestStatus":
        case "adminDeleteRequest":
        case "adminCouponUsage":
        case "adminNotifyCustomerProductAvailable":
        case "adminDeleteOrder":
        case "adminEditOrder":
        case "adminVisitStats": {
          const isAdmin = await verifyFirebaseAdmin(request, env);
          if (!isAdmin) return fail("غير مصرح لك بتنفيذ هذا الإجراء.", 401);
          if (action === "listOrders") return await listOrders(env);
          if (action === "listAdminData") return await listAdminData(env);
          if (action === "updateOrderStatus") return await updateOrderStatus(body, env);
          if (action === "adminNotifyCustomerProductAvailable") return await adminNotifyCustomerProductAvailable(body, env);
          if (action === "adminDeleteOrder") return await adminDeleteOrder(body, env);
          if (action === "adminEditOrder") return await adminEditOrder(body, env);
          if (action === "adminVisitStats") return await adminVisitStats(env);
          return await adminMutation(action, body, env);
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
