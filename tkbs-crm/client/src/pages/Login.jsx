import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../App';

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
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
            background: '#FFF3E0', color: '#E6A817', padding: '8px 12px',
            borderRadius: 4, fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            required autoFocus
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #E2E6EB',
              borderRadius: 4, fontSize: 14, outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Password</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #E2E6EB',
              borderRadius: 4, fontSize: 14, outline: 'none',
            }}
          />
        </div>

        <button
          type="submit" disabled={loading}
          style={{
            width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
            border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
