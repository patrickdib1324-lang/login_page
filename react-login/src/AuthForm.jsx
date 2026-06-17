import { useState } from 'react';
import { isValidPhoneNumber, parsePhoneNumber } from 'libphonenumber-js';
import { COUNTRIES, flagFor } from './countries';

// Address of our backend server. We use the SAME host the page was opened
// from (localhost on the laptop, or the laptop's WiFi IP on the phone) so
// it works on every device without hardcoding an address.
const API = `http://${window.location.hostname || 'localhost'}:3001`;

export default function AuthForm({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [country, setCountry] = useState('US'); // selected country code
  const [phone, setPhone] = useState('');        // local number (no dial code)
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [resetLink, setResetLink] = useState(''); // test-inbox preview link
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';

  // dial code (e.g. "+961") for the currently selected country
  const dial = COUNTRIES.find((c) => c.code === country)?.dial || '';

  // Live password-strength rules (used to show the checklist on signup).
  const rules = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'A lowercase letter', ok: /[a-z]/.test(password) },
    { label: 'An uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'A number', ok: /[0-9]/.test(password) },
  ];
  const passwordStrong = rules.every((r) => r.ok);

  // Is the typed phone number valid FOR THE SELECTED COUNTRY?
  // e.g. a US-length number won't validate while "Lebanon" is selected.
  let phoneValid = false;
  try {
    phoneValid = phone.trim() ? isValidPhoneNumber(phone.trim(), country) : false;
  } catch {
    phoneValid = false;
  }

  function switchMode(m) {
    setMode(m);
    setMsg({ text: '', type: '' });
    setResetLink('');
    setPassword('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: '', type: '' });
    setLoading(true);

    try {
      // ── Forgot password: email the user a reset link ──
      if (isReset) {
        const res = await fetch(`${API}/api/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMsg({ text: data.error || 'Something went wrong.', type: 'error' });
          return;
        }
        setMsg({
          text: 'Check your email for a link to reset your password.',
          type: 'success',
        });
        // On the test inbox the backend returns a preview link so you can
        // open the email right here. (Empty on real Gmail.)
        setResetLink(data.previewUrl || '');
        return;
      }

      // ── Login or Sign up ──
      // On signup we also send the name and the full phone number
      // (dial code + the digits the user typed). Login only needs email+password.
      // Format the phone to a clean international form (e.g. "+961 70 123 456")
      // using the rules for the selected country.
      const formattedPhone = parsePhoneNumber(phone.trim(), country).formatInternational();

      const body = isSignup
        ? {
            email,
            password,
            firstName,
            lastName,
            country,
            phone: formattedPhone,
          }
        : { email, password };

      const res = await fetch(`${API}/api/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ text: data.error || 'Something went wrong.', type: 'error' });
        return;
      }

      if (isSignup) {
        setMsg({ text: 'Account created! Logging you in…', type: 'success' });
        setTimeout(() => onLogin(data.email, data.token), 600);
      } else {
        onLogin(data.email, data.token);
      }
    } catch {
      setMsg({
        text: 'Cannot reach the server. Is the backend running?',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  // text that changes depending on the mode
  const title = isLogin ? 'Welcome back' : isSignup ? 'Create account' : 'Reset password';
  const subtitle = isLogin
    ? 'Log in to your account'
    : isSignup
    ? 'Sign up to get started'
    : "Enter your email and we'll send you a reset link";
  const buttonText = isLogin ? 'Log in' : isSignup ? 'Sign up' : 'Send reset link';

  return (
    <div className="card">
      <h1>{title}</h1>
      <p className="sub">{subtitle}</p>

      {/* Tabs only show for login/signup, not the reset screen */}
      {!isReset && (
        <div className="tabs">
          <button
            className={'tab' + (isLogin ? ' active' : '')}
            onClick={() => switchMode('login')}
          >
            Log in
          </button>
          <button
            className={'tab' + (isSignup ? ' active' : '')}
            onClick={() => switchMode('signup')}
          >
            Sign up
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* First/last name + phone are only collected when signing up */}
        {isSignup && (
          <>
            <div className="row">
              <div className="col">
                <label>First name</label>
                <input
                  type="text"
                  value={firstName}
                  placeholder="John"
                  autoComplete="given-name"
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="col">
                <label>Last name</label>
                <input
                  type="text"
                  value={lastName}
                  placeholder="Doe"
                  autoComplete="family-name"
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <label>Country</label>
            <select
              className="country-select"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {flagFor(c.code)} {c.name} ({c.dial})
                </option>
              ))}
            </select>

            <label>Phone number</label>
            <div className="phone-row">
              <span className="dial">{dial}</span>
              <input
                type="tel"
                value={phone}
                placeholder="70 123 456"
                autoComplete="tel-national"
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            {/* Tell the user whether the number fits the chosen country */}
            {phone.trim() &&
              (phoneValid ? (
                <p className="phone-hint ok">✓ Valid phone number</p>
              ) : (
                <p className="phone-hint bad">
                  ✗ Not a valid number for the selected country
                </p>
              ))}
          </>
        )}

        <label>Email</label>
        <input
          type="email"
          value={email}
          placeholder="you@example.com"
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {/* Password is not needed on the reset screen — we only collect
            the email there and send a link. */}
        {!isReset && (
          <>
            <label>Password</label>
            <input
              type="password"
              value={password}
              placeholder="Enter password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              // strip any spaces the moment they're typed (handles mistakes)
              onChange={(e) => setPassword(e.target.value.replace(/\s/g, ''))}
              required
            />

            {/* Live strength checklist — only while signing up */}
            {isSignup && password.length > 0 && (
              <ul className="pw-rules">
                {rules.map((r) => (
                  <li key={r.label} className={r.ok ? 'ok' : ''}>
                    {r.ok ? '✓' : '○'} {r.label}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <button
          type="submit"
          className="submit"
          disabled={loading || (isSignup && (!passwordStrong || !phoneValid))}
        >
          {loading ? 'Please wait…' : buttonText}
        </button>
      </form>

      {/* "Forgot password?" link — only on the login screen */}
      {isLogin && (
        <p className="link-row">
          <button className="link" onClick={() => switchMode('reset')}>
            Forgot password?
          </button>
        </p>
      )}

      {/* "Back to login" link — only on the reset screen */}
      {isReset && (
        <p className="link-row">
          <button className="link" onClick={() => switchMode('login')}>
            ← Back to log in
          </button>
        </p>
      )}

      <p className={'msg ' + msg.type}>{msg.text}</p>

      {/* Test-inbox only: a direct link to view the reset email */}
      {resetLink && (
        <p className="link-row">
          <a className="link" href={resetLink} target="_blank" rel="noreferrer">
            📧 Open the reset email (test inbox)
          </a>
        </p>
      )}
    </div>
  );
}
