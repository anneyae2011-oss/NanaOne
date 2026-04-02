'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Rocket, Key, ExternalLink } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState('');

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'enyapeakshit') {
      localStorage.setItem('admin_access', 'true');
      router.push('/admin');
    } else {
      alert('Invalid admin password');
    }
  };

  return (
    <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '100px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '60px' }}>
        <h1 className="title-gradient" style={{ fontSize: '4rem', marginBottom: '16px' }}>NanaOne</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.25rem', maxWidth: '600px', margin: '0 auto' }}>
          The power of elite AI, delivered through a secure, high-performance gateway.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <div style={{ background: 'rgba(124, 58, 237, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Key style={{ color: 'var(--primary)' }} />
          </div>
          <h3 style={{ marginBottom: '12px' }}>User Portal</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
            Generate your unique NanaOne API keys and track your daily $20 credits.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="btn-primary" style={{ width: '100%' }} onClick={() => router.push('/auth/signup')}>
              Join NanaOne <Rocket size={18} />
            </button>
            <button className="btn-glass" style={{ width: '100%', background: 'rgba(255,255,255,0.05)' }} onClick={() => router.push('/auth/login')}>
              Existing User Login
            </button>
            <button className="btn-glass" style={{ width: '100%', border: 'none', fontSize: '0.8rem', color: 'var(--text-muted)' }} onClick={() => router.push('/dashboard')}>
              Go to Dashboard
            </button>
          </div>
        </div>

        <div className="glass-card" style={{ textAlign: 'center' }}>
          <div style={{ background: 'rgba(0, 242, 254, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Shield style={{ color: 'var(--accent)' }} />
          </div>
          <h3 style={{ marginBottom: '12px' }}>Admin Panel</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
            Configure upstream providers and manage system models.
          </p>
          
           {!isAdmin ? (
            <button className="btn-primary" style={{ width: '100%', background: 'var(--secondary)', border: '1px solid var(--glass-border)' }} onClick={() => setIsAdmin(true)}>
              Admin Login
            </button>
          ) : (
            <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input 
                type="password" 
                className="input-field" 
                placeholder="Enter password..." 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn-primary" style={{ width: '100%' }}>Login</button>
            </form>
          )}
        </div>
      </div>

      <footer style={{ marginTop: '100px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        <p>© 2026 NanaOne. All models integrated from private elite endpoints.</p>
      </footer>
    </main>
  );
}
