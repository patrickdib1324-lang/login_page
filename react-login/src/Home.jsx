import { useEffect, useState } from 'react';
import { findCountry, flagFor } from './countries';

const API = `http://${window.location.hostname || 'localhost'}:3001`;

export default function Home({ email, onLogout }) {
  const [profile, setProfile] = useState(null);

  // After login, fetch the full profile (name, phone, country) from the API.
  useEffect(() => {
    const token = sessionStorage.getItem('token');
    fetch(`${API}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setProfile(data))
      .catch(() => setProfile(null));
  }, []);

  const fullName =
    profile && (profile.firstName || profile.lastName)
      ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
      : null;

  const country = profile?.country ? findCountry(profile.country) : null;

  return (
    <div className="card welcome">
      <h1>Hi{fullName ? `, ${profile.firstName}` : ''}! 👋</h1>
      <p className="sub">
        You are logged in as <strong>{email}</strong>
      </p>

      <ul className="profile">
        {fullName && (
          <li>
            <span className="k">Name</span>
            <span className="v">{fullName}</span>
          </li>
        )}
        {profile?.phone && (
          <li>
            <span className="k">Phone</span>
            <span className="v">{profile.phone}</span>
          </li>
        )}
        {country && (
          <li>
            <span className="k">Country</span>
            <span className="v">
              {flagFor(country.code)} {country.name}
            </span>
          </li>
        )}
      </ul>

      <button className="submit" onClick={onLogout}>
        Log out
      </button>
    </div>
  );
}
