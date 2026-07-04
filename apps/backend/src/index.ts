// Cloudflare Worker Backend for Leen (meetleen.com)

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  GEMINI_API_KEY: string;
  LEMON_SQUEEZY_WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    try {
      // 1. Webhook Endpoint for Lemon Squeezy
      if (url.pathname === "/api/webhooks/lemonsqueezy" && request.method === "POST") {
        return await handleLemonSqueezyWebhook(request, env);
      }

      // 2. Upload and Process Endpoint (Voice / Invoices)
      if (url.pathname === "/api/upload" && request.method === "POST") {
        return await handleUploadAndProcess(request, env);
      }

      // 3. Get Notes Endpoint
      if (url.pathname === "/api/notes" && request.method === "GET") {
        return await handleGetNotes(request, env);
      }

      // 4. Get Inventory Endpoint
      if (url.pathname === "/api/inventory" && request.method === "GET") {
        return await handleGetInventory(request, env);
      }

      // 5. Get Transactions Endpoint
      if (url.pathname === "/api/transactions" && request.method === "GET") {
        return await handleGetTransactions(request, env);
      }

      // 6. Get Dashboard Stats Endpoint
      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        return await handleGetDashboard(request, env);
      }

      // 7. Debug/Create User Endpoint (For development)
      if (url.pathname === "/api/users" && request.method === "POST") {
        return await handleCreateUser(request, env);
      }

      return new Response(JSON.stringify({ error: "Endpoint not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      });
    } catch (err: any) {
      console.error("Internal Server Error:", err);
      return new Response(
        JSON.stringify({ error: "Internal Server Error", message: err.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        }
      );
    }
  },
};

// --- CORS & HTTP Helpers ---
function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-user-id, x-file-type, x-file-extension",
    "Access-Control-Max-Age": "86400",
  };
}

function handleOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

function jsonResponse(data: any, status = 200, headers = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

// --- LEMON SQUEEZY WEBHOOK HANDLER ---
async function handleLemonSqueezyWebhook(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get("X-Signature");
  if (!signature) {
    return jsonResponse({ error: "Missing signature" }, 401);
  }

  const rawBody = await request.text();
  const secret = env.LEMON_SQUEEZY_WEBHOOK_SECRET;

  // Verify HMAC-SHA256 signature
  const verified = await verifySignature(rawBody, signature, secret);
  if (!verified) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  const payload = JSON.parse(rawBody);
  const eventName = payload.meta?.event_name;
  const data = payload.data;

  if (!data) {
    return jsonResponse({ error: "Invalid payload data" }, 400);
  }

  if (
    eventName === "subscription_created" ||
    eventName === "subscription_updated" ||
    eventName === "subscription_expired"
  ) {
    const attributes = data.attributes;
    const email = attributes.user_email;
    const customerId = String(attributes.customer_id);
    const subscriptionId = String(data.id);
    const status = attributes.status;
    const expiresAt = attributes.ends_at || attributes.trial_ends_at || null;

    const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();

    if (existingUser) {
      await env.DB.prepare(
        `UPDATE users 
         SET subscription_status = ?, 
             subscription_expires_at = ?, 
             lemon_squeezy_customer_id = ?, 
             lemon_squeezy_subscription_id = ?,
             updated_at = datetime('now', 'localtime') 
         WHERE id = ?`
      )
        .bind(status, expiresAt, customerId, subscriptionId, existingUser.id)
        .run();
    } else {
      const newUserId = "user_" + crypto.randomUUID().substring(0, 8);
      await env.DB.prepare(
        `INSERT INTO users (id, name, email, subscription_status, subscription_expires_at, lemon_squeezy_customer_id, lemon_squeezy_subscription_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(newUserId, email.split("@")[0], email, status, expiresAt, customerId, subscriptionId)
        .run();
    }

    return jsonResponse({ success: true, event: eventName });
  }

  return jsonResponse({ success: true, message: `Ignored event: ${eventName}` });
}

async function verifySignature(requestBody: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const dataBuf = encoder.encode(requestBody);
  const signatureBuf = hexToBytes(signature);
  return crypto.subtle.verify("HMAC", key, signatureBuf, dataBuf);
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// --- UPLOAD AND PROCESS PIPELINE (GEMINI MULTIMODAL) ---
async function handleUploadAndProcess(request: Request, env: Env): Promise<Response> {
  const userId = request.headers.get("x-user-id");
  const fileType = request.headers.get("x-file-type");
  const fileExt = request.headers.get("x-file-extension") || (fileType === "voice" ? "mp3" : "jpg");

  if (!userId || !fileType) {
    return jsonResponse({ error: "Missing x-user-id or x-file-type headers" }, 400, corsHeaders(request));
  }

  const fileBuffer = await request.arrayBuffer();
  if (fileBuffer.byteLength === 0) {
    return jsonResponse({ error: "Empty file body" }, 400, corsHeaders(request));
  }

  const timestamp = Date.now();
  const fileKey = `users/${userId}/${fileType}/${timestamp}.${fileExt}`;
  const contentType = fileType === "voice" ? `audio/${fileExt}` : `image/${fileExt}`;

  await env.STORAGE.put(fileKey, fileBuffer, {
    httpMetadata: { contentType: contentType },
  });

  const base64Data = btoa(
    new Uint8Array(fileBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  );

  const geminiResult = await queryGeminiMultimodal(base64Data, contentType, fileType, env.GEMINI_API_KEY);

  const noteId = "note_" + crypto.randomUUID().substring(0, 8);
  const audioKey = fileType === "voice" ? fileKey : null;
  const screenshotKey = fileType === "invoice" ? fileKey : null;

  await env.DB.prepare(
    `INSERT INTO notes (id, user_id, type, audio_key, screenshot_key, raw_transcript, structured_json, summary, tag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      noteId,
      userId,
      fileType,
      audioKey,
      screenshotKey,
      geminiResult.transcript,
      JSON.stringify(geminiResult.structuredData),
      geminiResult.summary,
      geminiResult.tag
    )
    .run();

  const structData = geminiResult.structuredData;
  if (structData) {
    if ((structData.type === "sale" || structData.type === "expense") && structData.amount) {
      const transactionId = "tx_" + crypto.randomUUID().substring(0, 8);
      const txType = structData.type === "sale" ? "income" : "expense";
      await env.DB.prepare(
        `INSERT INTO transactions (id, user_id, note_id, amount, currency, description, transaction_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          transactionId,
          userId,
          noteId,
          structData.amount,
          structData.currency || "AED",
          structData.description || geminiResult.summary,
          txType
        )
        .run();
    }

    if (structData.type === "inventory_update" && Array.isArray(structData.items)) {
      for (const item of structData.items) {
        if (item.name) {
          const itemId = "inv_" + crypto.randomUUID().substring(0, 8);
          await env.DB.prepare(
            `INSERT INTO inventory (id, user_id, name, quantity, price, currency)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET 
               quantity = excluded.quantity, 
               price = excluded.price, 
               updated_at = datetime('now', 'localtime')`
          )
            .bind(
              itemId,
              userId,
              item.name,
              item.quantity || 0,
              item.price || 0.0,
              structData.currency || "AED"
            )
            .run();
        }
      }
    }
  }

  return jsonResponse(
    {
      success: true,
      noteId,
      type: fileType,
      fileKey,
      analysis: geminiResult,
    },
    200,
    corsHeaders(request)
  );
}

async function queryGeminiMultimodal(
  base64Data: string,
  mimeType: string,
  fileType: string,
  apiKey: string
): Promise<{
  transcript: string;
  summary: string;
  tag: string;
  structuredData: {
    type: string;
    amount?: number;
    currency?: string;
    description?: string;
    items?: Array<{ name: string; quantity: number; price: number }>;
  };
}> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const promptText = `
أنتِ "لِين" (Leen) المساعدة الصوتية والذكية فائقة السرعة المخصصة لمساعدة رائدات الأعمال والمؤسِسات في دولة الإمارات العربية المتحدة لإدارة أعمالهن بسهولة تامة (Low-Touch UI).
لقد أرسلت لكِ المستخدمة ملفاً (${fileType === "voice" ? "صوتياً تسجل فيه فكرتها أو عمليتها التجارية" : "صورة لفاتورة أو إيصال تجاري"}).

مهمتكِ هي:
1. استخراج النص الكامل أو تفريغ الصوت بدقة عالية (transcript).
2. صياغة ملخص قصير ودافئ ومُشجع بلهجة "لِين" الودودة والمهنية الموجهة لتمكين رائدات الأعمال (summary).
3. تحديد الوسم (tag) المناسب للمدخل من بين: 'inventory' (مخزون)، 'sales' (مبيعات ومصروفات)، 'idea' (أفكار وابتكار)، 'task' (مهام وتنبيهات)، أو 'general' (عام).
4. استخراج البيانات كـ JSON مهيكل يحتوي على تفاصيل المعاملة بدقة:
   - type: نوع العملية ('sale' للمبيعات والواردات، 'expense' للمصروفات والتكاليف، 'inventory_update' لتحديث المخزون والمنتجات، 'todo' للمهام والـ Action Items، أو 'general').
   - amount: القيمة الرقمية للمعاملة المالية (إن وجدت).
   - currency: العملة الافتراضية هي "AED" (الدرهم الإماراتي)، أو العملة المستخرجة من المستند.
   - description: ملخص المعاملة أو الفكرة في سطرين.
   - items: قائمة بالمنتجات في حال كانت فاتورة أو إدخال مخزون، تحتوي على اسم المنتج (name)، الكمية (quantity)، وسعر الوحدة (price).

يجب أن تعيدي الناتج بصيغة JSON نظيفة وصحيحة تماماً ومطابقة للمخطط الهيكلي التالي دون أي علامات markdown أو تفسيرات خارج الـ JSON:
{
  "transcript": "أفرغي هنا محتوى الصوت بالكامل أو قراءة الفاتورة بالتفصيل...",
  "summary": "ملخص ودود ومشجع بأسلوب لين...",
  "tag": "sales", 
  "structuredData": {
    "type": "sale",
    "amount": 250.0,
    "currency": "AED",
    "description": "بيع فستان حريري وردي ترابي مع التوصيل بدبي",
    "items": [
      { "name": "فستان حريري وردي", "quantity": 1, "price": 250.0 }
    ]
  }
}
`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API returned error: ${response.status} - ${errorText}`);
  }

  const result: any = await response.json();
  const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error("Empty response from Gemini API");
  }

  return JSON.parse(textContent.trim());
}

// --- DATA RETRIEVAL HANDLERS ---

async function handleGetNotes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return jsonResponse({ error: "Missing userId parameter" }, 400, corsHeaders(request));
  }

  const { results } = await env.DB.prepare(
    "SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC"
  )
    .bind(userId)
    .all();

  return jsonResponse(results, 200, corsHeaders(request));
}

async function handleGetInventory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return jsonResponse({ error: "Missing userId parameter" }, 400, corsHeaders(request));
  }

  const { results } = await env.DB.prepare(
    "SELECT * FROM inventory WHERE user_id = ? ORDER BY updated_at DESC"
  )
    .bind(userId)
    .all();

  return jsonResponse(results, 200, corsHeaders(request));
}

async function handleGetTransactions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return jsonResponse({ error: "Missing userId parameter" }, 400, corsHeaders(request));
  }

  const { results } = await env.DB.prepare(
    "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC"
  )
    .bind(userId)
    .all();

  return jsonResponse(results, 200, corsHeaders(request));
}

async function handleGetDashboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return jsonResponse({ error: "Missing userId parameter" }, 400, corsHeaders(request));
  }

  const salesResult = await env.DB.prepare(
    "SELECT SUM(amount) as total FROM transactions WHERE user_id = ? AND transaction_type = 'income'"
  )
    .bind(userId)
    .first<{ total: number }>();

  const expensesResult = await env.DB.prepare(
    "SELECT SUM(amount) as total FROM transactions WHERE user_id = ? AND transaction_type = 'expense'"
  )
    .bind(userId)
    .first<{ total: number }>();

  const notesCount = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM notes WHERE user_id = ?"
  )
    .bind(userId)
    .first<{ count: number }>();

  const inventoryCount = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM inventory WHERE user_id = ?"
  )
    .bind(userId)
    .first<{ count: number }>();

  return jsonResponse(
    {
      totalIncome: salesResult?.total || 0,
      totalExpenses: expensesResult?.total || 0,
      notesCount: notesCount?.count || 0,
      inventoryCount: inventoryCount?.count || 0,
    },
    200,
    corsHeaders(request)
  );
}

async function handleCreateUser(request: Request, env: Env): Promise<Response> {
  const body: any = await request.json();
  const { id, name, email, phone, store_url } = body;

  if (!id || !email || !name) {
    return jsonResponse({ error: "Missing id, email, or name" }, 400, corsHeaders(request));
  }

  await env.DB.prepare(
    `INSERT INTO users (id, name, email, phone, store_url, subscription_status)
     VALUES (?, ?, ?, ?, ?, 'free')
     ON CONFLICT(id) DO UPDATE SET 
       name = excluded.name, 
       email = excluded.email, 
       phone = excluded.phone, 
       store_url = excluded.store_url,
       updated_at = datetime('now', 'localtime')`
  )
    .bind(id, name, email, phone || null, store_url || null)
    .run();

  return jsonResponse({ success: true, userId: id }, 200, corsHeaders(request));
}
