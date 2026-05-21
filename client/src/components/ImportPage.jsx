import { useState, useRef } from 'react';
import { api } from '../api';

export default function ImportPage({ onImported }) {
  const [draggingRdv, setDraggingRdv] = useState(false);
  const [draggingWp, setDraggingWp]   = useState(false);
  const [importingRdv, setImportingRdv] = useState(false);
  const [importingWp, setImportingWp]   = useState(false);
  const [resultRdv, setResultRdv] = useState(null);
  const [resultWp, setResultWp]   = useState(null);
  const [error, setError]         = useState('');
  const [form, setForm]           = useState({ numero:'', client_nom:'', client_tel:'', vehicule:'', description:'', montant:'', date_promesse:'' });
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const fileRdvRef = useRef();
  const fileWpRef  = useRef();

  async function handleRdv(file) {
    if (!file) return;
    setImportingRdv(true); setResultRdv(null); setError('');
    const fd = new FormData();
    fd.append('fichier', file);
    try {
      const res = await fetch('/api/import/rdv', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('st_token')}` },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResultRdv(data);
      if (data.importes > 0) onImported();
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'importation');
    } finally {
      setImportingRdv(false);
    }
  }

  async function handleWp(file) {
    if (!file) return;
    setImportingWp(true); setResultWp(null); setError('');
    const fd = new FormData();
    fd.append('fichier', file);
    try {
      const res = await fetch('/api/import/wp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('st_token')}` },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResultWp(data);
      if (data.importes > 0 || data.fermes > 0) onImported();
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'importation');
    } finally {
      setImportingWp(false);
    }
  }

  async function handleManual(e) {
    e.preventDefault();
    if (!form.numero || !form.client_nom || !form.vehicule) { setError('Numéro, client et véhicule requis'); return; }
    setSaving(true); setError('');
    try {
      await api.createWorkOrder({ ...form, source:'manuel', type_bon:'rdv' });
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

  const zoneStyle = (dragging) => ({
    border: `1.5px dashed ${dragging ? 'var(--blue)' : 'var(--border2)'}`,
    borderRadius: 'var(--radius-lg)', padding: '24px 20px', textAlign: 'center',
    cursor: 'pointer', background: dragging ? 'var(--blue-lt)' : 'transparent', transition: 'all 0.15s'
  });

  const inputStyle = { width:'100%', padding:'7px 10px', border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)', background:'var(--bg2)', outline:'none' };

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
      <div style={{ maxWidth:'700px', display:'flex', flexDirection:'column', gap:'16px' }}>

        {/* Import RDV journalier */}
        <div style={{ background:'var(--bg)', border:`0.5px solid var(--border)`, borderRadius:'var(--radius-lg)', padding:'18px' }}>
          <div style={{ fontSize:'14px', fontWeight:500, marginBottom:'6px' }}>
            📅 Rapport journalier des rendez-vous
          </div>
          <div style={{ fontSize:'12px', color:'var(--text2)', marginBottom:'14px' }}>
            Remplace automatiquement les RDV du jour précédent
          </div>

          <div style={zoneStyle(draggingRdv)}
            onDragOver={e => { e.preventDefault(); setDraggingRdv(true); }}
            onDragLeave={() => setDraggingRdv(false)}
            onDrop={e => { e.preventDefault(); setDraggingRdv(false); handleRdv(e.dataTransfer.files[0]); }}
            onClick={() => fileRdvRef.current?.click()}>
            <input ref={fileRdvRef} type="file" accept=".txt,.csv,.pdf" style={{ display:'none' }}
              onChange={e => handleRdv(e.target.files[0])} />
            {importingRdv ? (
              <div style={{ color:'var(--text2)' }}>
                <i className="ti ti-loader" style={{ fontSize:'24px', display:'block', marginBottom:'6px' }} />
                Analyse par Claude AI...
              </div>
            ) : (
              <>
                <i className="ti ti-calendar-upload" style={{ fontSize:'24px', color:'var(--text3)', display:'block', marginBottom:'6px' }} />
                <div style={{ fontWeight:500, marginBottom:'4px', fontSize:'13px' }}>Glisser le fichier RDV ici</div>
                <div style={{ fontSize:'12px', color:'var(--text2)' }}>Rapport Serti — TXT, CSV, PDF</div>
              </>
            )}
          </div>

          {resultRdv && (
            <div style={{ marginTop:'10px', padding:'10px 14px', background:'var(--green-lt)', borderRadius:'var(--radius)', fontSize:'13px', color:'var(--green)' }}>
              ✓ <strong>{resultRdv.importes}</strong> rendez-vous importés
            </div>
          )}
        </div>

        {/* Import WP bons ouverts */}
        <div style={{ background:'var(--bg)', border:`0.5px solid var(--border)`, borderRadius:'var(--radius-lg)', padding:'18px' }}>
          <div style={{ fontSize:'14px', fontWeight:500, marginBottom:'6px' }}>
            🔧 Rapport des travaux en cours (bons ouverts)
          </div>
          <div style={{ fontSize:'12px', color:'var(--text2)', marginBottom:'14px' }}>
            Ferme automatiquement les bons qui n'apparaissent plus dans le rapport
          </div>

          <div style={zoneStyle(draggingWp)}
            onDragOver={e => { e.preventDefault(); setDraggingWp(true); }}
            onDragLeave={() => setDraggingWp(false)}
            onDrop={e => { e.preventDefault(); setDraggingWp(false); handleWp(e.dataTransfer.files[0]); }}
            onClick={() => fileWpRef.current?.click()}>
            <input ref={fileWpRef} type="file" accept=".txt,.csv,.pdf" style={{ display:'none' }}
              onChange={e => handleWp(e.target.files[0])} />
            {importingWp ? (
              <div style={{ color:'var(--text2)' }}>
                <i className="ti ti-loader" style={{ fontSize:'24px', display:'block', marginBottom:'6px' }} />
                Analyse en cours... (fichier volumineux, patientez)
              </div>
            ) : (
              <>
                <i className="ti ti-file-upload" style={{ fontSize:'24px', color:'var(--text3)', display:'block', marginBottom:'6px' }} />
                <div style={{ fontWeight:500, marginBottom:'4px', fontSize:'13px' }}>Glisser le fichier travaux en cours</div>
                <div style={{ fontSize:'12px', color:'var(--text2)' }}>Rapport Serti X5650 — TXT, CSV, PDF</div>
              </>
            )}
          </div>

          {resultWp && (
            <div style={{ marginTop:'10px', padding:'10px 14px', background:'var(--green-lt)', borderRadius:'var(--radius)', fontSize:'13px', color:'var(--green)' }}>
              ✓ <strong>{resultWp.importes}</strong> nouveaux bons ajoutés
              {resultWp.fermes > 0 && <span style={{ marginLeft:'10px' }}>· <strong>{resultWp.fermes}</strong> bons fermés automatiquement</span>}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding:'10px 14px', background:'var(--red-lt)', borderRadius:'var(--radius)', fontSize:'13px', color:'var(--red)' }}>
            {error}
          </div>
        )}

        {/* Saisie manuelle */}
        <div style={{ background:'var(--bg)', border:`0.5px solid var(--border)`, borderRadius:'var(--radius-lg)', padding:'18px' }}>
          <div style={{ fontSize:'14px', fontWeight:500, marginBottom:'14px' }}>
            <i className="ti ti-plus-circle" /> Créer un bon manuellement
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
            {[
              ['numero',        'No. bon / RDV',   'Ex: WO-24891'],
              ['client_nom',    'Client',           'Nom du client'],
              ['client_tel',    'Téléphone',        '(418) 555-0000'],
              ['vehicule',      'Véhicule',         '2021 Hyundai Tucson'],
              ['montant',       'Montant',          'À estimer'],
              ['date_promesse', 'Date et heure RDV','2026-05-19 09:00'],
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
              rows={2} style={{ ...inputStyle, resize:'none' }} placeholder="Vidange, freins, inspection..." />
          </div>
          {error && <div style={{ marginTop:'6px', fontSize:'12px', color:'var(--red)' }}>{error}</div>}
          <button onClick={handleManual} disabled={saving}
            style={{ marginTop:'12px', padding:'8px 18px', background:'var(--blue)', color:'white', border:'none', borderRadius:'var(--radius)', fontWeight:500, opacity: saving ? 0.7 : 1 }}>
            {saved ? '✓ Créé!' : saving ? 'Création...' : 'Créer le bon'}
          </button>
        </div>

      </div>
    </div>
  );
}
