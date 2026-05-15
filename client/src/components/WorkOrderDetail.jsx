import { useState, useEffect } from 'react';
import { api } from '../api';
import { STATUS_LABELS, STATUS_COLORS } from '../pages/Dashboard';

const SDS_URL = 'https://sdsweb.serti.com';

const TYPE_ICONS = { note:'ti-note', appel:'ti-phone', texto:'ti-message', courriel:'ti-mail', livraison:'ti-check', statut:'ti-refresh' };

export default function WorkOrderDetail({ wo, onClose, onUpdated, currentUser }) {
  const [suivis, setSuivis]     = useState([]);
  const [note, setNote]         = useState('');
  const [type, setType]         = useState('note');
  const [newStatus, setNewStatus] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (!wo) { setSuivis([]); return; }
    api.getSuivis(wo.id).then(setSuivis).catch(() => {});
    setNote(''); setNewStatus(''); setError('');
  }, [wo?.id]);

  if (!wo) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'12px', color:'var(--text3)' }}>
      <i className="ti ti-file-search" style={{ fontSize:'36px' }} />
      <span style={{ fontSize:'14px' }}>Sélectionnez un bon de travail</span>
    </div>
  );

  async function addSuivi() {
    if (!note.trim()) { setError('Veuillez écrire une note de suivi'); return; }
    setSaving(true); setError('');
    try {
      const added = await api.addSuivi({ work_order_id: wo.id, note: note.trim(), type, nouveau_status: newStatus || undefined });
      setSuivis(prev => [added, ...prev]);
      setNote(''); setNewStatus('');
      if (newStatus) onUpdated({ ...wo, status: newStatus, suivi_count: (parseInt(wo.suivi_count) || 0) + 1 });
      else onUpdated({ ...wo, suivi_count: (parseInt(wo.suivi_count) || 0) + 1 });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return isToday
      ? d.toLocaleTimeString('fr-CA', { hour:'2-digit', minute:'2-digit' })
      : d.toLocaleDateString('fr-CA', { day:'numeric', month:'short' }) + ' ' + d.toLocaleTimeString('fr-CA', { hour:'2-digit', minute:'2-digit' });
  }

  const pill = (
    <span style={{ fontSize:'11px', padding:'3px 9px', borderRadius:'10px', fontWeight:500,
      background: wo.status === 'open' ? 'var(--red-lt)' : wo.status === 'suivi' ? 'var(--amber-lt)' : wo.status === 'attente' ? 'var(--blue-lt)' : 'var(--green-lt)',
      color: STATUS_COLORS[wo.status] }}>
      {STATUS_LABELS[wo.status]}
    </span>
  );

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding:'12px 16px', borderBottom:`0.5px solid var(--border)`, flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:'16px', fontWeight:600, marginBottom:'2px' }}>{wo.numero}</div>
            <div style={{ fontSize:'13px', color:'var(--text2)' }}>{wo.client_nom}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            {pill}
            <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', padding:'2px 4px' }}>
              <i className="ti ti-x" />
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        {/* Info */}
        <div style={{ padding:'12px 16px', borderBottom:`0.5px solid var(--border)` }}>
          <div style={{ fontSize:'10px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Informations</div>
          {[
            ['Véhicule',   wo.vehicule],
            ['Promesse',   wo.date_promesse],
            ['Montant',    wo.montant],
            ['Conseiller', `${wo.advisor_prenom || ''} ${wo.advisor_nom || ''}`],
          ].map(([label, val]) => val ? (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px', fontSize:'13px' }}>
              <span style={{ color:'var(--text2)' }}>{label}</span>
              <span style={{ fontWeight:500, textAlign:'right', maxWidth:'60%' }}>{val}</span>
            </div>
          ) : null)}
          {wo.description && (
            <div style={{ marginTop:'8px', padding:'8px', background:'var(--bg2)', borderRadius:'var(--radius)', fontSize:'12px', color:'var(--text2)' }}>
              {wo.description}
            </div>
          )}
        </div>

        {/* Contact */}
        <div style={{ padding:'12px 16px', borderBottom:`0.5px solid var(--border)` }}>
          <div style={{ fontSize:'10px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Contact client</div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {wo.client_tel && (
              <a href={`tel:${wo.client_tel.replace(/\D/g,'')}`}
                style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'5px 10px', border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)', fontSize:'12px', color:'var(--text)', textDecoration:'none' }}>
                <i className="ti ti-phone" /> {wo.client_tel}
              </a>
            )}
            <a href={SDS_URL} target="_blank" rel="noopener noreferrer"
              style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'5px 10px', border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)', fontSize:'12px', color:'var(--text)', textDecoration:'none' }}>
              <i className="ti ti-message" /> Texto via Serti
              <i className="ti ti-external-link" style={{ fontSize:'11px' }} />
            </a>
          </div>
        </div>

        {/* Suivis */}
        <div style={{ padding:'12px 16px', borderBottom:`0.5px solid var(--border)` }}>
          <div style={{ fontSize:'10px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>
            Historique des suivis ({suivis.length})
          </div>
          {suivis.length === 0 ? (
            <div style={{ fontSize:'12px', color:'var(--text3)', fontStyle:'italic' }}>Aucun suivi enregistré</div>
          ) : suivis.map(s => (
            <div key={s.id} style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'8px 10px', marginBottom:'6px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                <span style={{ fontSize:'12px', fontWeight:500, display:'flex', alignItems:'center', gap:'5px' }}>
                  <i className={`ti ${TYPE_ICONS[s.type] || 'ti-note'}`} style={{ color:'var(--blue)', fontSize:'13px' }} />
                  {s.prenom} {s.nom?.[0]}.
                </span>
                <span style={{ fontSize:'11px', color:'var(--text3)' }}>{formatDate(s.created_at)}</span>
              </div>
              <div style={{ fontSize:'12px', color:'var(--text2)' }}>{s.note}</div>
              {s.nouveau_status && s.ancien_status !== s.nouveau_status && (
                <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'3px' }}>
                  Statut: {STATUS_LABELS[s.ancien_status]} → <strong>{STATUS_LABELS[s.nouveau_status]}</strong>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add suivi */}
      <div style={{ padding:'12px 16px', borderTop:`0.5px solid var(--border)`, flexShrink:0, background:'var(--bg)' }}>
        <div style={{ fontSize:'12px', fontWeight:500, marginBottom:'6px' }}>Ajouter un suivi</div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
          placeholder="Ex: Client avisé par texto, livraison confirmée 17h..."
          style={{ width:'100%', padding:'7px 10px', border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)', resize:'none', background:'var(--bg2)', outline:'none', marginBottom:'6px' }} />
        {error && <div style={{ fontSize:'12px', color:'var(--red)', marginBottom:'6px' }}>{error}</div>}
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
          <select value={type} onChange={e => setType(e.target.value)}
            style={{ padding:'5px 8px', border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)', background:'var(--bg2)' }}>
            <option value="note">Note</option>
            <option value="appel">Appel téléphonique</option>
            <option value="texto">Texto envoyé</option>
            <option value="courriel">Courriel</option>
            <option value="livraison">Livraison</option>
          </select>
          <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
            style={{ padding:'5px 8px', border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)', background:'var(--bg2)', flex:1 }}>
            <option value="">Statut inchangé</option>
            <option value="open">Ouvert</option>
            <option value="suivi">Suivi requis</option>
            <option value="attente">En attente</option>
            <option value="livre">Livré</option>
          </select>
          <button onClick={addSuivi} disabled={saving}
            style={{ padding:'6px 14px', background:'var(--blue)', color:'white', border:'none', borderRadius:'var(--radius)', fontWeight:500, opacity: saving ? 0.7 : 1 }}>
            <i className="ti ti-check" /> {saving ? 'Sauvegarde...' : 'Suivi fait'}
          </button>
        </div>
      </div>
    </div>
  );
}
