import { useState } from 'react';
import { STATUS_LABELS, STATUS_COLORS } from '../pages/Dashboard';

const BORDER_COLORS = { open:'var(--red)', suivi:'var(--amber)', attente:'var(--blue)', livre:'var(--green)', annule:'var(--text3)' };
const BG_COLORS     = { open:'var(--red-lt)', suivi:'var(--amber-lt)', attente:'var(--blue-lt)', livre:'var(--green-lt)', annule:'var(--bg3)' };

function Pill({ status }) {
  return (
    <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'10px', fontWeight:500, background:BG_COLORS[status], color:STATUS_COLORS[status] }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function WorkOrderList({ workOrders, loading, selected, onSelect, filters, setFilters, onRefresh }) {
  const [search, setSearch] = useState('');

  function handleSearch(e) {
    setSearch(e.target.value);
    setFilters(f => ({ ...f, search: e.target.value }));
  }

  return (
    <div style={{ width:'380px', flexShrink:0, display:'flex', flexDirection:'column', borderRight:`0.5px solid var(--border)`, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'10px 14px', borderBottom:`0.5px solid var(--border)`, background:'var(--bg)', display:'flex', alignItems:'center', gap:'8px' }}>
        <input
          value={search} onChange={handleSearch} placeholder="Rechercher client, bon, véhicule..."
          style={{ flex:1, padding:'6px 10px', border:`0.5px solid var(--border2)`, borderRadius:'var(--radius)', background:'var(--bg2)', outline:'none' }}
        />
        <button onClick={onRefresh} style={{ background:'none', border:`0.5px solid var(--border)`, borderRadius:'var(--radius)', padding:'6px 8px', color:'var(--text2)' }}>
          <i className="ti ti-refresh" />
        </button>
      </div>

      {/* List */}
      <div style={{ flex:1, overflowY:'auto', padding:'10px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--text3)' }}>Chargement...</div>
        ) : workOrders.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--text3)' }}>
            <i className="ti ti-search" style={{ fontSize:'28px', display:'block', marginBottom:'8px' }} />
            Aucun bon trouvé
          </div>
        ) : workOrders.map(wo => (
          <div key={wo.id} onClick={() => onSelect(wo)}
            style={{ background:'var(--bg)', border:`0.5px solid var(--border)`, borderLeft:`3px solid ${BORDER_COLORS[wo.status] || 'var(--border)'}`,
              borderRadius:'var(--radius-lg)', padding:'10px 12px', marginBottom:'8px', cursor:'pointer',
              outline: selected?.id === wo.id ? `2px solid var(--blue)` : 'none',
              transition:'border-color 0.1s' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'4px' }}>
              <div>
                <div style={{ fontWeight:500, fontSize:'13px' }}>{wo.numero}</div>
                <div style={{ color:'var(--text2)', fontSize:'13px' }}>{wo.client_nom}</div>
              </div>
              <Pill status={wo.status} />
            </div>
            <div style={{ fontSize:'12px', color:'var(--text3)', marginBottom:'6px' }}>
              <i className="ti ti-car" /> {wo.vehicule}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
              <span style={{ fontSize:'11px', color:'var(--text3)' }}>
                <i className="ti ti-user" /> {wo.advisor_prenom} {wo.advisor_nom?.[0]}.
              </span>
              {parseInt(wo.suivi_count) > 0 ? (
                <span style={{ fontSize:'11px', padding:'1px 6px', borderRadius:'10px', background:'var(--bg3)', color:'var(--text2)', border:`0.5px solid var(--border)` }}>
                  <i className="ti ti-message" /> {wo.suivi_count} suivi{wo.suivi_count > 1 ? 's' : ''}
                </span>
              ) : (
                <span style={{ fontSize:'11px', padding:'1px 6px', borderRadius:'10px', background:'var(--red-lt)', color:'var(--red)' }}>
                  Pas de suivi
                </span>
              )}
              <span style={{ fontSize:'11px', color:'var(--text3)', marginLeft:'auto' }}>
                <i className="ti ti-clock" /> {wo.date_promesse || wo.date_entree}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
