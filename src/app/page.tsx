'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Rocket, Key, ExternalLink } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [isLogged, setIsLogged] = useState(false);

  useEffect(() => {
    const key = localStorage.getItem('nana_api_key');
    if (key) setIsLogged(true);
  }, []);

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
      <div className="grid-bg"></div>
      <div style={{ textAlign: 'center', marginBottom: '80px' }}>
        <h1 className="title-gradient" style={{ fontSize: '5rem', marginBottom: '16px', letterSpacing: '-2px' }}>NanaOne</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.25rem', maxWidth: '600px', margin: '0 auto' }}>
          The power of elite AI, delivered through a secure, high-performance gateway.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px' }}>
        <div className="glass-card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px' }}>
          <div style={{ background: 'rgba(124, 58, 237, 0.1)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Rocket style={{ color: 'var(--primary)' }} />
          </div>
          <h3 style={{ marginBottom: '12px', fontSize: '1.5rem' }}>User Portal</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '0.95rem', lineHeight: '1.6' }}>
            Access the elite AI gateway. Generate unique keys, track credits, and manage your one-time balance.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {!isLogged ? (
               <>
                <button className="btn-primary" style={{ width: '100%' }} onClick={() => router.push('/auth/signup')}>
                  Get Started <ChevronRight size={18} />
                </button>
                <button className="btn-secondary" style={{ width: '100%' }} onClick={() => router.push('/auth/login')}>
                  Login to Account
                </button>
               </>
            ) : (
              <button className="btn-primary" style={{ width: '100%' }} onClick={() => router.push('/dashboard')}>
                Go to Dashboard <Rocket size={18} />
              </button>
            )}
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
