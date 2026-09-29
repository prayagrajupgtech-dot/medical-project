/**
 * pg-config.js — PostgreSQL (Supabase) drop-in replacement for the sqlite3
 * database used across the app. Same API: db.get / db.all / db.run with
 * `?` placeholders and (err, row) callbacks, plus initDatabase().
 *
 * Differences handled here:
 *  - `?` placeholders are rewritten to $1, $2, ... (skipping string literals)
 *  - INSERT statements get `RETURNING id` so `this.lastID` keeps working
 *  - TIMESTAMP values come back as sqlite-style 'YYYY-MM-DD HH:MM:SS' strings
 */
const fs = require('fs');
const path = require('path');
const dns = require('dns');

// Prefer IPv4 when resolving the database host.
// Some hosts publish AAAA first, and platforms with IPv6 enabled but no IPv6
// route (Railway, most container hosts) then fail every query with
//     connect ENETUNREACH 2406:da14:...:5432
// Note: this only helps when the hostname has an IPv4 (A) record at all.
// A Supabase project created on the IPv6-only network publishes ONLY AAAA, so
// for those the DATABASE_URL must use the Supavisor pooler host, which is
// IPv4-only:
//     postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

// Load .env here too, not only in config.js. Without it, requiring pg-config
// directly (scripts, tests, `node -e`) left DATABASE_URL undefined, the pool
// silently fell back to a local/default host and every query failed with
// "The server does not support SSL connections".
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (e) {}

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set - set it in .env or the host environment before using PostgreSQL.');
}

function makePool(connectionString) {
    const p = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000
    });
    p.on('error', (err) => {
        console.error('Supabase pool error:', err.message);
    });
    return p;
}

let pool = makePool(process.env.DATABASE_URL);

// ---------------------------------------------------------------------------
// Pooler failover
//
// A Supabase project on the IPv6-only network answers only on AAAA records. Any
// host without an IPv6 route (Railway and most container platforms) then fails
// every query with:
//
//     connect ENETUNREACH 2406:da14:...:5432
//
// The fix is the Supavisor pooler host, which is IPv4-only. Rather than depend
// on the DATABASE_URL stored on the host being rewritten by hand - a step that
// is easy to miss and easy to apply to the wrong environment - the app detects
// the failure at boot and tries the pooler itself. If DATABASE_URL already
// points at a reachable host, nothing here runs.
// ---------------------------------------------------------------------------
const POOLER_REGIONS = [
    'ap-northeast-1', 'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-2',
    'us-east-1', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-central-1', 'eu-north-1',
    'ca-central-1', 'sa-east-1'
];

function poolerCandidates(url) {
    const out = [];
    if (process.env.SUPABASE_POOLER_URL) out.push(process.env.SUPABASE_POOLER_URL);

    let parsed;
    try { parsed = new URL(url); } catch (e) { return out; }

    // Only the direct host is worth translating; anything else is left alone.
    const m = /^(?:db|aws-0-[a-z0-9-]+)\.([a-z0-9]+)\.supabase\.co$/i.exec(parsed.hostname);
    if (!m) return out;

    const ref = m[1];
    if (parsed.username === 'postgres') parsed.username = 'postgres.' + ref;

    for (const region of POOLER_REGIONS) {
        const u = new URL(parsed.toString());
        u.hostname = 'aws-0-' + region + '.pooler.supabase.com';
        u.port = '5432'; // session mode, so session state behaves like a direct connection
        out.push(u.toString());
    }
    return out;
}

// Swap to the first candidate that actually answers. Returns the URL in use.
async function ensureReachable() {
    const primary = process.env.DATABASE_URL;
    try {
        const c = await pool.connect();
        c.release();
        return primary;
    } catch (e) {
        console.warn('Database host unreachable (' + e.message + '), trying the Supabase pooler...');
    }

    for (const url of poolerCandidates(primary)) {
        const probe = makePool(url);
        probe.on('error', () => {}); // the probe is expected to fail for wrong regions
        try {
            const c = await probe.connect();
            c.release();
            await pool.end().catch(() => {});
            pool = makePool(url);
            console.log('Connected to Supabase via the pooler:', new URL(url).hostname);
            return url;
        } catch (e) {
            await probe.end().catch(() => {});
        }
    }

    console.error('Could not reach the database with DATABASE_URL or any pooler host. Check DATABASE_URL.');
    return null;
}

// Replace ? placeholders with $1, $2... without touching ? inside 'strings'
function toPostgresPlaceholders(sql) {
    let idx = 0;
    let out = '';
    let inStr = false;
    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        if (ch === "'") {
            // '' is an escaped quote inside a string, not a boundary
            if (inStr && sql[i + 1] === "'") { out += "''"; i++; continue; }
            inStr = !inStr;
            out += ch;
            continue;
        }
        if (ch === '?' && !inStr) {
            idx++;
            out += '$' + idx;
            continue;
        }
        out += ch;
    }
    return out;
}

// Postgres folds unquoted identifiers to lowercase, so camelCase columns
// (accountStatus, preferredLanguage, ...) come back lowercase. Restore them.
const KEY_MAP = {
    accountstatus: 'accountStatus',
    blockedat: 'blockedAt',
    blockedby: 'blockedBy',
    blockreason: 'blockReason',
    lastloginat: 'lastLoginAt',
    deletedat: 'deletedAt',
    deletedby: 'deletedBy',
    originalusername: 'originalUsername',
    originalemail: 'originalEmail',
    originalfullname: 'originalFullName',
    preferredlanguage: 'preferredLanguage',
    preferredlocale: 'preferredLocale'
};

// sqlite returns datetimes as 'YYYY-MM-DD HH:MM:SS' strings — match that
function normalizeRow(row) {
    if (!row || typeof row !== 'object') return row;
    for (const k of Object.keys(row)) {
        const v = row[k];
        if (v instanceof Date) {
            row[k] = v.toISOString().slice(0, 19).replace('T', ' ');
        }
        if (KEY_MAP[k] && !(KEY_MAP[k] in row)) {
            row[KEY_MAP[k]] = row[k];
        }
    }
    return row;
}

function normalizeArgs(sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    return { sql, params: params || [], cb: cb || (() => {}) };
}

const db = {
    get(sql, params, cb) {
        const a = normalizeArgs(sql, params, cb);
        pool.query(toPostgresPlaceholders(a.sql), a.params, (err, res) => {
            if (err) return a.cb(err);
            a.cb(null, res.rows.length ? normalizeRow(res.rows[0]) : undefined);
        });
    },

    all(sql, params, cb) {
        const a = normalizeArgs(sql, params, cb);
        pool.query(toPostgresPlaceholders(a.sql), a.params, (err, res) => {
            if (err) return a.cb(err);
            a.cb(null, res.rows.map(normalizeRow));
        });
    },

    run(sql, params, cb) {
        const a = normalizeArgs(sql, params, cb);
        let finalSql = a.sql;
        const isInsert = /^\s*insert\s+/i.test(finalSql);
        if (isInsert && !/returning\s+/i.test(finalSql)) {
            finalSql += ' RETURNING id';
        }
        pool.query(toPostgresPlaceholders(finalSql), a.params, (err, res) => {
            if (err) return a.cb.call({ lastID: undefined, changes: 0 }, err);
            const ctx = {
                lastID: (res.rows && res.rows[0] && res.rows[0].id !== undefined) ? res.rows[0].id : undefined,
                changes: typeof res.rowCount === 'number' ? res.rowCount : 0
            };
            a.cb.call(ctx, null);
        });
    },

    // Compatibility shims (used only by the sqlite init path, kept for safety)
    serialize(fn) { if (typeof fn === 'function') fn(); },
    exec(sql, cb) {
        pool.query(sql, (err) => { if (typeof cb === 'function') cb(err); });
    }
};

async function initDatabase() {
    // Make sure we are actually talking to a reachable host before touching the
    // schema. This is what transparently switches an IPv6-only DATABASE_URL over
    // to the IPv4 pooler on hosts without IPv6.
    const active = await ensureReachable();
    if (!active) {
        // Bail out now. Continuing would retry all ~60 schema statements against a
        // dead socket and stall the boot for minutes.
        throw new Error('Database is unreachable. Check DATABASE_URL (and use the Supabase pooler host on hosts without IPv6).');
    }

    // 1. Run schema (CREATE TABLE IF NOT EXISTS — safe to re-run).
    //
    //    Executed one statement at a time on purpose. Sending the whole file as
    //    a single batch means one bad statement — e.g. an index on a column that
    //    an older database does not have yet — aborts every statement after it,
    //    and the forward migrations below never run at all.
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const statements = schema
        .split('\n')
        .filter(line => !/^\s*--/.test(line))
        .join('\n')
        .split(';')
        .map(s => s.trim())
        .filter(Boolean);

    let skipped = 0;
    for (const sql of statements) {
        // One retry: Supabase's direct connection occasionally drops or times
        // out mid-boot, and skipping a CREATE TABLE because of a flaky socket
        // would leave the app without that table until the next restart.
        let done = false;
        for (let attempt = 1; attempt <= 2 && !done; attempt++) {
            try {
                await pool.query(sql);
                done = true;
            } catch (e) {
                const transient = /timeout|terminat|ECONNRESET|ETIMEDOUT|SSL connections/i.test(e.message);
                if (attempt === 2 || !transient) {
                    skipped++;
                    console.warn('Schema statement skipped:', e.message, '||', sql.split('\n')[0].slice(0, 90));
                } else {
                    console.warn('Schema statement retrying after:', e.message);
                }
            }
        }
    }
    if (skipped) console.warn(skipped + ' schema statement(s) skipped - see messages above');
    console.log('Connected to Supabase Postgres, schema ensured.');

    // 1b. Forward migrations for databases created before these columns existed.
    //     ALTER ... ADD COLUMN IF NOT EXISTS is idempotent, so this is safe every boot.
    const migrations = [
        `ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS practice_type TEXT DEFAULT 'independent'`,
        `ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS clinic_name TEXT`,
        `ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS clinic_address TEXT`,
        `ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS clinic_city TEXT`,
        `ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS clinic_state TEXT`,
        `ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS clinic_pincode TEXT`,
        `UPDATE doctor_profiles SET practice_type = 'independent' WHERE practice_type IS NULL OR practice_type = ''`,
        `ALTER TABLE hospital_memberships ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP`,
        `ALTER TABLE hospital_memberships ADD COLUMN IF NOT EXISTS ended_by INTEGER`,
        `ALTER TABLE hospital_memberships ADD COLUMN IF NOT EXISTS ended_reason TEXT`,
        `ALTER TABLE hospital_join_requests ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'doctor_request'`,
        `ALTER TABLE hospital_join_requests ADD COLUMN IF NOT EXISTS department_id INTEGER`,
        `ALTER TABLE hospital_join_requests ADD COLUMN IF NOT EXISTS invited_by INTEGER`,
        // Appointment -> hospital relationship (NULL = independent clinic doctor).
        // Added later, so existing rows stay NULL and keep working.
        `ALTER TABLE consultations ADD COLUMN IF NOT EXISTS hospital_id INTEGER`,
        `CREATE INDEX IF NOT EXISTS idx_consultations_hospital ON consultations(hospital_id)`,
        `CREATE INDEX IF NOT EXISTS idx_consultations_doctor_date ON consultations(doctor_id, date)`,
        // One affiliation row per (hospital, doctor) pair — ignore duplicates created
        // before the constraint existed rather than failing the whole migration.
        `DELETE FROM hospital_memberships a USING hospital_memberships b
          WHERE a.id > b.id AND a.hospital_id = b.hospital_id AND a.doctor_id = b.doctor_id`,
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_hospital_memberships_pair ON hospital_memberships(hospital_id, doctor_id)`
    ];
    for (const sql of migrations) {
        try {
            await pool.query(sql);
        } catch (e) {
            console.warn('Migration skipped:', e.message);
        }
    }

    // 2. Seed default admin if none exists (login: admin / admin123)
    const bcrypt = require('bcryptjs');
    const { rows } = await pool.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    if (!rows.length) {
        const hashed = bcrypt.hashSync('admin123', 10);
        await pool.query(
            'INSERT INTO users (username, email, password, role, full_name, phone) VALUES ($1,$2,$3,$4,$5,$6)',
            ['admin', 'admin@aidoctorassistant.com', hashed, 'admin', 'System Administrator', '(555) 000-0000']
        );
        console.log('Default admin created. Login: admin / admin123');
    }
    console.log('Database initialized successfully (Supabase)');
    return true;
}

module.exports = { db, initDatabase, pool };
