import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Identifiants invalides');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg2)' }}>
      <div style={{ background:'var(--bg)', border:`0.5px solid var(--border)`, borderRadius:'var(--radius-lg)', padding:'32px', width:'100%', maxWidth:'380px', boxShadow:'var(--shadow)' }}>
        <div style={{ marginBottom:'28px', textAlign:'center' }}>
          <div style={{ fontSize:'28px', marginBottom:'6px' }}>🔧</div>
          <h1 style={{ fontSize:'20px', fontWeight:600, marginBottom:'4px' }}>ServiceTrack</h1>
          <p style={{ color:'var(--text2)', fontSize:'13px' }}>Département de service</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:'14px' }}>
            <label style={{ display:'block', fontSize:'12px', color:'var(--text2)', marginBottom:'5px' }}>Courriel</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="vous@concessionnaire.com"
              style={{ width:'100%', padding:'9px 12px', border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)', background:'var(--bg2)', outline:'none' }}
              onFocus={e => e.target.style.borderColor = 'var(--blue)'}
              onBlur={e  => e.target.style.borderColor = 'var(--border2)'}
            />
          </div>
          <div style={{ marginBottom:'20px' }}>
            <label style={{ display:'block', fontSize:'12px', color:'var(--text2)', marginBottom:'5px' }}>Mot de passe</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{ width:'100%', padding:'9px 12px', border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)', background:'var(--bg2)', outline:'none' }}
              onFocus={e => e.target.style.borderColor = 'var(--blue)'}
              onBlur={e  => e.target.style.borderColor = 'var(--border2)'}
            />
          </div>
          {error && <div style={{ background:'var(--red-lt)', color:'var(--red)', padding:'8px 12px', borderRadius:'var(--radius)', fontSize:'13px', marginBottom:'14px' }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ width:'100%', padding:'10px', background:'var(--blue)', color:'white', border:'none', borderRadius:'var(--radius)', fontWeight:500, fontSize:'14px', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
