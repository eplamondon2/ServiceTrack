import { STATUS_LABELS, STATUS_COLORS } from '../pages/Dashboard';

const BG = { open:'var(--red-lt)', suivi:'var(--amber-lt)', attente:'var(--blue-lt)', livre:'var(--green-lt)' };

export default function StatsPage({ stats, workOrders, onRefresh }) {
  const counts = {
    open:    workOrders.filter(w => w.status === 'open').length,
    suivi:   workOrders.filter(w => w.status === 'suivi').length,
    attente: workOrders.filter(w => w.status === 'attente').length,
    livre:   workOrders.filter(w => w.status === 'livre').length,
  };

  // Bons par conseiller
  const byAdvisor = {};
  workOrders.forEach(wo => {
    const key = wo.advisor_id || 'unknown';
    if (!byAdvisor[key]) byAdvisor[key] = { nom:`${wo.advisor_prenom||''} ${(wo.advisor_nom||'')[0]||''}.`, initiales: wo.advisor_initiales || '?', open:0, suivi:0, attente:0, livre:0, total:0 };
    byAdvisor[key][wo.status] = (byAdvisor[key][wo.status] || 0) + 1;
    byAdvisor[key].total++;
  });

  const advisors = Object.values(byAdvisor).sort((a,b) => b.total - a.total);
  const maxTotal = Math.max(...advisors.map(a => a.total), 1);

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>
      <div style={{ maxWidth:'800px', display:'flex', flexDirection:'column', gap:'14px' }}>

        {/* Métriques */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'10px' }}>
          {Object.entries(counts).map(([status, count]) => (
            <div key={status} style={{ background:'var(--bg)', border:`0.5px solid var(--border)`, borderRadius:'var(--radius-lg)', padding:'12px 14px' }}>
              <div style={{ fontSize:'11px', color:'var(--text3)', marginBottom:'4px' }}>{STATUS_LABELS[status]}</div>
              <div style={{ fontSize:'24px', fontWeight:600, color: STATUS_COLORS[status] }}>{count}</div>
            </div>
          ))}
        </div>

        {/* Par conseiller */}
        <div style={{ background:'var(--bg)', border:`0.5px solid var(--border)`, borderRadius:'var(--radius-lg)', padding:'16px' }}>
          <div style={{ fontSize:'13px', fontWeight:500, marginBottom:'14px' }}>Par conseiller</div>
          {advisors.length === 0 ? (
            <div style={{ color:'var(--text3)', fontSize:'13px' }}>Aucune donnée</div>
          ) : advisors.map(adv => (
            <div key={adv.initiales} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'7px', width:'110px', flexShrink:0 }}>
                <div style={{ width:'26px', height:'26px', borderRadius:'50%', background:'var(--blue-lt)', color:'var(--blue)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:500 }}>
                  {adv.initiales}
                </div>
                <span style={{ fontSize:'12px' }}>{adv.nom}</span>
              </div>
              <div style={{ flex:1, height:'20px', borderRadius:'4px', overflow:'hidden', display:'flex', gap:'2px' }}>
                {[['open','#F09595'],['suivi','#EF9F27'],['attente','#85B7EB'],['livre','#97C459']].map(([s,c]) =>
                  adv[s] > 0 ? <div key={s} style={{ flex: adv[s], background:c }} title={`${STATUS_LABELS[s]}: ${adv[s]}`} /> : null
                )}
              </div>
              <span style={{ fontSize:'12px', color:'var(--text2)', width:'20px', textAlign:'right' }}>{adv.total}</span>
            </div>
          ))}
          <div style={{ display:'flex', gap:'14px', marginTop:'10px', flexWrap:'wrap' }}>
            {[['Ouverts','#F09595'],['Suivi requis','#EF9F27'],['En attente','#85B7EB'],['Livrés','#97C459']].map(([label,c]) => (
              <span key={label} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'var(--text2)' }}>
                <span style={{ width:'10px', height:'10px', borderRadius:'2px', background:c, display:'inline-block' }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Sans suivi */}
        {stats?.sans_suivi?.length > 0 && (
          <div style={{ background:'var(--bg)', border:`0.5px solid var(--border)`, borderRadius:'var(--radius-lg)', padding:'16px' }}>
            <div style={{ fontSize:'13px', fontWeight:500, marginBottom:'12px', color:'var(--red)' }}>
              <i className="ti ti-alert-triangle" /> Bons sans aucun suivi ({stats.sans_suivi.length})
            </div>
            {stats.sans_suivi.map(wo => (
              <div key={wo.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:`0.5px solid var(--border)` }}>
                <div>
                  <span style={{ fontSize:'13px', fontWeight:500 }}>{wo.numero}</span>
                  <span style={{ fontSize:'12px', color:'var(--text2)', marginLeft:'8px' }}>{wo.client_nom}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontSize:'11px', color:'var(--text3)' }}>{wo.advisor_initiales}</span>
                  <span style={{ fontSize:'11px', padding:'2px 7px', borderRadius:'10px', background: BG[wo.status] || 'var(--bg3)', color: STATUS_COLORS[wo.status] || 'var(--text2)' }}>
                    {STATUS_LABELS[wo.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
