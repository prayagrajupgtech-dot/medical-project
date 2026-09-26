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
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000
});

pool.on('error', (err) => {
    console.error('Supabase pool error:', err.message);
});

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
    // 1. Run schema (CREATE TABLE IF NOT EXISTS — safe to re-run)
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
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
