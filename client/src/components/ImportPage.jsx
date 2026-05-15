import { useState, useRef } from 'react';
import { api } from '../api';

export default function ImportPage({ onImported }) {
  const [dragging, setDragging]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState('');
  const [form, setForm]           = useState({ numero:'', client_nom:'', client_tel:'', vehicule:'', description:'', montant:'', date_promesse:'' });
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const fileRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    const allowed = ['application/pdf','text/plain','text/csv'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|txt|csv)$/i)) {
      setError('Format non supporté. Utilisez PDF, TXT ou CSV.'); return;
    }
    setImporting(true); setResult(null); setError('');
    const fd = new FormData();
    fd.append('fichier', file);
    try {
      const res = await api.importPdf(fd);
      setResult(res);
      if (res.importes > 0) onImported();
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'importation');
    } finally {
      setImporting(false);
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }

  async function handleManual(e) {
    e.preventDefault();
    if (!form.numero || !form.client_nom || !form.vehicule) { setError('Numéro, client et véhicule requis'); return; }
    setSaving(true); setError('');
    try {
      await api.createWorkOrder({ ...form, source:'manuel' });
      setSaved(true);
      setForm({ numero:'', client_nom:'', client_tel:'', vehicule:'', description:'', montant:'', date_promesse:'' });
      onImported();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width:'100%', padding:'7px 10px', border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)', background:'var(--bg2)', outline:'none' };

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
      <div style={{ maxWidth:'700px', display:'flex', flexDirection:'column', gap:'16px' }}>

        {/* Import PDF/CSV */}
        <div style={{ background:'var(--bg)', border:`0.5px solid var(--border)`, borderRadius:'var(--radius-lg)', padding:'18px' }}>
          <div style={{ fontSize:'14px', fontWeight:500, marginBottom:'14px' }}>
            <i className="ti ti-file-upload" /> Importer depuis Serti / Keyloop
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{ border:`1.5px dashed ${dragging ? 'var(--blue)' : 'var(--border2)'}`, borderRadius:'var(--radius-lg)', padding:'28px 20px', textAlign:'center', cursor:'pointer', background: dragging ? 'var(--blue-lt)' : 'transparent', transition:'all 0.15s' }}>
            <input ref={fileRef} type="file" accept=".pdf,.txt,.csv" style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />
            {importing ? (
              <div style={{ color:'var(--text2)' }}>
                <i className="ti ti-loader" style={{ fontSize:'28px', display:'block', marginBottom:'8px' }} />
                Analyse par Claude AI en cours...
              </div>
            ) : (
              <>
                <i className="ti ti-cloud-upload" style={{ fontSize:'28px', color:'var(--text3)', display:'block', marginBottom:'8px' }} />
                <div style={{ fontWeight:500, marginBottom:'4px' }}>Glisser un fichier ici ou cliquer pour parcourir</div>
                <div style={{ fontSize:'12px', color:'var(--text2)' }}>Rapport de rendez-vous Serti — PDF, TXT, CSV acceptés</div>
                <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'6px' }}>Claude AI extrait automatiquement les infos des bons</div>
              </>
            )}
          </div>

          {result && (
            <div style={{ marginTop:'12px', padding:'10px 14px', background:'var(--green-lt)', borderRadius:'var(--radius)', fontSize:'13px', color:'var(--green)' }}>
              <i className="ti ti-check" /> <strong>{result.importes}</strong> bon{result.importes > 1 ? 's' : ''} importé{result.importes > 1 ? 's' : ''}
              {result.erreurs > 0 && <span style={{ color:'var(--amber)' }}> · {result.erreurs} erreur{result.erreurs > 1 ? 's' : ''}</span>}
              {result.details?.filter(d => d.status === 'erreur').map(d => (
                <div key={d.numero} style={{ fontSize:'12px', marginTop:'4px', color:'var(--amber)' }}>• {d.numero}: {d.message}</div>
              ))}
            </div>
          )}
          {error && <div style={{ marginTop:'8px', padding:'8px 12px', background:'var(--red-lt)', borderRadius:'var(--radius)', fontSize:'13px', color:'var(--red)' }}>{error}</div>}
        </div>

        {/* Saisie manuelle */}
        <div style={{ background:'var(--bg)', border:`0.5px solid var(--border)`, borderRadius:'var(--radius-lg)', padding:'18px' }}>
          <div style={{ fontSize:'14px', fontWeight:500, marginBottom:'14px' }}>
            <i className="ti ti-plus-circle" /> Créer un bon manuellement
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            {[
              ['numero',        'No. bon de travail', 'Ex: WO-24891'],
              ['client_nom',    'Client',             'Nom du client'],
              ['client_tel',    'Téléphone',          '(418) 555-0000'],
              ['vehicule',      'Véhicule',           '2021 Toyota RAV4'],
              ['montant',       'Montant',            'À estimer'],
              ['date_promesse', 'Date promesse',      '2026-05-15 17:00'],
            ].map(([key, label, ph]) => (
              <div key={key}>
                <label style={{ fontSize:'11px', color:'var(--text2)', display:'block', marginBottom:'4px' }}>{label}</label>
                <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph} style={inputStyle} />
              </div>
            ))}
          </div>
          <div style={{ marginTop:'10px' }}>
            <label style={{ fontSize:'11px', color:'var(--text2)', display:'block', marginBottom:'4px' }}>Description des travaux</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} style={{ ...inputStyle, resize:'none' }} placeholder="Vidange d'huile, inspection, freins..." />
          </div>
          {error && <div style={{ marginTop:'6px', fontSize:'12px', color:'var(--red)' }}>{error}</div>}
          <button onClick={handleManual} disabled={saving}
            style={{ marginTop:'12px', padding:'8px 18px', background:'var(--blue)', color:'white', border:'none', borderRadius:'var(--radius)', fontWeight:500, opacity: saving ? 0.7 : 1 }}>
            {saved ? '✓ Bon créé!' : saving ? 'Création...' : 'Créer le bon'}
          </button>
        </div>
      </div>
    </div>
  );
}
