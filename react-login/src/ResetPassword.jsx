import { useState } from 'react';

// Same host the page was opened from — works on laptop and phone alike.
const API = `http://${window.location.hostname || 'localhost'}:3001`;

// Shown when the user opens the reset link from their email
// (…/?reset=TOKEN). They pick a new password; we send it with the token.
export default function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Same strength rules as signup.
  const rules = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'A lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'An uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'A number', ok: /[0-9]/.test(password) },
  ];
  const passwordStrong = rules.every((r) => r.ok);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: '', type: '' });
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ text: data.error || 'Something went wrong.', type: 'error' });
        return;
      }

      setDone(true);
      setMsg({ text: 'Password changed! You can log in now.', type: 'success' });
    } catch {
      setMsg({
        text: 'Cannot reach the server. Is the backend running?',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h1>Choose a new password</h1>
      <p className="sub">Enter a new password for your account.</p>

      {!done ? (
        <form onSubmit={handleSubmit}>
          <label>New password</label>
          <input
            type="password"
            value={password}
            placeholder="Enter new password"
            autoComplete="new-password"
            // strip any accidental spaces as they're typed
            onChange={(e) => setPassword(e.target.value.replace(/\s/g, ''))}
            required
          />

          {password.length > 0 && (
            <ul className="pw-rules">
              {rules.map((r) => (
                <li key={r.label} className={r.ok ? 'ok' : ''}>
                  {r.ok ? '✓' : '○'} {r.label}
                </li>
              ))}
            </ul>
          )}

          <button
            type="submit"
            className="submit"
            disabled={loading || !passwordStrong}
          >
            {loading ? 'Please wait…' : 'Save new password'}
          </button>
        </form>
      ) : (
        <button className="submit" onClick={onDone}>
          Go to log in
        </button>
      )}

      <p className="link-row">
        <button className="link" onClick={onDone}>
          ← Back to log in
        </button>
      </p>

      <p className={'msg ' + msg.type}>{msg.text}</p>
    </div>
  );
}
