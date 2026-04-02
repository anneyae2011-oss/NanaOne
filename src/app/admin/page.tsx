'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, RefreshCw, Save, ArrowLeft, Globe, Key } from 'lucide-react';

export default function AdminPage() {
  const router = useRouter();
  const [endpoint, setEndpoint] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const access = localStorage.getItem('admin_access');
    if (access !== 'true') {
      router.push('/');
      return;
    }

    fetch('/api/admin/settings')
      .then(res => res.json())
      .then(data => {
        setEndpoint(data.upstreamEndpoint || '');
        setKey(data.upstreamKey || '');
      });
  }, [router]);

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ endpoint, key }),
    });
    setSaving(false);
    alert('Settings saved and models refreshed!');
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
      <button 
        onClick={() => router.push('/')}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '24px' }}
      >
        <ArrowLeft size={16} /> Back to Landing
      </button>

      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <Settings className="title-gradient" />
          <h2 className="title-gradient">Provider Configuration</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={14} /> Upstream API Endpoint
            </label>
            <input 
              className="input-field" 
              value={endpoint} 
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Key size={14} /> Upstream API Key
            </label>
            <input 
              type="password"
              className="input-field" 
              value={key} 
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
            />
          </div>

          <button 
            className="btn-primary" 
            onClick={handleSave} 
            disabled={saving}
            style={{ marginTop: '12px' }}
          >
            {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
            {saving ? 'Saving...' : 'Save & Refresh Models'}
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <Key className="title-gradient" />
          <h2 className="title-gradient">Redeem Codes</h2>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <input 
            type="number" 
            className="input-field" 
            placeholder="Amount ($)" 
            id="codeAmount"
          />
          <button className="btn-primary" onClick={async () => {
            const amount = (document.getElementById('codeAmount') as HTMLInputElement).value;
            if (!amount) return alert('Enter amount');
            const res = await fetch('/api/admin/redeem-codes', {
              method: 'POST',
              body: JSON.stringify({ amount })
            });
            const data = await res.json();
            alert(`Code Created: ${data.code}`);
            window.location.reload();
          }}>
            Generate Code
          </button>
        </div>

        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
           {/* We can fetch and list codes here if needed, but for now simple generation works */}
           <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Latest codes are generated above. Check database for full list.</p>
        </div>
      </div>

      <div className="glass-card" style={{ marginTop: '24px', opacity: 0.7 }}>
        <h4 style={{ marginBottom: '12px', fontSize: '0.9rem' }}>System Info</h4>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
          <span>Version</span>
          <span>NanaOne v1.0.0</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '8px' }}>
          <span>Pricing</span>
          <span>$8/1M Input, $25/1M Output</span>
        </div>
      </div>
    </div>
  );
}
