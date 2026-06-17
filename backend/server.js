// ── Backend API for the React login app ──────────────────────────────
// Built with Express + PostgreSQL. Hashes passwords with bcrypt and
// issues JWT tokens on login. User accounts live in a PostgreSQL database.

import 'dotenv/config'; // loads the .env file into process.env
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { isValidPhoneNumber } from 'libphonenumber-js';
import pkg from 'pg';

const { Pool } = pkg;

// ── Connect to PostgreSQL ────────────────────────────────────────────
// Reads PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE from the .env file
const pool = new Pool();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const PORT = 3001;
// Where the React app lives — used to build the password-reset link.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Email setup ──────────────────────────────────────────────────────
// We try Gmail first (if a working App Password is in .env). If that
// fails — or no Gmail is configured — we fall back to a free Ethereal
// TEST inbox: nothing is delivered to a real address, but every message
// gets a preview URL you can open in a browser to see exactly what was
// sent. That lets the whole flow work without any real mail account.
let transporter = null;     // the active nodemailer transport
let mailFrom = 'Login Page <no-reply@login.local>';
let usingEthereal = false;  // true when we're on the test inbox

async function initMailer() {
  // 1) Try real Gmail if credentials are present
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const gmail = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD, // 16-char Google App Password
      },
    });
    try {
      await gmail.verify();
      transporter = gmail;
      mailFrom = `"Login Page" <${process.env.GMAIL_USER}>`;
      console.log(`📧 Email: using Gmail (${process.env.GMAIL_USER})`);
      return;
    } catch (err) {
      console.warn(`⚠️  Gmail rejected the App Password (${err.message.split('\n')[0]})`);
      console.warn('   → Falling back to an Ethereal TEST inbox instead.');
    }
  }

  // 2) Fall back to an Ethereal test account (created fresh on each start)
  const acct = await nodemailer.createTestAccount();
  transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: acct.user, pass: acct.pass },
  });
  mailFrom = '"Login Page (test)" <no-reply@login.local>';
  usingEthereal = true;
  console.log('📧 Email: using Ethereal TEST inbox — messages are NOT really delivered.');
  console.log('   Open the preview link printed after each send to view the email.');
}

// Low-level send. Returns the Ethereal preview URL (or null for real mail).
async function sendMail(opts) {
  if (!transporter) return null;
  const info = await transporter.sendMail({ from: mailFrom, ...opts });
  const preview = usingEthereal ? nodemailer.getTestMessageUrl(info) : null;
  if (preview) console.log(`🔗 Email preview (${opts.to}): ${preview}`);
  return preview;
}

// Send a "you accessed the page" notice to the given address.
// Fire-and-forget: failures are logged but never block login/signup.
function sendAccessEmail(toEmail, action) {
  const verb = action === 'signup' ? 'created an account on' : 'logged in to';
  const when = new Date().toLocaleString();

  sendMail({
    to: toEmail,
    subject: 'Sign-in notification',
    text:
      `Hi,\n\nThis is a notification that you just ${verb} the login page.\n\n` +
      `Email: ${toEmail}\nTime: ${when}\n\n` +
      `If this wasn't you, please change your password.`,
    html:
      `<p>Hi,</p><p>This is a notification that you just <strong>${verb}</strong> the login page.</p>` +
      `<p><strong>Email:</strong> ${toEmail}<br><strong>Time:</strong> ${when}</p>` +
      `<p>If this wasn't you, please change your password.</p>`,
  })
    .then(() => console.log(`📧 Sign-in email queued for ${toEmail} (${action})`))
    .catch((err) => console.error(`❌ Could not send email to ${toEmail}:`, err.message));
}

// Send the password-reset link. Returns the preview URL (Ethereal) or null.
async function sendResetEmail(toEmail, token) {
  const link = `${FRONTEND_URL}/?reset=${token}`;
  return sendMail({
    to: toEmail,
    subject: 'Reset your password',
    text:
      `Hi,\n\nWe received a request to reset your password.\n\n` +
      `Open this link to choose a new password (expires in 30 minutes):\n${link}\n\n` +
      `If you didn't request this, you can ignore this email.`,
    html:
      `<p>Hi,</p><p>We received a request to reset your password.</p>` +
      `<p><a href="${link}">Click here to choose a new password</a> (expires in 30 minutes).</p>` +
      `<p>If you didn't request this, you can safely ignore this email.</p>`,
  });
}

const app = express();
app.use(cors());            // allow the React app (localhost:5173) to call us
app.use(express.json());    // parse JSON request bodies

// Make sure the tables exist when the server starts
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      email        TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT now(),
      updated_at   TIMESTAMPTZ
    )
  `);
  // Profile columns. Added separately so existing databases get them too.
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name  TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone      TEXT');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS country    TEXT');
  // One row per outstanding "forgot password" request.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      token      TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  // One row per successful login (and signup). Linked to a real user.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_history (
      id           SERIAL PRIMARY KEY,
      email        TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
      logged_in_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

// simple check that an email looks like an email
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Remove every space from a password (handles accidental spaces).
function cleanPassword(pw) {
  return (pw || '').replace(/\s/g, '');
}

// A "strong" password: 8+ chars with a lowercase, an uppercase, and a number.
// Returns an error message if it's too weak, or null if it's fine.
function passwordProblem(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include a number.';
  return null;
}

// ── SIGN UP ──────────────────────────────────────────────────────────
app.post('/api/signup', async (req, res) => {
  const { email, password, firstName, lastName, phone, country } = req.body;
  const mail = (email || '').trim().toLowerCase();
  const pass = cleanPassword(password); // strip any accidental spaces
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  const tel = (phone || '').trim();
  const ctry = (country || '').trim();

  if (!isValidEmail(mail))
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  const weak = passwordProblem(pass);
  if (weak) return res.status(400).json({ error: weak });
  if (!first || !last)
    return res.status(400).json({ error: 'Please enter your first and last name.' });
  if (!tel)
    return res.status(400).json({ error: 'Please enter your phone number.' });
  // The phone must be valid for the chosen country (correct length/format).
  if (!ctry || !isValidPhoneNumber(tel, ctry))
    return res.status(400).json({
      error: 'That phone number is not valid for the selected country.',
    });

  // is this email already taken?
  const existing = await pool.query('SELECT email FROM users WHERE email = $1', [mail]);
  if (existing.rows.length > 0)
    return res.status(409).json({ error: 'An account with that email already exists.' });

  // hash the password — we NEVER store the raw password
  const passwordHash = await bcrypt.hash(pass, 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, country)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [mail, passwordHash, first, last, tel, ctry]
  );

  // record this first login (the signup itself) in the history table
  await pool.query('INSERT INTO login_history (email) VALUES ($1)', [mail]);

  sendAccessEmail(mail, 'signup'); // notify the new user

  const token = jwt.sign({ email: mail }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, email: mail });
});

// ── LOG IN ───────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const mail = (email || '').trim().toLowerCase();

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [mail]);
  const user = result.rows[0];

  if (!user)
    return res.status(401).json({ error: 'No account found for that email.' });

  const ok = await bcrypt.compare(cleanPassword(password), user.password_hash);
  if (!ok)
    return res.status(401).json({ error: 'Incorrect password.' });

  // record this successful login in the history table
  await pool.query('INSERT INTO login_history (email) VALUES ($1)', [mail]);

  sendAccessEmail(mail, 'login'); // notify the user of the sign-in

  const token = jwt.sign({ email: mail }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, email: mail });
});

// ── FORGOT PASSWORD (step 1): email a reset link ─────────────────────
// The user submits their email. If the account exists we create a
// one-time token (valid 30 min) and email a link containing it.
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  const mail = (email || '').trim().toLowerCase();

  const result = await pool.query('SELECT email FROM users WHERE email = $1', [mail]);
  if (result.rows.length === 0)
    return res.status(404).json({ error: 'No account found for that email.' });

  // a long random, unguessable token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  // clear any older requests for this email, then store the new one
  await pool.query('DELETE FROM password_resets WHERE email = $1', [mail]);
  await pool.query(
    'INSERT INTO password_resets (token, email, expires_at) VALUES ($1, $2, $3)',
    [token, mail, expiresAt]
  );

  let previewUrl = null;
  try {
    previewUrl = await sendResetEmail(mail, token);
  } catch (err) {
    console.error(`❌ Could not send reset email to ${mail}:`, err.message);
    return res.status(500).json({ error: 'Could not send the reset email. Try again later.' });
  }

  // previewUrl is only set on the Ethereal test inbox — it lets the UI
  // show an "open the email" link during testing. On real Gmail it's null.
  res.json({ message: 'A reset link has been sent to your email.', previewUrl });
});

// ── RESET PASSWORD (step 2): set a new password using the token ──────
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  const pass = cleanPassword(newPassword); // strip any accidental spaces

  const weak = passwordProblem(pass);
  if (weak) return res.status(400).json({ error: weak });

  const result = await pool.query(
    'SELECT email, expires_at FROM password_resets WHERE token = $1',
    [token || '']
  );
  const row = result.rows[0];

  if (!row)
    return res.status(400).json({ error: 'This reset link is invalid. Request a new one.' });
  if (new Date(row.expires_at) < new Date()) {
    await pool.query('DELETE FROM password_resets WHERE token = $1', [token]);
    return res.status(400).json({ error: 'This reset link has expired. Request a new one.' });
  }

  const passwordHash = await bcrypt.hash(pass, 10);
  await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = now() WHERE email = $2',
    [passwordHash, row.email]
  );
  // token is single-use — remove it so the link can't be reused
  await pool.query('DELETE FROM password_resets WHERE token = $1', [token]);

  res.json({ message: 'Password updated. You can now log in.' });
});

// ── WHO AM I? (protected route — needs a valid token) ────────────────
app.get('/api/me', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  // Look up the full profile so the app can show the name and phone.
  const result = await pool.query(
    'SELECT email, first_name, last_name, phone, country FROM users WHERE email = $1',
    [payload.email]
  );
  const u = result.rows[0];
  if (!u) return res.status(404).json({ error: 'User not found.' });

  res.json({
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    phone: u.phone,
    country: u.country,
  });
});

// ── Start the server (after the database and mailer are ready) ───────
init()
  .then(() => initMailer())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Backend running at http://localhost:${PORT}`);
      console.log(`✅ Connected to PostgreSQL database "${process.env.PGDATABASE}"`);
    });
  })
  .catch((err) => {
    console.error('❌ Startup failed:', err.message);
  });
