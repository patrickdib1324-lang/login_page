# Login Page (React + Express + PostgreSQL)

A full-stack login/signup app with email notifications, password reset,
strong-password rules, and country-aware phone validation.

## Project structure

```
login page/
├─ backend/        Express API (server.js) + PostgreSQL
└─ react-login/    React app (Vite)
```

## Features

- Sign up / log in with email + password (passwords hashed with bcrypt).
- **Strong password** required: 8+ chars, upper + lower case, and a number.
  Accidental spaces are stripped automatically.
- **Profile fields**: first name, last name, country, and phone number.
- **Phone validation**: the number must be valid for the selected country
  (via libphonenumber-js) — a US-length number won't pass while "Lebanon"
  is selected, etc.
- **Forgot / reset password** by email link.
- **Login history**: every login/signup is recorded in a `login_history` table.
- Email notifications on sign-in (Gmail, with an Ethereal test-inbox fallback).

## Database

PostgreSQL database named `loginapp` with three tables (auto-created on start):

- `users` — email, password_hash, first_name, last_name, phone, country, timestamps
- `password_resets` — one-time reset tokens
- `login_history` — one row per login (id, email, logged_in_at)

Connection settings live in `backend/.env` (PGHOST, PGPORT, PGUSER,
PGPASSWORD, PGDATABASE).

## Running locally

### 1. Backend

```bash
cd backend
npm install
npm start          # starts on http://localhost:3001
```

Requires a running PostgreSQL server and a database matching `.env`.

### 2. Frontend

```bash
cd react-login
npm install
npm run dev        # starts on http://localhost:5173
```

Open http://localhost:5173 in your browser.

## Notes

- `backend/.env` contains secrets (DB password, Gmail App Password, JWT secret).
  Keep it private — never commit or share it publicly.
- Existing accounts created before the strong-password / phone rules were
  added are unaffected; the rules apply to new signups and password resets.
