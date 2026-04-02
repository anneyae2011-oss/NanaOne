'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, User, ArrowRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'signup' | 'verify'>('signup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // First, check if username exists to save time
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, type: 'signup' }),
      });

      const data = await res.json();
      if (res.ok) {
        setPhase('verify');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const completeSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, username, type: 'signup' }),
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('nana_api_key', data.apiKey);
        localStorage.setItem('nana_username', data.username);
        router.push('/dashboard');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 className="title-gradient">{phase === 'signup' ? 'Create Account' : 'Verify Code'}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '8px' }}>
            {phase === 'signup' ? 'Join NanaOne Premium Gateway' : `Enter the code sent to ${phone}`}
          </p>
        </div>

        {phase === 'signup' ? (
          <form onSubmit={startSignup} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={14} /> Desired Username
              </label>
              <input 
                className="input-field" 
                placeholder="e.g. nana_fan_1" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Phone size={14} /> Phone Number
              </label>
              <input 
                className="input-field" 
                placeholder="+1234567890" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                type="tel"
              />
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', textAlign: 'center' }}>{error}</p>}

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Sending Code...' : 'Send Verification Code'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>
        ) : (
          <form onSubmit={completeSignup} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Enter 6-digit OTP
              </label>
              <input 
                className="input-field" 
                placeholder="000000" 
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={6}
                style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '1.5rem', fontWeight: 'bold' }}
              />
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', textAlign: 'center' }}>{error}</p>}

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Sign Up'}
            </button>
            <button className="btn-glass" type="button" onClick={() => setPhase('signup')} style={{ border: 'none', color: 'var(--text-muted)' }}>
              Change Number
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Already have an account? <Link href="/auth/login" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Login</Link>
        </p>
      </div>
    </div>
  );
}
