'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiRequest } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState('customer');
  const [schoolId, setSchoolId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [storeDescription, setStoreDescription] = useState('');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = registering
        ? await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              school_id: schoolId,
              full_name: fullName,
              email,
              password,
              role,
              ...(role === 'seller' ? {
                store_name: storeName,
                store_location: storeLocation,
                store_description: storeDescription,
              } : {}),
            }),
          })
        : await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ school_id: schoolId, password, role }),
          });
      router.replace(result.data.redirect);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-logo-wrap" aria-label="HNU logo">
          <Image className="hnu-logo" src="/hnu-logo.png" alt="Holy Name University crest" width={110} height={134} priority />
        </div>
        <h1 className="login-title">Welcome to HNU StallHub</h1>
        <p className="login-intro">Sign in to order from campus stalls or manage your stall.</p>

        <p className="role-picker-label">{registering ? 'Create an account as' : 'Log in as'}</p>
        <div className="role-picker" role="radiogroup" aria-label={registering ? 'Choose account type to create' : 'Choose your account type'}>
            {[['customer', 'Customer'], ['seller', 'Seller']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={role === value ? 'role-option active' : 'role-option'}
                onClick={() => setRole(value)}
                aria-pressed={role === value}
              >
                {label}
              </button>
            ))}
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="schoolId">School ID <span className="required-star">*</span></label>
          <input
            id="schoolId"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{8}"
            maxLength={8}
            placeholder="8 digits"
            autoComplete="username"
            value={schoolId}
            onChange={(event) => setSchoolId(event.target.value.replace(/\D/g, '').slice(0, 8))}
            required
          />
          <p className="school-id-hint">Enter your assigned 8-digit School ID.</p>

          {registering && (
            <>
              <label htmlFor="fullName">Full name <span className="required-star">*</span></label>
              <input id="fullName" type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              <label htmlFor="email">Email <span className="required-star">*</span></label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              {role === 'seller' && (
                <>
                  <label htmlFor="storeName">Stall name <span className="required-star">*</span></label>
                  <input id="storeName" type="text" value={storeName} onChange={(event) => setStoreName(event.target.value)} required />
                  <label htmlFor="storeLocation">Stall location <span className="required-star">*</span></label>
                  <input id="storeLocation" type="text" value={storeLocation} onChange={(event) => setStoreLocation(event.target.value)} required />
                  <label htmlFor="storeDescription">Stall description</label>
                  <input id="storeDescription" type="text" value={storeDescription} onChange={(event) => setStoreDescription(event.target.value)} />
                </>
              )}
            </>
          )}

          <label htmlFor="password">Password <span className="required-star">*</span></label>
          <input
            id="password"
            type="password"
            autoComplete={registering ? 'new-password' : 'current-password'}
            minLength={registering ? 10 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="submit-button" disabled={loading}>
            {loading ? 'Please wait...' : registering ? `Create ${role === 'seller' ? 'Seller' : 'Customer'} Account` : 'Log In'}
          </button>
        </form>

        <p className="account-switch">
          {registering ? 'Already have an account?' : 'New to StallHub?'}{' '}
          <button type="button" onClick={() => { setRegistering(!registering); setError(''); }}>
            {registering ? 'Log in' : 'Create an account'}
          </button>
        </p>
        {!registering && <p className="seller-account-note">
          To create a seller account, choose Seller above, then select Create an account.
        </p>}
      </section>
    </main>
  );
}
