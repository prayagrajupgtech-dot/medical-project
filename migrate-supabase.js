// One-time: copy SQLite data -> Supabase Postgres, preserving ids.
// Run with USE_SUPABASE unset (reads from SQLite).
require('dotenv').config();
process.env.USE_SUPABASE = '';
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Pool } = require('pg');

const lite = new sqlite3.Database(path.join(__dirname, 'database', 'medical.db'));
const pg = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

function liteAll(sql) {
    return new Promise((res, rej) => lite.all(sql, [], (e, r) => e ? rej(e) : res(r)));
}

const TABLES = {
    users: ['id', 'username', 'email', 'password', 'role', 'full_name', 'phone', 'specialty', 'photo', 'accountStatus', 'blockedAt', 'blockedBy', 'blockReason', 'lastLoginAt', 'deletedAt', 'deletedBy', 'originalUsername', 'originalEmail', 'originalFullName', 'preferredLanguage', 'preferredLocale', 'created_at'],
    audit_logs: ['id', 'user_id', 'action', 'table_name', 'record_id', 'details', 'ip_address', 'created_at'],
    medical_retrieval_logs: ['id', 'user_id', 'query', 'intent', 'topics', 'sources_retrieved', 'chunks_retrieved', 'response_generated', 'safety_flag', 'latency_ms', 'created_at']
};

(async () => {
    try {
        // Valid user ids on Supabase (for orphaned FK repair)
        const urows = await pg.query('SELECT id FROM users');
        const validUsers = new Set(urows.rows.map(r => r.id));

        for (const [table, cols] of Object.entries(TABLES)) {
            const rows = await liteAll('SELECT * FROM ' + table);
            console.log(table + ': ' + rows.length + ' rows in sqlite');
            await pg.query('DELETE FROM ' + table);
            let n = 0;
            for (const row of rows) {
                // Null out user FKs pointing to deleted users
                for (const fk of ['user_id', 'patient_id', 'doctor_id', 'sender_id', 'recipient_id', 'uploaded_by', 'approved_by', 'reviewed_by', 'added_by']) {
                    if (fk in row && row[fk] !== null && row[fk] !== undefined && !validUsers.has(row[fk])) {
                        row[fk] = null;
                    }
                }
                const vals = cols.map(c => row[c] === undefined ? null : row[c]);
                const ph = vals.map((_, i) => '$' + (i + 1)).join(',');
                await pg.query(
                    'INSERT INTO ' + table + ' (' + cols.join(',') + ') VALUES (' + ph + ') ON CONFLICT (id) DO NOTHING',
                    vals
                );
                n++;
            }
            // Fix the SERIAL sequence so future inserts don't clash
            await pg.query(
                "SELECT setval(pg_get_serial_sequence('" + table + "','id'), COALESCE((SELECT MAX(id) FROM " + table + '), 1))'
            );
            console.log(table + ': migrated ' + n);
        }
        const r = await pg.query('SELECT role, COUNT(*) c FROM users GROUP BY role');
        console.log('SUPABASE USERS:', JSON.stringify(r.rows));
    } catch (e) {
        console.error('MIGRATION FAILED:', e.message);
        process.exit(1);
    }
    lite.close();
    await pg.end();
})();
