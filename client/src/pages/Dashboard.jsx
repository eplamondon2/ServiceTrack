import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';
import WorkOrderList   from '../components/WorkOrderList';
import WorkOrderDetail from '../components/WorkOrderDetail';
import ImportPage      from '../components/ImportPage';
import StatsPage       from '../components/StatsPage';

const STATUS_LABELS = { open:'Ouvert', suivi:'Suivi requis', attente:'En attente', livre:'Livré', annule:'Annulé' };
const STATUS_COLORS = { open:'var(--red)', suivi:'var(--amber)', attente:'var(--blue)', livre:'var(--green)', annule:'var(--text3)' };

export { STATUS_LABELS, STATUS_COLORS };

export default function Dashboard() {
  const { user, logout }        = useAuth();
  const navigate                = useNavigate();
  const location                = useLocation();
  const [workOrders, setWO]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filters, setFilters]   = useState({ status:'', search:'', advisor_id:'', type_bon:'' });
  const [wpFilter, setWpFilter] = useState('');
  const [stats, setStats]       = useState(null);
  const [section, setSection]   = useState('rdv');

  const tab = location.pathname.startsWith('/import') ? 'import'
            : location.pathname.startsWith('/stats')  ? 'stats'
            : 'bons';

  const loadWO = useCallback(async () => {
    setLoading(true);
    try {
      const params = { type_bon: section };
      if (filters.status)     params.status     = filters.status;
      if (filters.search)     params.search     = filters.search;
      if (filters.advisor_id) params.advisor_id = filters.advisor_id;
      const res = await api.getWorkOrders(params);
      setWO(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, section]);

  const loadStats = useCallback(async () => {
    try { setStats(await api.getStats()); } catch {}
  }, []);

  useEffect(() => { loadWO(); }, [loadWO]);
  useEffect(() => { loadStats(); }, [loadStats]);

  function onWOUpdated(updated) {
    setWO(prev => prev.map(w => w.id === updated.id ? { ...w, ...updated } : w));
    if (selected?.id === updated.id) setSelected(s => ({ ...s, ...updated }));
    loadStats();
  }

  // Filtrer les WP par statut_detail ou courtoisie
  const displayed = workOrders.filter(w => {
    if (wpFilter === 'courtoisie')      return w.courtoisie === true;
    if (wpFilter === 'rdv_avenir')      return w.statut_detail === 'rdv_avenir';
    if (wpFilter === 'piece_commande')  return w.statut_detail === 'piece_commande';
    if (wpFilter === 'hytac')           return w.statut_detail === 'hytac';
    if (wpFilter === 'livre')           return w.status === 'livre';
    return true;
  });

  const counts = {
    open:    workOrders.filter(w => w.status === 'open').length,
    suivi:   workOrders.filter(w => w.status === 'suivi').length,
    attente: workOrders.filter(w => w.status === 'attente').length,
    livre:   workOrders.filter(w => w.status === 'livre').length,
  };

  const wpCounts = {
    courtoisie:     workOrders.filter(w => w.courtoisie === true).length,
    rdv_avenir:     workOrders.filter(w => w.statut_detail === 'rdv_avenir').length,
    piece_commande: workOrders.filter(w => w.statut_detail === 'piece_commande').length,
    hytac:          workOrders.filter(w => w.statut_detail === 'hytac').length,
    livre:          workOrders.filter(w => w.status === 'livre').length,
  };

  const navStyle = (t) => ({
    display:'flex', alignItems:'center', gap:'6px',
    padding:'7px 12px', borderRadius:'var(--radius)',
    border:'none', background: tab === t ? 'var(--bg3)' : 'transparent',
    color: tab === t ? 'var(--text)' : 'var(--text2)',
    fontWeight: tab === t ? 500 : 400, fontSize:'13px', cursor:'pointer'
  });

  const sectionBtnStyle = (s) => ({
    flex:1, padding:'7px 10px', border:'none', cursor:'pointer', fontSize:'13px',
    fontWeight: section === s ? 600 : 400,
    borderBottom: section === s ? '2px solid var(--blue)' : '2px solid transparent',
    background:'transparent', color: section === s ? 'var(--blue)' : 'var(--text2)',
    transition:'all 0.15s'
  });

  const sideItem = (key, label, icon, color, count, onClick, active) => (
    <button key={key} onClick={onClick}
      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%',
        padding:'6px 8px', borderRadius:'var(--radius)', border:'none',
        background: active ? 'var(--bg)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text2)',
        fontWeight: active ? 500 : 400, cursor:'pointer', fontSize:'13px' }}>
      <span style={{ display:'flex', alignItems:'center', gap:'7px' }}>
        <i className={`ti ti-${icon}`} style={{ color: active ? color : 'inherit' }} />
        {label}
      </span>
      {count > 0 && (
        <span style={{ fontSize:'11px', padding:'1px 6px', borderRadius:'10px',
          background: active ? color.replace('var(--', 'var(--').replace(')', '-lt)') : 'var(--bg3)',
          color: active ? color : 'var(--text2)' }}>
          {count}
        </span>
      )}
    </button>
  );

  const rdvSidebar = () => (
    <>
      <div style={{ fontSize:'10px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', padding:'0 8px', marginBottom:'4px' }}>Statut</div>
      {[
        ['all',     'Tous',              'list',         'var(--text2)', workOrders.length],
        ['open',    'Rendez-vous du jour','alert-circle', 'var(--red)',   counts.open],
        ['suivi',   'Suivi requis',      'clock',        'var(--amber)', counts.suivi],
        ['attente', 'En attente',        'hourglass',    'var(--blue)',  counts.attente],
        ['livre',   'Livrés',           'check',        'var(--green)', counts.livre],
      ].map(([key, label, icon, color, count]) =>
        sideItem(key, label, icon, color, count,
          () => setFilters(f => ({ ...f, status: key === 'all' ? '' : (filters.status === key ? '' : key) })),
          key === 'all' ? filters.status === '' : filters.status === key
        )
      )}
    </>
  );

  const wpSidebar = () => (
    <>
      <div style={{ fontSize:'10px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', padding:'0 8px', marginBottom:'4px' }}>Filtres</div>
      {[
        ['',              'Tous',                  'list',         'var(--text2)', workOrders.length],
        ['courtoisie',    '🚗 Courtoisie',          'car',          'var(--blue)',  wpCounts.courtoisie],
        ['rdv_avenir',   '🗓 Rendez-vous à venir', 'calendar',     'var(--amber)', wpCounts.rdv_avenir],
        ['piece_commande','📦 Pièce en commande',  'package',      'var(--purple)',wpCounts.piece_commande],
        ['hytac',         '🏢 HYTAC',              'building',     'var(--coral)', wpCounts.hytac],
        ['livre',         '✅ Livrés',             'check',        'var(--green)', wpCounts.livre],
      ].map(([key, label, icon, color, count]) =>
        sideItem(key, label, icon, color, count,
          () => setWpFilter(wpFilter === key ? '' : key),
          wpFilter === key
        )
      )}

      {(user?.role === 'admin' || user?.role === 'directeur') && stats?.sans_suivi?.length > 0 && (
        <>
          <div style={{ fontSize:'10px', color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.06em', padding:'0 8px', marginTop:'16px', marginBottom:'4px' }}>Urgences</div>
          <div style={{ padding:'6px 8px', borderRadius:'var(--radius)', background:'var(--red-lt)', fontSize:'12px', color:'var(--red)' }}>
            <i className="ti ti-alert-triangle" /> {stats.sans_suivi.length} sans suivi
          </div>
        </>
      )}
    </>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:`0.5px solid var(--border)`, background:'var(--bg)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <span style={{ fontSize:'15px', fontWeight:600 }}>Service<span style={{ color:'var(--blue)' }}>Track</span></span>
          <div style={{ display:'flex', gap:'2px' }}>
            <button style={navStyle('bons')}   onClick={() => navigate('/')}><i className="ti ti-file-text" /> Bons de travail</button>
            <button style={navStyle('import')} onClick={() => navigate('/import')}><i className="ti ti-upload" /> Importer</button>
            <button style={navStyle('stats')}  onClick={() => navigate('/stats')}><i className="ti ti-chart-bar" /> Tableau de bord</button>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'7px', padding:'4px 10px', border:`0.5px solid var(--border)`, borderRadius:'20px', fontSize:'13px', color:'var(--text2)' }}>
            <div style={{ width:'24px', height:'24px', borderRadius:'50%', background:'var(--blue-lt)', color:'var(--blue)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:500 }}>
              {user?.initiales}
            </div>
            {user?.prenom} · <span style={{ color:'var(--text3)', fontSize:'12px' }}>{user?.role}</span>
          </div>
          <button onClick={logout} style={{ background:'none', border:'none', color:'var(--text3)', padding:'4px 6px', borderRadius:'var(--radius)' }} title="Déconnexion">
            <i className="ti ti-logout" />
          </button>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <div style={{ width:'196px', borderRight:`0.5px solid var(--border)`, padding:'10px 8px', background:'var(--bg2)', flexShrink:0, overflowY:'auto' }}>
          <div style={{ display:'flex', borderBottom:`0.5px solid var(--border)`, marginBottom:'10px' }}>
            <button style={sectionBtnStyle('rdv')} onClick={() => { setSection('rdv'); setFilters(f=>({...f,status:''})); setWpFilter(''); setSelected(null); }}>
              📅 RDV
            </button>
            <button style={sectionBtnStyle('wp')} onClick={() => { setSection('wp'); setFilters(f=>({...f,status:''})); setWpFilter(''); setSelected(null); }}>
              🔧 Bons
            </button>
          </div>
          {section === 'rdv' ? rdvSidebar() : wpSidebar()}
        </div>

        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          <Routes>
            <Route path="/" element={
              <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
                <WorkOrderList
                  workOrders={displayed} loading={loading}
                  selected={selected} onSelect={setSelected}
                  filters={filters} setFilters={setFilters}
                  onRefresh={loadWO} section={section}
                />
                <WorkOrderDetail
                  wo={selected} onClose={() => setSelected(null)}
                  onUpdated={onWOUpdated} currentUser={user}
                />
              </div>
            } />
            <Route path="/import" element={<ImportPage onImported={loadWO} />} />
            <Route path="/stats"  element={<StatsPage stats={stats} workOrders={workOrders} onRefresh={loadStats} />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
