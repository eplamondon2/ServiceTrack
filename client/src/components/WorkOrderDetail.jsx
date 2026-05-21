import { useState, useEffect } from 'react';
import { api } from '../api';
import { STATUS_LABELS, STATUS_COLORS } from '../pages/Dashboard';

const SDS_URL = 'https://luxoto.sdswebapp.com:9746/SDSWeb';

const TYPE_ICONS = { note:'ti-note', appel:'ti-phone', texto:'ti-message', courriel:'ti-mail', livraison:'ti-check', statut:'ti-refresh' };

const STATUT_DETAIL_LABELS = {
  rdv_avenir:         '🗓 Rendez-vous à venir',
  piece_commande:     '📦 Pièce en commande',
  vehicule_sur_place: '🔧 Véhicule sur place',
  hytac:              '🏢 HYTAC',
};

export default function WorkOrderDetail({ wo, onClose, onUpdated, currentUser }) {
  const [suivis, setSuivis]             = useState([]);
  const [note, setNote]                 = useState('');
  const [type, setType]                 = useState('note');
  const [newStatus, setNewStatus]       = useState('');
  const [statutDetail, setStatutDetail] = useState('');
  const [dateRdv, setDateRdv]           = useState('');
  const [datePiece, setDatePiece]       = useState('');
  const [courtoisie, setCourtoisie]     = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => {
    if (!wo) { setSuivis([]); return; }
    api.getSuivis(wo.id).then(setSuivis).catch(() => {});
    setNote(''); setNewStatus(''); setError('');
    setStatutDetail(wo.statut_detail || '');
    setDateRdv(wo.date_rdv_avenir ? wo.date_rdv_avenir.slice(0, 16) : '');
    setDatePiece(wo.date_piece_prevue ? wo.date_piece_prevue.slice(0, 10) : '');
    setCourtoisie(wo.courtoisie || false);
  }, [wo?.id]);

  if (!wo) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'12px', color:'var(--text3)' }}>
      <i className="ti ti-file-search" style={{ fontSize:'36px' }} />
      <span style={{ fontSize:'14px' }}>Sélectionnez un bon de travail</span>
    </div>
  );

  async function toggleCourtoisie() {
    var newVal = !courtoisie;
    setCourtoisie(newVal);
    try {
      await api.updateWorkOrder(wo.id, { courtoisie: newVal });
      onUpdated({ ...wo, courtoisie: newVal });
    } catch (err) {
      setCourtoisie(!newVal);
    }
  }

  async function changerStatutDetail(key) {
    var newVal = statutDetail === key ? '' : key;
    setStatutDetail(newVal);
    try {
      await api.updateWorkOrder(wo.id, { statut_detail: newVal || null });
      onUpdated({ ...wo, statut_detail: newVal || null });
    } catch (err) {
      setStatutDetail(statutDetail);
    }
  }

  function changerDateRdv(val) {
    setDateRdv(val);
  }

  async function sauvegarderDateRdv(val) {
    try {
      await api.updateWorkOrder(wo.id, { date_rdv_avenir: val || null });
      onUpdated({ ...wo, date_rdv_avenir: val || null });
    } catch (err) {}
  }

  function changerDatePiece(val) {
    setDatePiece(val);
  }

  async function sauvegarderDatePiece(val) {
    try {
      await api.updateWorkOrder(wo.id, { date_piece_prevue: val || null });
      onUpdated({ ...wo, date_piece_prevue: val || null });
    } catch (err) {}
  }

  async function addSuivi() {
    if (!note.trim()) { setError('Veuillez écrire une note de suivi'); return; }
    setSaving(true); setError('');
    try {
      var added = await api.addSuivi({
        work_order_id:  wo.id,
        note:           note.trim(),
        type:           type,
        nouveau_status: newStatus || undefined
      });
      setSuivis(function(prev) { return [added, ...prev]; });
      setNote(''); setNewStatus('');
      onUpdated({ ...wo, status: newStatus || wo.status, suivi_count: (parseInt(wo.suivi_count) || 0) + 1 });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function formatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var today = new Date();
    var isToday = d.toDateString() === today.toDateString();
    return isToday
      ? d.toLocaleTimeString('fr-CA', { hour:'2-digit', minute:'2-digit' })
      : d.toLocaleDateString('fr-CA', { day:'numeric', month:'short' }) + ' ' + d.toLocaleTimeString('fr-CA', { hour:'2-digit', minute:'2-digit' });
  }

  function formatDateSimple(val) {
    if (!val) return '';
    return val.split('T')[0];
  }

  var isWP = wo.type_bon === 'wp';

  var pill = (
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
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'2px' }}>
              <div style={{ fontSize:'16px', fontWeight:600 }}>{wo.numero_wp || wo.numero}</div>
              {isWP && <span style={{ fontSize:'10px', padding:'2px 6px', borderRadius:'4px', background:'var(--blue-lt)', color:'var(--blue)', fontWeight:500 }}>BON OUVERT</span>}
            </div>
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

        {/* Informations */}
        <div style={{ padding:'12px 16px', borderBottom:`0.5px solid var(--border)` }}>
          <div style={{ fontSize:'10px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Informations</div>
          {[
            ['Véhicule',          wo.vehicule],
            ['Date et heure RDV', wo.date_promesse],
            ['Date entrée',       formatDateSimple(wo.date_entree)],
            ['Montant',           wo.montant],
            ['Conseiller',        wo.advisor_prenom ? wo.advisor_prenom + ' ' + (wo.advisor_nom || '') : null],
          ].map(function(item) {
            var label = item[0], val = item[1];
            return val ? (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px', fontSize:'13px' }}>
                <span style={{ color:'var(--text2)' }}>{label}</span>
                <span style={{ fontWeight:500, textAlign:'right', maxWidth:'60%' }}>{val}</span>
              </div>
            ) : null;
          })}
          {wo.description && (
            <div style={{ marginTop:'8px', padding:'8px', background:'var(--bg2)', borderRadius:'var(--radius)', fontSize:'12px', color:'var(--text2)' }}>
              {wo.description}
            </div>
          )}
        </div>

        {/* Courtoisie + Statut véhicule */}
        <div style={{ padding:'12px 16px', borderBottom:`0.5px solid var(--border)` }}>
          <div style={{ fontSize:'10px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>
            {isWP ? 'Statut du véhicule' : 'Informations supplémentaires'}
          </div>

          {/* Courtoisie */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px', padding:'8px 10px', background:'var(--bg2)', borderRadius:'var(--radius)' }}>
            <span style={{ fontSize:'13px', color:'var(--text2)' }}>🚗 Véhicule de courtoisie</span>
            <button onClick={toggleCourtoisie}
              style={{ padding:'3px 12px', borderRadius:'10px', border:'none', cursor:'pointer', fontWeight:500, fontSize:'12px',
                background: courtoisie ? 'var(--green-lt)' : 'var(--bg3)',
                color: courtoisie ? 'var(--green)' : 'var(--text3)' }}>
              {courtoisie ? 'Oui' : 'Non'}
            </button>
          </div>

          {/* Statuts détaillés — WP seulement */}
          {isWP && (
            <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
              {Object.entries(STATUT_DETAIL_LABELS).map(function(entry) {
                var key = entry[0], label = entry[1];
                var active = statutDetail === key;
                return (
                  <div key={key}>
                    <button onClick={function() { changerStatutDetail(key); }}
                      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'7px 10px', width:'100%',
                        borderRadius:'var(--radius)',
                        border: '0.5px solid ' + (active ? 'var(--blue)' : 'var(--border)'),
                        background: active ? 'var(--blue-lt)' : 'transparent',
                        cursor:'pointer', fontSize:'13px',
                        color: active ? 'var(--blue)' : 'var(--text2)',
                        fontWeight: active ? 500 : 400, textAlign:'left' }}>
                      {label}
                    </button>

                    {/* Date RDV à venir */}
                    {active && key === 'rdv_avenir' && (
                      <div style={{ marginTop:'6px', paddingLeft:'4px' }}>
                        <label style={{ fontSize:'11px', color:'var(--text2)', display:'block', marginBottom:'4px' }}>
                          Date du rendez-vous
                        </label>
                        <input type="datetime-local" value={dateRdv}
                          onChange={function(e) { changerDateRdv(e.target.value); }}
                          onBlur={function(e) { sauvegarderDateRdv(e.target.value); }}
                          style={{ width:'100%', padding:'6px 10px', border:`0.5px solid var(--border2)`,
                            borderRadius:'var(--radius)', background:'var(--bg2)', fontSize:'13px' }} />
                        {dateRdv && (
                          <div style={{ fontSize:'11px', color:'var(--green)', marginTop:'3px' }}>
                            ✓ Sauvegardé au {dateRdv.replace('T', ' à ')}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Date pièce en commande */}
                    {active && key === 'piece_commande' && (
                      <div style={{ marginTop:'6px', paddingLeft:'4px' }}>
                        <label style={{ fontSize:'11px', color:'var(--text2)', display:'block', marginBottom:'4px' }}>
                          Date d'arrivée prévue
                        </label>
                        <input type="date" value={datePiece}
                          onChange={function(e) { changerDatePiece(e.target.value); }}
                          onBlur={function(e) { sauvegarderDatePiece(e.target.value); }}
                          style={{ width:'100%', padding:'6px 10px', border:`0.5px solid var(--border2)`,
                            borderRadius:'var(--radius)', background:'var(--bg2)', fontSize:'13px' }} />
                        {datePiece && (
                          <div style={{ fontSize:'11px', color:'var(--green)', marginTop:'3px' }}>
                            ✓ Arrivée prévue le {datePiece}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contact client */}
        <div style={{ padding:'12px 16px', borderBottom:`0.5px solid var(--border)` }}>
          <div style={{ fontSize:'10px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Contact client</div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            {wo.client_tel && (
              <a href={'tel:' + wo.client_tel.replace(/\D/g,'')}
                style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'5px 10px',
                  border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)',
                  fontSize:'12px', color:'var(--text)', textDecoration:'none' }}>
                <i className="ti ti-phone" /> {wo.client_tel}
              </a>
            )}
            <a href={SDS_URL} target="_blank" rel="noopener noreferrer"
              style={{ display:'inline-flex', alignItems:'center', gap:'5px', padding:'5px 10px',
                border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)',
                fontSize:'12px', color:'var(--text)', textDecoration:'none' }}>
              <i className="ti ti-message" /> Texto via Serti
              <i className="ti ti-external-link" style={{ fontSize:'11px' }} />
            </a>
          </div>
        </div>

        {/* Historique suivis */}
        <div style={{ padding:'12px 16px', borderBottom:`0.5px solid var(--border)` }}>
          <div style={{ fontSize:'10px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>
            Historique des suivis ({suivis.length})
          </div>
          {suivis.length === 0 ? (
            <div style={{ fontSize:'12px', color:'var(--text3)', fontStyle:'italic' }}>Aucun suivi enregistré</div>
          ) : suivis.map(function(s) {
            return (
              <div key={s.id} style={{ background:'var(--bg2)', borderRadius:'var(--radius)', padding:'8px 10px', marginBottom:'6px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
                  <span style={{ fontSize:'12px', fontWeight:500, display:'flex', alignItems:'center', gap:'5px' }}>
                    <i className={'ti ' + (TYPE_ICONS[s.type] || 'ti-note')} style={{ color:'var(--blue)', fontSize:'13px' }} />
                    {s.prenom} {s.nom ? s.nom[0] : ''}.
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
            );
          })}
        </div>
      </div>

      {/* Ajouter un suivi */}
      <div style={{ padding:'12px 16px', borderTop:`0.5px solid var(--border)`, flexShrink:0, background:'var(--bg)' }}>
        <div style={{ fontSize:'12px', fontWeight:500, marginBottom:'6px' }}>Ajouter un suivi</div>
        <textarea value={note} onChange={function(e) { setNote(e.target.value); }} rows={2}
          placeholder="Ex: Client avisé par texto, pièce reçue, livraison confirmée..."
          style={{ width:'100%', padding:'7px 10px', border:`0.5px solid var(--border2)`,
            borderRadius:'var(--radius)', resize:'none', background:'var(--bg2)',
            outline:'none', marginBottom:'6px' }} />
        {error && <div style={{ fontSize:'12px', color:'var(--red)', marginBottom:'6px' }}>{error}</div>}
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
          <select value={type} onChange={function(e) { setType(e.target.value); }}
            style={{ padding:'5px 8px', border:`0.5px solid var(--border2)`,
              borderRadius:'var(--radius)', background:'var(--bg2)' }}>
            <option value="note">Note</option>
            <option value="appel">Appel téléphonique</option>
            <option value="texto">Texto envoyé</option>
            <option value="courriel">Courriel</option>
            <option value="livraison">Livraison</option>
          </select>
          <select value={newStatus} onChange={function(e) { setNewStatus(e.target.value); }}
            style={{ padding:'5px 8px', border:`0.5px solid var(--border2)`,
              borderRadius:'var(--radius)', background:'var(--bg2)', flex:1 }}>
            <option value="">Statut inchangé</option>
            <option value="open">Ouvert</option>
            <option value="suivi">Suivi requis</option>
            <option value="attente">En attente</option>
            <option value="livre">Livré</option>
          </select>
          <button onClick={addSuivi} disabled={saving}
            style={{ padding:'6px 14px', background:'var(--blue)', color:'white',
              border:'none', borderRadius:'var(--radius)', fontWeight:500,
              opacity: saving ? 0.7 : 1, cursor:'pointer' }}>
            <i className="ti ti-check" /> {saving ? 'Sauvegarde...' : 'Suivi fait'}
          </button>
        </div>
      </div>
    </div>
  );
}
