#!/usr/bin/env node
// Secure admin account creation script.
// Usage: npm run create-admin
// Prompts for Name, Username, Email and Password, validates input, hashes the
// password with bcrypt (10 rounds) and creates the account with role=admin,
// accountStatus=active. Never stores plaintext passwords.

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3');

const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(__dirname, '..', 'database', 'medical.db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });

// For non-TTY automation (piped input), read all lines up front so prompts can
// consume from the buffer instead of relying on readline's event timing.
const pipedLines = process.stdin.isTTY ? null : fs.readFileSync(0, 'utf8').split(/\r?\n/);
function pipedNext() {
    return pipedLines && pipedLines.length ? pipedLines.shift() : undefined;
}

function ask(question) {
    if (pipedLines) {
        process.stdout.write(question);
        return Promise.resolve(pipedNext() || '');
    }
    return new Promise((resolve) => rl.question(question, resolve));
}

// Password prompt without echoing input to the terminal (falls back to a plain
// prompt when stdin is not a TTY, e.g. piped input during automation)
function askPassword(question) {
    if (!process.stdin.isTTY) {
        return ask(question);
    }
    return new Promise((resolve) => {
        process.stdout.write(question);
        const stdin = process.openStdin();
        process.stdin.setRawMode(true);
        let input = '';
        const onData = (chunk) => {
            const ch = chunk.toString();
            if (ch === '\r' || ch === '\n') {
                process.stdin.setRawMode(false);
                stdin.removeListener('data', onData);
                process.stdout.write('\n');
                resolve(input);
                return;
            }
            if (ch === '\u0003') { // Ctrl+C
                process.stdin.setRawMode(false);
                stdin.removeListener('data', onData);
                process.stdout.write('\n');
                resolve(null);
                return;
            }
            if (ch === '\u007f' || ch === '\b') { // Backspace
                input = input.slice(0, -1);
                return;
            }
            input += ch;
            process.stdout.write('*');
        };
        stdin.on('data', onData);
    });
}

function passwordPolicyError(pw) {
    if (!pw || pw.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(pw)) return 'Password must contain at least one number';
    return null;
}

(async () => {
    console.log('=== Create Administrator Account ===');
    console.log('DB: ' + DB_PATH);
    if (!fs.existsSync(DB_PATH)) {
        console.log('ERROR: Database not found at ' + DB_PATH + '. Start the server once to initialise it.');
        process.exit(1);
    }

    const fullName = (await ask('Full Name: ')).trim();
    const username = (await ask('Username: ')).trim();
    const email = (await ask('Email: ')).trim();
    const password = await askPassword('Password: ');
    const confirm = await askPassword('Confirm Password: ');

    if (!fullName) { console.log('ERROR: Full name is required.'); process.exit(1); }
    if (!/^[a-zA-Z0-9_.-]{3,}$/.test(username)) { console.log('ERROR: Username must be at least 3 characters (letters, numbers, _ . -).'); process.exit(1); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.log('ERROR: Please enter a valid email address.'); process.exit(1); }
    if (!password) { console.log('ERROR: Password is required.'); process.exit(1); }
    if (password !== confirm) { console.log('ERROR: Passwords do not match.'); process.exit(1); }
    const pwdErr = passwordPolicyError(password);
    if (pwdErr) { console.log('ERROR: ' + pwdErr + '.'); process.exit(1); }

    const db = new sqlite3.Database(DB_PATH);
    db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], async (err, existing) => {
        if (err) { console.log('ERROR: ' + err.message); db.close(); process.exit(1); }
        if (existing) { console.log('ERROR: Username or email already exists.'); db.close(); process.exit(1); }

        const hashed = await bcrypt.hash(password, 10);
        db.run(
            'INSERT INTO users (username, email, password, role, full_name, accountStatus) VALUES (?, ?, ?, ?, ?, ?)',
            [username, email, hashed, 'admin', fullName, 'active'],
            function (insertErr) {
                if (insertErr) {
                    console.log('ERROR: ' + insertErr.message);
                    db.close();
                    process.exit(1);
                }
                const userId = this.lastID;
                db.run(
                    'INSERT INTO audit_logs (user_id, action, table_name, record_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
                    [userId, 'CREATE', 'users', userId, JSON.stringify({ username, email, role: 'admin', via: 'create-admin-script' }), 'CLI'],
                    () => {
                        db.close();
                        console.log('');
                        console.log('SUCCESS: Administrator account created.');
                        console.log('  Username : ' + username);
                        console.log('  Email    : ' + email);
                        console.log('  Role     : admin (accountStatus: active)');
                        console.log('  Password : hashed with bcrypt (10 rounds) - not stored in plaintext');
                        console.log('');
                        console.log('Log in at /login and you will be redirected to /admin/dashboard.');
                        process.exit(0);
                    }
                );
            }
        );
    });
})().catch((e) => { console.log('ERROR: ' + e.message); process.exit(1); });