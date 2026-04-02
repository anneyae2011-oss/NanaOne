'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'login' | 'verify'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, type: 'login' }),
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

  const completeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, type: 'login' }),
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
          <h1 className="title-gradient">{phase === 'login' ? 'Welcome Back' : 'Verify Identity'}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '8px' }}>
             {phase === 'login' ? 'Log in with your phone number' : `Enter the code sent to ${phone}`}
          </p>
        </div>

        {phase === 'login' ? (
          <form onSubmit={startLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
          <form onSubmit={completeLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>
            <button className="btn-glass" type="button" onClick={() => setPhase('login')} style={{ border: 'none', color: 'var(--text-muted)' }}>
              Change Number
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Don't have an account? <Link href="/auth/signup" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Sign Up</Link>
        </p>
      </div>
    </div>
  );
}
