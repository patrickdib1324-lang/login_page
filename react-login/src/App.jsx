import { useState } from 'react';
import AuthForm from './AuthForm';
import ResetPassword from './ResetPassword';
import Home from './Home';
import './App.css';

// If the page was opened from a reset link (…/?reset=TOKEN), grab the token.
function getResetToken() {
  return new URLSearchParams(window.location.search).get('reset');
}

export default function App() {
  // We remember the logged-in user via a token saved in the browser.
  const [currentEmail, setCurrentEmail] = useState(
    sessionStorage.getItem('currentEmail')
  );
  const [resetToken, setResetToken] = useState(getResetToken());

  function login(email, token) {
    sessionStorage.setItem('currentEmail', email);
    sessionStorage.setItem('token', token);
    setCurrentEmail(email);
  }

  function logout() {
    sessionStorage.removeItem('currentEmail');
    sessionStorage.removeItem('token');
    setCurrentEmail(null);
  }

  // Called when the reset screen is finished (or cancelled): drop the
  // ?reset=… from the URL and go back to the normal login page.
  function finishReset() {
    window.history.replaceState({}, '', window.location.pathname);
    setResetToken(null);
  }

  return (
    <div className="page">
      {resetToken ? (
        <ResetPassword token={resetToken} onDone={finishReset} />
      ) : currentEmail ? (
        <Home email={currentEmail} onLogout={logout} />
      ) : (
        <AuthForm onLogin={login} />
      )}
    </div>
  );
}
