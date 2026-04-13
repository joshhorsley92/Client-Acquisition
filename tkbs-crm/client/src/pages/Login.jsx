import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../App';

export default function Login() {
  const { user, login, verifyTotp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" />;

  const isRateLimit = error && /too many/i.test(error);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mfaRequired) {
        await verifyTotp(email, password, totpCode);
      } else {
        const data = await login(email, password);
        if (data?.mfa_required) {
          setMfaRequired(true);
          setTotpCode('');
        }
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const resetToLogin = () => {
    setMfaRequired(false);
    setTotpCode('');
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#1B2838',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', borderRadius: 8, padding: 40, width: 360,
        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span style={{ fontWeight: 'bold', fontSize: 24 }}>
            <span style={{ color: '#1B2838' }}>TURN</span>
            <span style={{ color: '#00D4AA' }}>KEY</span>
          </span>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Client Acquisition CRM</div>
        </div>

        {error && (
          <div style={{
            background: isRateLimit ? '#FEE2E2' : '#FFF3E0',
            color: isRateLimit ? '#dc2626' : '#E6A817',
            padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {!mfaRequired && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required autoFocus autoComplete="email"
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #E2E6EB',
                  borderRadius: 4, fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Password</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete="current-password"
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #E2E6EB',
                  borderRadius: 4, fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </>
        )}

        {mfaRequired && (
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>
              Verification Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              style={{
                width: '100%', padding: '12px', border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 22, letterSpacing: 8, textAlign: 'center',
                outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace',
              }}
            />
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 8, textAlign: 'center' }}>
              Enter the 6-digit code from your authenticator app
            </div>
            <button
              type="button" onClick={resetToLogin}
              style={{
                marginTop: 8, background: 'none', border: 'none', color: '#64748B',
                fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'center', width: '100%',
              }}
            >
              ← Back to login
            </button>
          </div>
        )}

        <button
          type="submit" disabled={loading || (mfaRequired && totpCode.length !== 6)}
          style={{
            width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
            border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
            cursor: (loading || (mfaRequired && totpCode.length !== 6)) ? 'not-allowed' : 'pointer',
            opacity: (loading || (mfaRequired && totpCode.length !== 6)) ? 0.6 : 1,
          }}
        >
          {loading ? (mfaRequired ? 'Verifying...' : 'Signing in...') : (mfaRequired ? 'Verify' : 'Sign In')}
        </button>
      </form>
    </div>
  );
}
