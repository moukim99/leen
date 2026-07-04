-- D1 Database Schema for Leen (meetleen.com)
-- SQLite dialect for Cloudflare D1

-- 1. Users Table (المؤسِّسات ورائدات الأعمال)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    store_url TEXT,
    subscription_status TEXT DEFAULT 'free', -- 'free', 'active', 'expired'
    subscription_expires_at TEXT, -- ISO Date String
    lemon_squeezy_customer_id TEXT,
    lemon_squeezy_subscription_id TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 2. Notes Table (المدخلات والملاحظات الصوتية/الفواتير)
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'voice', 'invoice', 'text'
    audio_key TEXT, -- Cloudflare R2 object key for audio recordings
    screenshot_key TEXT, -- Cloudflare R2 object key for invoice screenshots
    raw_transcript TEXT, -- The raw transcript returned by Gemini / Whisper
    structured_json TEXT, -- The final JSON parsed from Gemini
    summary TEXT, -- Short generated summary
    tag TEXT DEFAULT 'general', -- 'inventory', 'sales', 'idea', 'task', 'general'
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Inventory Table (المخزون والمنتجات)
CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sku TEXT,
    quantity INTEGER DEFAULT 0,
    price REAL DEFAULT 0.0,
    currency TEXT DEFAULT 'AED',
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Transactions Table (المبيعات والمعاملات المالية المستخلصة)
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    note_id TEXT, -- Link to the note that generated this transaction
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'AED',
    description TEXT,
    transaction_type TEXT DEFAULT 'income', -- 'income' (sale), 'expense'
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
);

-- 5. Referrals Table (نظام التسويق بالعمولة للمؤثرات والعميلات)
CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_id TEXT NOT NULL, -- The user who referred
    referred_id TEXT NOT NULL, -- The new user who subscribed
    commission_amount REAL DEFAULT 0.0,
    currency TEXT DEFAULT 'AED',
    status TEXT DEFAULT 'pending', -- 'pending', 'paid'
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_user_id ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
