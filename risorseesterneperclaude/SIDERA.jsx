import { useState } from "react";
import {
  Home, Grid, MessageSquare, Archive, Settings,
  Plus, Check, Clock, MoreHorizontal, ArrowLeft,
  Calendar, List, Layout, FileText, Hash, Send,
  CheckSquare, ExternalLink, AlignLeft, ChevronRight
} from "lucide-react";

const C = {
  bg: '#ECEAE5',
  sidebar: '#F2F0EB',
  surface: '#FFFFFF',
  surfaceUp: '#F8F7F3',
  border: '#E0DDD7',
  borderMid: '#D0CCC5',
  text: '#1A1815',
  textMid: '#6A6560',
  textDim: '#B4B0AA',
  green: '#2F6B4A',
  greenLight: '#3D8B60',
  greenText: '#245A3C',
  greenGlow: 'rgba(47,107,74,0.07)',
  greenBorder: 'rgba(47,107,74,0.18)',
  pops: '#C8821A',
  popsGlow: 'rgba(200,130,26,0.08)',
  popsBorder: 'rgba(200,130,26,0.22)',
  shadow: '0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowHover: '0 4px 16px rgba(0,0,0,0.09)',
  shadowCard: '0 2px 8px rgba(0,0,0,0.05)',
};

const pColor = { alta: '#C8521A', media: '#2F6B4A', bassa: '#7A8FA6' };
const aColor = { D: C.green, E: '#4A6B8A', M: C.pops, L: '#6B4A8A' };

export default function SIDERA() {
  const [nav, setNav] = useState('home');
  const [project, setProject] = useState(null);
  const [boardTab, setBoardTab] = useState('board');
  const [done, setDone] = useState(new Set());
  const [channel, setChannel] = useState('generale');
  const [taskFilter, setTaskFilter] = useState('mie');

  const toggle = (id) => setDone(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const goTo = (v) => { setNav(v); setProject(null); };

  const navItems = [
    { id: 'home', icon: <Home size={15} />, label: 'Il Mio Giorno' },
    { id: 'tasks', icon: <CheckSquare size={15} />, label: 'Task' },
    { id: 'projects', icon: <Grid size={15} />, label: 'Progetti' },
    { id: 'chat', icon: <MessageSquare size={15} />, label: 'Chat' },
  ];

  return (
    <div style={{ fontFamily: "'Outfit',sans-serif", background: C.bg, color: C.text, height: '100vh', display: 'flex', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Outfit:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:${C.borderMid};border-radius:2px}
        .ni{display:flex;align-items:center;gap:9px;padding:8px 12px;border-radius:8px;cursor:pointer;transition:all .15s;color:${C.textDim};font-size:13px;font-weight:500;letter-spacing:.01em;user-select:none}
        .ni:hover{background:${C.border};color:${C.textMid}}
        .ni.on{background:${C.greenGlow};color:${C.greenText}}
        .ni.on svg{stroke:${C.green}}
        .tc{display:flex;align-items:flex-start;gap:11px;padding:13px 16px;background:${C.surface};border:1px solid ${C.border};border-radius:10px;cursor:pointer;transition:all .15s;margin-bottom:7px;box-shadow:${C.shadow}}
        .tc:hover{border-color:${C.borderMid};box-shadow:${C.shadowHover}}
        .tc.done{opacity:.35}
        .cb{width:17px;height:17px;border-radius:5px;border:1.5px solid ${C.borderMid};display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:all .15s;margin-top:1px}
        .cb:hover{border-color:${C.green}}
        .cb.on{background:${C.green};border-color:${C.green}}
        .pc{background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:20px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;box-shadow:${C.shadow}}
        .pc:hover{border-color:${C.borderMid};box-shadow:${C.shadowHover};transform:translateY(-2px)}
        .kk{background:${C.surfaceUp};border:1px solid ${C.border};border-radius:9px;padding:12px;margin-bottom:7px;cursor:pointer;transition:all .15s;font-size:13px;line-height:1.4;color:${C.text}}
        .kk:hover{border-color:${C.borderMid};box-shadow:0 2px 8px rgba(0,0,0,.05)}
        .col{background:${C.surfaceUp};border:1px solid ${C.border};border-radius:10px;padding:12px;min-width:224px;flex-shrink:0}
        .btn{display:flex;align-items:center;gap:6px;padding:8px 16px;background:${C.green};color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:Outfit,sans-serif;transition:background .15s;letter-spacing:.01em}
        .btn:hover{background:${C.greenLight}}
        .tb{padding:6px 14px;border-radius:7px;font-size:12px;font-weight:500;cursor:pointer;border:none;background:transparent;color:${C.textDim};font-family:Outfit,sans-serif;transition:all .15s;letter-spacing:.02em;display:flex;align-items:center;gap:5px}
        .tb:hover{color:${C.textMid};background:${C.border}}
        .tb.on{background:${C.surface};color:${C.text};box-shadow:0 1px 3px rgba(0,0,0,.07)}
        .chi{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;cursor:pointer;font-size:13px;color:${C.textDim};transition:all .15s}
        .chi:hover{background:${C.border};color:${C.textMid}}
        .chi.on{background:${C.greenGlow};color:${C.greenText}}
        .sl{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.textDim}}
        .tr{display:flex;align-items:center;gap:12px;padding:11px 14px;background:${C.surface};border-radius:9px;border:1px solid ${C.border};margin-bottom:6px;cursor:pointer;transition:all .15s;box-shadow:0 1px 2px rgba(0,0,0,.04)}
        .tr:hover{border-color:${C.borderMid};box-shadow:${C.shadowHover}}
        .tr.done{opacity:.35}
        @keyframes fi{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        .fi{animation:fi .2s ease forwards}
        .badge{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:4px;letter-spacing:.01em}
      `}</style>

      {/* ── SIDEBAR ── */}
      <div style={{ width: 220, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', padding: '20px 12px', flexShrink: 0, background: C.sidebar }}>
        {/* Logo */}
        <div style={{ padding: '4px 12px 26px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 600, letterSpacing: '.06em', color: C.text }}>SIDERA</span>
          <span style={{ color: C.green, fontSize: 10, marginTop: 1, fontWeight: 700 }}>✦</span>
        </div>

        <nav style={{ flex: 1 }}>
          <div className="sl" style={{ paddingLeft: 12, marginBottom: 10 }}>Workspace</div>
          {navItems.map(it => (
            <div key={it.id} className={`ni${nav === it.id && !project ? ' on' : ''}`} onClick={() => goTo(it.id)}>
              {it.icon}{it.label}
            </div>
          ))}

          <div style={{ margin: '18px 0 10px', borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
            <div className="sl" style={{ paddingLeft: 12, marginBottom: 10 }}>In arrivo</div>
            <div className="ni" style={{ opacity: .35, cursor: 'not-allowed' }}>
              <Archive size={15} />Archivio
              <span style={{ marginLeft: 'auto', fontSize: 9, background: C.border, padding: '2px 6px', borderRadius: 4, color: C.textDim, letterSpacing: '.05em', fontWeight: 700 }}>PRESTO</span>
            </div>
          </div>
        </nav>

        {/* POPS link */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 10 }}>
          <div
            className="ni"
            style={{ background: C.popsGlow, border: `1px solid ${C.popsBorder}`, color: C.pops, borderRadius: 9, fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,130,26,0.13)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.popsGlow; }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.04em' }}>POPS</span>
            <ExternalLink size={12} style={{ marginLeft: 'auto', opacity: .7 }} />
          </div>
        </div>

        {/* User */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${C.green},#1E5038)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>D</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Daniel</div>
            <div style={{ fontSize: 11, color: C.textDim }}>Admin</div>
          </div>
          <Settings size={13} style={{ marginLeft: 'auto', color: C.textDim, cursor: 'pointer' }} />
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {project
          ? <BoardView project={project} onBack={() => setProject(null)} tab={boardTab} setTab={setBoardTab} done={done} toggle={toggle} />
          : nav === 'home' ? <HomeView done={done} toggle={toggle} onProject={p => { setProject(p); setBoardTab('board'); }} />
          : nav === 'tasks' ? <TasksView done={done} toggle={toggle} filter={taskFilter} setFilter={setTaskFilter} />
          : nav === 'projects' ? <ProjectsView onSelect={p => { setProject(p); setBoardTab('board'); }} />
          : nav === 'chat' ? <ChatView ch={channel} setCh={setChannel} />
          : null}
      </div>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function HomeView({ done, toggle, onProject }) {
  const tasks = [
    { id: 1, title: 'Conferma preventivo Bianchi Costruzioni', proj: 'POPS', pc: C.pops },
    { id: 2, title: 'Revisione bozze Catalogo 2026', proj: 'Catalogo', pc: C.green },
    { id: 3, title: 'Risposta email Costruzioni Verdi', proj: 'Generale', pc: '#4A6B8A' },
  ];
  const projs = [
    { id: 1, name: 'Catalogo 2026', pct: 78, rem: 3, color: C.green, desc: '30 giu' },
    { id: 2, name: 'Showroom Milano', pct: 40, rem: 7, color: '#4A6B8A', desc: '15 lug' },
  ];
  const feed = [
    { who: 'Eva', action: 'ha completato', what: '"Bozza pagina prodotto"', when: '2h fa', c: '#4A6B8A' },
    { who: 'Marco', action: 'ha commentato su', what: '"Schede tecniche"', when: '4h fa', c: C.pops },
    { who: 'Eva', action: 'ha spostato', what: '"Copertina" → Revisione', when: 'ieri', c: '#4A6B8A' },
  ];
  const allProjs = [
    { id: 1, name: 'Catalogo 2026', desc: 'Progettazione e stampa catalogo annuale', pct: 78, total: 12, done: 9, color: C.green, members: ['E', 'M', 'D'], due: '30 giu' },
    { id: 2, name: 'Showroom Milano', desc: 'Allestimento nuovo spazio espositivo', pct: 40, total: 10, done: 4, color: '#4A6B8A', members: ['D', 'E'], due: '15 lug' },
  ];

  return (
    <div className="fi" style={{ height: '100%', overflow: 'auto', padding: '40px 52px' }}>
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 34, fontWeight: 400, fontStyle: 'italic', letterSpacing: '.01em', marginBottom: 5 }}>
          Buongiorno, Daniel.
        </div>
        <div style={{ fontSize: 13, color: C.textDim, letterSpacing: '.02em' }}>
          Venerdì, 15 maggio 2026 · 3 task per oggi
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 286px', gap: 36 }}>
        <div>
          <div className="sl" style={{ marginBottom: 14 }}>Le mie task — oggi</div>
          {tasks.map(t => (
            <div key={t.id} className={`tc${done.has(t.id) ? ' done' : ''}`} onClick={() => toggle(t.id)}>
              <div className={`cb${done.has(t.id) ? ' on' : ''}`}>
                {done.has(t.id) && <Check size={10} color="white" strokeWidth={3} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.4, textDecoration: done.has(t.id) ? 'line-through' : 'none', color: done.has(t.id) ? C.textDim : C.text }}>
                  {t.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span className="badge" style={{ color: t.pc, background: `${t.pc}14` }}>{t.proj}</span>
                  <span style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock size={10} />Oggi
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="sl" style={{ marginBottom: 14 }}>Progetti attivi</div>
          {projs.map(p => (
            <div key={p.id} onClick={() => onProject(allProjs.find(a => a.id === p.id))}
              style={{ padding: '16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 10, cursor: 'pointer', boxShadow: C.shadow, transition: 'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = C.shadowHover; e.currentTarget.style.borderColor = C.borderMid; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = C.shadow; e.currentTarget.style.borderColor = C.border; }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                <span style={{ fontSize: 11, color: p.color, fontWeight: 700 }}>{p.pct}%</span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
                <div style={{ width: `${p.pct}%`, height: '100%', background: p.color, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={10} />{p.rem} task rimaste · {p.desc}
              </div>
            </div>
          ))}

          <div className="sl" style={{ marginTop: 26, marginBottom: 14 }}>Aggiornamenti team</div>
          {feed.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 15 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${f.c}16`, border: `1.5px solid ${f.c}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: f.c, flexShrink: 0 }}>{f.who[0]}</div>
              <div>
                <div style={{ fontSize: 12, lineHeight: 1.6, color: C.textMid }}>
                  <span style={{ color: C.text, fontWeight: 500 }}>{f.who}</span> {f.action} <span style={{ color: C.greenText, fontWeight: 500 }}>{f.what}</span>
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>{f.when}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── TASKS ────────────────────────────────────────────────────────────────────
function TasksView({ done, toggle, filter, setFilter }) {
  const allTasks = [
    // Oggi
    { id: 10, title: 'Conferma preventivo Bianchi Costruzioni', proj: 'POPS', pc: C.pops, a: 'D', due: 'Oggi', group: 'oggi', p: 'alta', late: false },
    { id: 11, title: 'Revisione copertina Catalogo 2026', proj: 'Catalogo', pc: C.green, a: 'D', due: 'Oggi', group: 'oggi', p: 'alta', late: false },
    { id: 12, title: 'Testi sezione Inglesine', proj: 'Catalogo', pc: C.green, a: 'E', due: 'Oggi', group: 'oggi', p: 'alta', late: false },
    // Questa settimana
    { id: 13, title: 'Approvazione budget Showroom', proj: 'Showroom', pc: '#4A6B8A', a: 'D', due: 'Mar 19', group: 'week', p: 'alta', late: false },
    { id: 14, title: 'Call con fornitore alluminio', proj: 'Generale', pc: C.textMid, a: 'D', due: 'Mer 20', group: 'week', p: 'media', late: false },
    { id: 15, title: 'Schede tecniche prodotti nuovi', proj: 'Catalogo', pc: C.green, a: 'M', due: 'Gio 21', group: 'week', p: 'media', late: false },
    { id: 16, title: 'Verifica spedizioni pendenti', proj: 'Logistica', pc: '#6B4A8A', a: 'E', due: 'Ven 22', group: 'week', p: 'bassa', late: false },
    // Più avanti
    { id: 17, title: 'Revisione contratto nuovo dipendente', proj: 'HR', pc: '#7A6B4A', a: 'D', due: '3 giu', group: 'later', p: 'media', late: false },
    { id: 18, title: 'Aggiornamento listino prezzi', proj: 'POPS', pc: C.pops, a: 'E', due: '10 giu', group: 'later', p: 'alta', late: false },
    { id: 19, title: 'Formazione nuovo dipendente', proj: 'HR', pc: '#7A6B4A', a: 'E', due: '15 giu', group: 'later', p: 'bassa', late: false },
    // In ritardo
    { id: 20, title: 'Risposta email Costruzioni Rossi', proj: 'POPS', pc: C.pops, a: 'D', due: '12 mag', group: 'late', p: 'alta', late: true },
    { id: 21, title: 'Aggiornamento sito web prodotti', proj: 'Generale', pc: C.textMid, a: 'E', due: '10 mag', group: 'late', p: 'media', late: true },
  ];

  const myIds = [10, 11, 13, 14, 17, 18, 20];
  const filtered = filter === 'mie' ? allTasks.filter(t => myIds.includes(t.id))
    : filter === 'ritardo' ? allTasks.filter(t => t.late)
    : allTasks;

  const groups = filter === 'ritardo'
    ? [{ key: 'late', label: 'In ritardo', color: '#C8521A' }]
    : [
      { key: 'oggi', label: 'Oggi', color: C.green },
      { key: 'week', label: 'Questa settimana', color: C.textMid },
      { key: 'later', label: 'Più avanti', color: C.textDim },
    ];

  const Row = ({ t }) => (
    <div className={`tr${done.has(t.id) ? ' done' : ''}`} onClick={() => toggle(t.id)}>
      <div className={`cb${done.has(t.id) ? ' on' : ''}`} style={{ flexShrink: 0 }}>
        {done.has(t.id) && <Check size={10} color="white" strokeWidth={3} />}
      </div>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: pColor[t.p], flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 13.5, color: done.has(t.id) ? C.textDim : C.text, textDecoration: done.has(t.id) ? 'line-through' : 'none' }}>
        {t.title}
      </div>
      <span className="badge" style={{ color: t.pc, background: `${t.pc}12`, flexShrink: 0 }}>{t.proj}</span>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${aColor[t.a]}16`, border: `1.5px solid ${aColor[t.a]}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: aColor[t.a], flexShrink: 0 }}>{t.a}</div>
      <div style={{ fontSize: 11, color: t.late ? '#C8521A' : C.textDim, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, minWidth: 52, justifyContent: 'flex-end' }}>
        <Clock size={10} />{t.due}
      </div>
    </div>
  );

  return (
    <div className="fi" style={{ height: '100%', overflow: 'auto', padding: '40px 52px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 400, fontStyle: 'italic' }}>Task</div>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{allTasks.filter(t => !done.has(t.id)).length} da completare · {allTasks.filter(t => t.late && !done.has(t.id)).length} in ritardo</div>
        </div>
        <button className="btn"><Plus size={14} />Nuova task</button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: C.surfaceUp, padding: 4, borderRadius: 9, width: 'fit-content', border: `1px solid ${C.border}` }}>
        {[
          { id: 'mie', label: 'Le mie' },
          { id: 'tutte', label: 'Tutte' },
          { id: 'ritardo', label: '⚠ In ritardo' },
        ].map(f => (
          <button key={f.id} className={`tb${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}
            style={{ color: filter === f.id ? C.text : C.textDim }}>
            {f.label}
          </button>
        ))}
      </div>

      {groups.map(g => {
        const rows = filtered.filter(t => t.group === g.key);
        if (!rows.length) return null;
        return (
          <div key={g.key} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
              <span className="sl" style={{ color: g.color }}>{g.label}</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ fontSize: 11, color: C.textDim }}>{rows.filter(r => !done.has(r.id)).length}</span>
            </div>
            {rows.map(t => <Row key={t.id} t={t} />)}
          </div>
        );
      })}
    </div>
  );
}

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
function ProjectsView({ onSelect }) {
  const projects = [
    { id: 1, name: 'Catalogo 2026', desc: 'Progettazione e stampa catalogo annuale prodotti', pct: 78, total: 12, done: 9, color: C.green, members: ['E', 'M', 'D'], due: '30 giu' },
    { id: 2, name: 'Showroom Milano', desc: 'Allestimento nuovo spazio espositivo zona Brera', pct: 40, total: 10, done: 4, color: '#4A6B8A', members: ['D', 'E'], due: '15 lug' },
    { id: 3, name: 'Lancio Social Q2', desc: 'Campagna Instagram e LinkedIn secondo trimestre', pct: 25, total: 8, done: 2, color: C.pops, members: ['E'], due: '31 mag' },
    { id: 4, name: 'Formazione Team', desc: 'Onboarding nuovi dipendenti e aggiornamento procedure', pct: 60, total: 5, done: 3, color: '#6B4A8A', members: ['D', 'E', 'L'], due: '20 mag' },
  ];

  return (
    <div className="fi" style={{ height: '100%', overflow: 'auto', padding: '40px 52px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 400, fontStyle: 'italic' }}>Progetti</div>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>4 attivi · 2 archiviati</div>
        </div>
        <button className="btn"><Plus size={14} />Nuovo progetto</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
        {projects.map(p => (
          <div key={p.id} className="pc" onClick={() => onSelect(p)}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: p.color, borderRadius: '12px 12px 0 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, marginTop: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{p.name}</div>
              <MoreHorizontal size={14} style={{ color: C.textDim, cursor: 'pointer' }} />
            </div>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 18, lineHeight: 1.6 }}>{p.desc}</div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
                <span style={{ color: C.textDim }}>{p.done}/{p.total} task</span>
                <span style={{ color: p.color, fontWeight: 700 }}>{p.pct}%</span>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: C.border }}>
                <div style={{ width: `${p.pct}%`, height: '100%', background: p.color, borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex' }}>
                {p.members.map((m, i) => (
                  <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: `${p.color}18`, border: `1.5px solid ${p.color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: p.color, marginLeft: i > 0 ? -7 : 0, zIndex: p.members.length - i, position: 'relative' }}>{m}</div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} />{p.due}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BOARD ────────────────────────────────────────────────────────────────────
function BoardView({ project, onBack, tab, setTab, done, toggle }) {
  const cols = [
    { id: 'todo', label: 'Da fare', color: C.textDim, cards: [{ id: 30, title: 'Fotografia pagine 12–15', a: 'M', p: 'alta' }, { id: 31, title: 'Video presentazione prodotti', a: 'E', p: 'media' }, { id: 32, title: 'Aggiornamento listino prezzi', a: 'E', p: 'alta' }] },
    { id: 'wip', label: 'In lavorazione', color: C.green, cards: [{ id: 33, title: 'Testi sezione Inglesine', a: 'E', p: 'alta' }, { id: 34, title: 'Schede tecniche prodotti', a: 'M', p: 'media' }] },
    { id: 'rev', label: 'In revisione', color: C.pops, cards: [{ id: 35, title: 'Layout copertina', a: 'D', p: 'alta' }] },
    { id: 'done', label: 'Completato', color: '#4A6B8A', cards: [{ id: 36, title: 'Brief creativo approvato', a: 'D', p: 'bassa' }, { id: 37, title: 'Ricerca font tipografia', a: 'E', p: 'bassa' }, { id: 38, title: 'Palette colori definita', a: 'E', p: 'media' }, { id: 39, title: 'Formato e dimensioni', a: 'D', p: 'bassa' }] },
  ];
  const views = [
    { id: 'board', icon: <Layout size={12} />, l: 'Board' },
    { id: 'list', icon: <AlignLeft size={12} />, l: 'Lista' },
    { id: 'cal', icon: <Calendar size={12} />, l: 'Calendario' },
    { id: 'notes', icon: <FileText size={12} />, l: 'Note' },
  ];

  return (
    <div className="fi" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '22px 36px 0', borderBottom: `1px solid ${C.border}`, background: C.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textDim, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'Outfit', padding: 0 }}>
            <ArrowLeft size={13} />Progetti
          </button>
          <span style={{ color: C.borderMid }}>/</span>
          <span style={{ fontSize: 12, color: C.textMid }}>{project.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, fontWeight: 500 }}>{project.name}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: project.color, background: `${project.color}12`, padding: '3px 10px', borderRadius: 20 }}>{project.pct}% completato</div>
        </div>
        <div style={{ display: 'flex', gap: 2, background: C.surfaceUp, padding: 3, borderRadius: 8, width: 'fit-content', border: `1px solid ${C.border}` }}>
          {views.map(v => <button key={v.id} className={`tb${tab === v.id ? ' on' : ''}`} onClick={() => setTab(v.id)}>{v.icon}{v.l}</button>)}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 36px', background: C.bg }}>
        {tab === 'board' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 'max-content' }}>
            {cols.map(col => (
              <div key={col.id} className="col" style={{ width: 228 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
                    <span className="sl" style={{ color: C.textMid }}>{col.label}</span>
                    <span style={{ fontSize: 11, color: C.textDim }}>{col.cards.length}</span>
                  </div>
                  <Plus size={12} style={{ color: C.textDim, cursor: 'pointer' }} />
                </div>
                {col.cards.map(c => (
                  <div key={c.id} className="kk">
                    <div style={{ marginBottom: 10 }}>{c.title}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${aColor[c.a]}16`, border: `1.5px solid ${aColor[c.a]}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: aColor[c.a] }}>{c.a}</div>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: pColor[c.p] }} />
                    </div>
                  </div>
                ))}
                <div style={{ padding: '7px 8px', fontSize: 11, color: C.textDim, cursor: 'pointer', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.border; e.currentTarget.style.color = C.textMid; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.textDim; }}>
                  <Plus size={11} />Aggiungi task
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'list' && (
          <div style={{ maxWidth: 640 }}>
            <div className="sl" style={{ marginBottom: 16 }}>Tutte le task</div>
            {cols.flatMap(c => c.cards).map((c, i) => (
              <div key={i} className="tr">
                <div className="cb" style={{ flexShrink: 0 }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: pColor[c.p], flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13 }}>{c.title}</div>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${aColor[c.a]}16`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: aColor[c.a] }}>{c.a}</div>
              </div>
            ))}
          </div>
        )}
        {(tab === 'cal' || tab === 'notes') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 12, color: C.textDim }}>
            <div style={{ fontSize: 36, opacity: .3 }}>{tab === 'cal' ? '◫' : '▤'}</div>
            <div style={{ fontSize: 13 }}>Vista {tab === 'cal' ? 'Calendario' : 'Note'} · disponibile a breve</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────
function ChatView({ ch, setCh }) {
  const channels = [
    { id: 'generale', l: 'Generale', dot: true },
    { id: 'catalogo', l: 'Catalogo 2026' },
    { id: 'showroom', l: 'Showroom Milano' },
    { id: 'logistica', l: 'Logistica' },
  ];
  const msgs = {
    generale: [
      { from: 'Daniel', t: '10:23', text: 'Dobbiamo aggiornare il listino prima della stampa del catalogo.', a: 'D', c: C.green },
      { from: 'Eva', t: '10:25', text: 'Ho già la bozza aggiornata. Creo una task?', a: 'E', c: '#4A6B8A' },
      { from: 'Daniel', t: '10:26', text: 'Sì, assegnala a te con scadenza venerdì.', a: 'D', c: C.green, task: true },
      { from: 'Eva', t: '10:27', text: 'Fatto! La trovi già in lavorazione nella board del Catalogo.', a: 'E', c: '#4A6B8A' },
    ],
    catalogo: [
      { from: 'Eva', t: '09:10', text: 'La copertina è pronta per la tua revisione.', a: 'E', c: '#4A6B8A' },
      { from: 'Daniel', t: '09:45', text: 'La guardo oggi pomeriggio, grazie.', a: 'D', c: C.green },
    ],
    showroom: [
      { from: 'Daniel', t: '08:30', text: 'Confermate le date per l\'installazione?', a: 'D', c: C.green },
      { from: 'Eva', t: '08:52', text: 'Sì, tutto confermato per il 22 maggio.', a: 'E', c: '#4A6B8A' },
    ],
    logistica: [
      { from: 'Eva', t: 'ieri', text: '3 spedizioni in attesa di conferma dalla sede.', a: 'E', c: '#4A6B8A' },
    ],
  };

  return (
    <div className="fi" style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <div style={{ width: 196, borderRight: `1px solid ${C.border}`, padding: '24px 10px', flexShrink: 0, background: C.sidebar }}>
        <div className="sl" style={{ paddingLeft: 10, marginBottom: 12 }}>Canali</div>
        {channels.map(c => (
          <div key={c.id} className={`chi${ch === c.id ? ' on' : ''}`} onClick={() => setCh(c.id)}>
            <Hash size={12} style={{ flexShrink: 0 }} />{c.l}
            {c.dot && ch !== c.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, marginLeft: 'auto', flexShrink: 0 }} />}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface }}>
        <div style={{ padding: '18px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500 }}>
          <Hash size={14} style={{ color: C.textDim }} />{channels.find(c => c.id === ch)?.l}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', background: C.bg }}>
          {(msgs[ch] || []).map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${m.c}18`, border: `1.5px solid ${m.c}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: m.c, flexShrink: 0, marginTop: 1 }}>{m.a}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{m.from}</span>
                  <span style={{ fontSize: 11, color: C.textDim }}>{m.t}</span>
                </div>
                <div style={{ fontSize: 13.5, color: C.textMid, lineHeight: 1.7 }}>{m.text}</div>
                {m.task && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '10px 14px', background: C.greenGlow, border: `1px solid ${C.greenBorder}`, borderRadius: 8 }}>
                    <CheckSquare size={14} style={{ color: C.green, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.greenText }}>Task creata</div>
                      <div style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>Aggiornamento listino · Assegnata a Eva · Venerdì 16 mag</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 28px', borderTop: `1px solid ${C.border}`, background: C.surface }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.surfaceUp, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px' }}>
            <input placeholder={`Scrivi in #${channels.find(c => c.id === ch)?.l}...`}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, fontFamily: 'Outfit' }} />
            <Send size={14} style={{ color: C.textDim, cursor: 'pointer', flexShrink: 0 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
