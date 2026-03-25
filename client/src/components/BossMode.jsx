import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// ─── Fake Excel Data ─────────────────────────────────────────────────────────
const EXCEL_ROWS = [
  { dept: 'Sales - North',       jan: 482300, feb: 391800, mar: 521400, exp: 178200, category: 'Revenue' },
  { dept: 'Sales - South',       jan: 309700, feb: 287500, mar: 334200, exp: 142600, category: 'Revenue' },
  { dept: 'Marketing',           jan: 94200,  feb: 88700,  mar: 101300, exp: 312400, category: 'Expense' },
  { dept: 'Engineering',         jan: 0,      feb: 0,      mar: 0,      exp: 894500, category: 'Expense' },
  { dept: 'Product',             jan: 0,      feb: 0,      mar: 0,      exp: 437800, category: 'Expense' },
  { dept: 'Customer Success',    jan: 62100,  feb: 71400,  mar: 58900,  exp: 203100, category: 'Revenue' },
  { dept: 'Professional Svcs',  jan: 188400, feb: 204700, mar: 176300, exp: 89300,  category: 'Revenue' },
  { dept: 'HR & Recruiting',     jan: 0,      feb: 0,      mar: 0,      exp: 521200, category: 'Expense' },
  { dept: 'Finance & Legal',     jan: 0,      feb: 0,      mar: 0,      exp: 298700, category: 'Expense' },
  { dept: 'IT & Infrastructure', jan: 0,      feb: 0,      mar: 0,      exp: 187400, category: 'Expense' },
  { dept: 'Licensing Revenue',   jan: 341200, feb: 341200, mar: 341200, exp: 12400,  category: 'Revenue' },
  { dept: 'Partner Channel',     jan: 127800, feb: 143200, mar: 168900, exp: 54700,  category: 'Revenue' },
  { dept: 'G&A / Facilities',    jan: 0,      feb: 0,      mar: 0,      exp: 412300, category: 'Expense' },
  { dept: 'R&D Allocation',      jan: 0,      feb: 0,      mar: 0,      exp: 673100, category: 'Expense' },
  { dept: 'Subscriptions',       jan: 892400, feb: 921700, mar: 948300, exp: 31200,  category: 'Revenue' },
];

function fmt(n) {
  if (n === 0) return '';
  return '$' + n.toLocaleString('en-US');
}
function fmtRed(n) {
  if (n === 0) return '';
  return '($' + n.toLocaleString('en-US') + ')';
}

// ─── Fake Gmail Data ─────────────────────────────────────────────────────────
const GMAIL_ROWS = [
  { from: 'Michael Hartley',   subject: 'Re: Q1 Budget Review - Final Numbers',         snippet: "Thanks for sending this over. I've reviewed the attached and have a few questions about the Marketing line items before we...", time: '10:47 AM', unread: true,  star: false, label: 'Finance' },
  { from: 'Sarah Chen',        subject: 'Team Meeting Notes - 3/14',                    snippet: "Hi all, please find attached the notes from Friday's all-hands. Action items are highlighted in yellow. Please confirm your...", time: '9:22 AM',  unread: true,  star: true,  label: '' },
  { from: "Kevin O'Brien",     subject: 'Budget Approval Needed - Engineering HC',       snippet: 'We need sign-off on the two open headcount reqs by EOD Thursday. Both candidates have accepted verbally and we risk losing...', time: '8:05 AM',  unread: true,  star: false, label: 'Urgent' },
  { from: 'Noreply @ Concur',  subject: 'Expense Report #48821 Requires Approval',      snippet: 'An expense report submitted by Dana Wills requires your approval. Total: $1,284.37. Please log in to Concur to review...', time: 'Yesterday', unread: false, star: false, label: '' },
  { from: 'FWD: Lisa Park',    subject: 'FWD: Client Follow Up - Meridian Account',     snippet: '---------- Forwarded message --------- From: Lisa Park Subject: Meridian is asking about the renewal timeline again. Can you...', time: 'Yesterday', unread: false, star: true,  label: 'Client' },
  { from: 'IT Helpdesk',       subject: 'Your password expires in 7 days',              snippet: 'Your Active Directory password will expire on March 23rd. Please update it before then to avoid being locked out of corporate...', time: 'Mar 13',   unread: false, star: false, label: '' },
  { from: 'Jennifer Walsh',    subject: 'Re: Re: Re: Vendor Contract - NDA Revision',   snippet: "Legal has reviewed the redline and we're OK with sections 4 and 7 but still pushing back on 11(c). I'll loop in outside...", time: 'Mar 13',   unread: false, star: false, label: 'Legal' },
  { from: 'Tom Baxter',        subject: 'Action Required: Complete Benefits Enrollment', snippet: 'Open enrollment ends March 31st. You must log into the benefits portal to confirm your elections or your current coverage...', time: 'Mar 12',   unread: false, star: false, label: '' },
  { from: 'Samantha Torres',   subject: "Deck for Thursday's Board Presentation",       snippet: "Attached is the v4 deck. Please review slides 8-14 in particular - we revised the cohort analysis based on CFO feedback from...", time: 'Mar 12',   unread: false, star: true,  label: '' },
  { from: 'Azure DevOps',      subject: 'Pipeline prod-deploy completed successfully',  snippet: 'Build #4471 deployed to production at 2:14 AM UTC. All health checks passed. No action required.', time: 'Mar 11',   unread: false, star: false, label: '' },
  { from: 'Craig Hammond',     subject: 'Parking Policy Update - Effective April 1',    snippet: 'Facilities has updated the visitor parking policy starting next quarter. Reserved spots B4-B12 will require a badge for...', time: 'Mar 11',   unread: false, star: false, label: '' },
  { from: 'Maria Santos',      subject: 'Re: Quarterly Roadmap Sync - Reschedule?',     snippet: 'The 3pm slot conflicts with the investor call we just confirmed. Can we push to 4:30 or move to Wednesday morning?...', time: 'Mar 10',   unread: false, star: false, label: '' },
];

// ─── Excel Screen ─────────────────────────────────────────────────────────────
function FakeExcel({ onDismiss }) {
  const totalJan = EXCEL_ROWS.filter(r => r.category === 'Revenue').reduce((s, r) => s + r.jan, 0);
  const totalFeb = EXCEL_ROWS.filter(r => r.category === 'Revenue').reduce((s, r) => s + r.feb, 0);
  const totalMar = EXCEL_ROWS.filter(r => r.category === 'Revenue').reduce((s, r) => s + r.mar, 0);
  const totalExp = EXCEL_ROWS.reduce((s, r) => s + r.exp, 0);
  const totalQ1  = totalJan + totalFeb + totalMar;

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', flexDirection: 'column',
        background: '#fff', fontFamily: 'Calibri, "Segoe UI", Arial, sans-serif',
        fontSize: '13px', color: '#000',
        userSelect: 'none', cursor: 'default',
      }}
    >
      {/* Title bar */}
      <div style={{ background: '#217346', color: '#fff', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ fontSize: 16 }}>𝙓</span>
        <span style={{ fontWeight: 600 }}>Q1 2026 Budget Review.xlsx — Excel</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 11, opacity: 0.85 }}>
          <span>_</span><span>□</span><span style={{ fontWeight: 700 }}>✕</span>
        </div>
      </div>

      {/* Ribbon */}
      <div style={{ background: '#f3f3f3', borderBottom: '1px solid #ccc', padding: '2px 8px 0', display: 'flex', gap: 2 }}>
        {['File','Home','Insert','Page Layout','Formulas','Data','Review','View','Automate','Help'].map(t => (
          <div key={t} style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer', background: t === 'Home' ? '#fff' : 'transparent', borderRadius: '3px 3px 0 0', borderBottom: t === 'Home' ? '2px solid #217346' : 'none', color: t === 'Home' ? '#217346' : '#555' }}>
            {t}
          </div>
        ))}
      </div>

      {/* Ribbon tools row */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '2px 12px', display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: '#333' }}>
        {['Paste','Cut','Copy','Format Painter'].map(t => <span key={t} style={{ padding: '2px 6px', cursor: 'pointer' }}>{t}</span>)}
        <span style={{ borderLeft: '1px solid #ccc', paddingLeft: 16 }}>Calibri</span>
        <span style={{ background: '#f3f3f3', border: '1px solid #ccc', padding: '1px 6px', borderRadius: 2 }}>11 ▾</span>
        <span style={{ borderLeft: '1px solid #ccc', paddingLeft: 16 }}>
          <b>B</b> <i>I</i> <u>U</u>
        </span>
        <span style={{ marginLeft: 'auto', color: '#217346', fontSize: 12 }}>AutoSave ● On</span>
      </div>

      {/* Formula bar */}
      <div style={{ display: 'flex', alignItems: 'center', background: '#fff', borderBottom: '1px solid #d0d0d0', padding: '2px 8px', gap: 8 }}>
        <div style={{ border: '1px solid #bbb', padding: '1px 8px', width: 60, textAlign: 'center', fontSize: 12 }}>B4</div>
        <span style={{ color: '#888' }}>fx</span>
        <span style={{ fontSize: 12, color: '#555' }}>=SUM(C4:E4)</span>
      </div>

      {/* Sheet area */}
      <div style={{ flex: 1, overflow: 'auto', background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
          {/* Column headers */}
          <thead>
            <tr style={{ background: '#f3f3f3', borderBottom: '1px solid #ccc' }}>
              {['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((h, i) => (
                <th key={i} style={{ border: '1px solid #d0d0d0', padding: '2px 0', width: i === 0 ? 36 : i === 1 ? 200 : 110, textAlign: 'center', fontWeight: 400, fontSize: 12, color: '#444', background: '#f3f3f3' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Row 1: Title */}
            <tr>
              <td style={rowNum}>1</td>
              <td colSpan={8} style={{ ...cell, fontWeight: 700, fontSize: 16, color: '#1a1a1a', background: '#E2EFDA', padding: '6px 8px' }}>
                Q1 2026 Budget Review — Confidential
              </td>
            </tr>
            {/* Row 2: blank */}
            <tr>
              <td style={rowNum}>2</td>
              {[...Array(8)].map((_, i) => <td key={i} style={cell}></td>)}
            </tr>
            {/* Row 3: Column headers */}
            <tr style={{ background: '#217346' }}>
              <td style={rowNum}>3</td>
              {['Department / Line Item', 'Q1 Total', 'January', 'February', 'March', 'Total Expenses', 'Net (Q1)', 'YoY %'].map((h, i) => (
                <td key={i} style={{ ...cell, fontWeight: 700, color: '#fff', background: '#217346', padding: '4px 8px', textAlign: i > 0 ? 'right' : 'left' }}>{h}</td>
              ))}
              <td style={{ ...cell, background: '#217346' }}></td>
            </tr>
            {/* Data rows */}
            {EXCEL_ROWS.map((row, i) => {
              const q1 = row.jan + row.feb + row.mar;
              const net = q1 - row.exp;
              const yoy = ((Math.random() * 0.18) + (row.category === 'Revenue' ? 0.03 : -0.02)).toFixed(1) + '%';
              const bg = i % 2 === 0 ? '#fff' : '#F8FAF8';
              const isExpense = row.category === 'Expense';
              return (
                <tr key={i} style={{ background: bg }}>
                  <td style={rowNum}>{i + 4}</td>
                  <td style={{ ...cell, padding: '3px 8px', fontWeight: isExpense ? 400 : 500 }}>{row.dept}</td>
                  <td style={{ ...cell, textAlign: 'right', padding: '3px 8px', color: isExpense ? '#c0392b' : '#1a1a1a' }}>{isExpense ? fmtRed(q1) : fmt(q1)}</td>
                  <td style={{ ...cell, textAlign: 'right', padding: '3px 8px', color: '#555' }}>{fmt(row.jan)}</td>
                  <td style={{ ...cell, textAlign: 'right', padding: '3px 8px', color: '#555' }}>{fmt(row.feb)}</td>
                  <td style={{ ...cell, textAlign: 'right', padding: '3px 8px', color: '#555' }}>{fmt(row.mar)}</td>
                  <td style={{ ...cell, textAlign: 'right', padding: '3px 8px', color: '#c0392b' }}>{fmtRed(row.exp)}</td>
                  <td style={{ ...cell, textAlign: 'right', padding: '3px 8px', fontWeight: 600, color: net >= 0 ? '#217346' : '#c0392b' }}>{net >= 0 ? fmt(net) : fmtRed(Math.abs(net))}</td>
                  <td style={{ ...cell, textAlign: 'right', padding: '3px 8px', color: '#555' }}>{yoy}</td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{ background: '#E2EFDA', fontWeight: 700, borderTop: '2px solid #217346' }}>
              <td style={rowNum}>{EXCEL_ROWS.length + 4}</td>
              <td style={{ ...cell, padding: '4px 8px' }}>TOTAL</td>
              <td style={{ ...cell, textAlign: 'right', padding: '4px 8px' }}>{fmt(totalQ1)}</td>
              <td style={{ ...cell, textAlign: 'right', padding: '4px 8px' }}>{fmt(totalJan)}</td>
              <td style={{ ...cell, textAlign: 'right', padding: '4px 8px' }}>{fmt(totalFeb)}</td>
              <td style={{ ...cell, textAlign: 'right', padding: '4px 8px' }}>{fmt(totalMar)}</td>
              <td style={{ ...cell, textAlign: 'right', padding: '4px 8px', color: '#c0392b' }}>{fmtRed(totalExp)}</td>
              <td style={{ ...cell, textAlign: 'right', padding: '4px 8px', color: '#217346' }}>{fmt(totalQ1 - totalExp)}</td>
              <td style={{ ...cell, textAlign: 'right', padding: '4px 8px' }}>+12.4%</td>
            </tr>
            {/* Extra blank rows */}
            {[...Array(8)].map((_, i) => (
              <tr key={`blank-${i}`} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={rowNum}>{EXCEL_ROWS.length + 5 + i}</td>
                {[...Array(8)].map((__, j) => <td key={j} style={cell}></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sheet tabs */}
      <div style={{ background: '#f3f3f3', borderTop: '1px solid #ccc', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
        <span style={{ background: '#fff', border: '1px solid #ccc', borderBottom: 'none', padding: '2px 12px', color: '#217346', fontWeight: 600 }}>Q1 2026</span>
        <span style={{ padding: '2px 12px', color: '#888' }}>Q4 2025</span>
        <span style={{ padding: '2px 12px', color: '#888' }}>2025 Annual</span>
        <span style={{ padding: '2px 12px', color: '#888' }}>Headcount</span>
        <span style={{ padding: '2px 12px', color: '#888' }}>+</span>
        <span style={{ marginLeft: 'auto', color: '#888' }}>Ready  |  🔒 Shared  |  100%  ▾</span>
      </div>

      {/* Watermark */}
      <div style={{ position: 'absolute', bottom: 40, right: 16, fontSize: 11, color: 'rgba(0,0,0,0.18)', pointerEvents: 'none' }}>
        Back to the game 🏀 · click anywhere or press Esc
      </div>
    </div>
  );
}

// ─── Gmail Screen ─────────────────────────────────────────────────────────────
function FakeGmail({ onDismiss }) {
  const [selected, setSelected] = useState(null);

  const handleRowClick = (e, i) => {
    e.stopPropagation();
    setSelected(i === selected ? null : i);
  };

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', flexDirection: 'column',
        background: '#f6f8fc', fontFamily: '"Google Sans", Roboto, Arial, sans-serif',
        fontSize: '14px', color: '#202124',
        userSelect: 'none', cursor: 'default',
      }}
    >
      {/* Top bar */}
      <div style={{ background: '#f6f8fc', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 18, height: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}>
            {[0,1,2].map(i => <div key={i} style={{ height: 2, background: '#5f6368', borderRadius: 1 }}></div>)}
          </div>
          <svg width="92" height="30" viewBox="0 0 92 30" style={{ marginLeft: 4 }}>
            <text x="0" y="22" style={{ fontSize: 22, fontWeight: 400 }}>
              <tspan fill="#4285F4">G</tspan>
              <tspan fill="#EA4335">m</tspan>
              <tspan fill="#FBBC05">a</tspan>
              <tspan fill="#4285F4">i</tspan>
              <tspan fill="#34A853">l</tspan>
            </text>
          </svg>
        </div>
        {/* Search */}
        <div style={{ flex: 1, maxWidth: 720, background: '#eaf1fb', borderRadius: 24, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, color: '#5f6368' }}>
          <span>🔍</span>
          <span style={{ color: '#bbb', fontWeight: 300 }}>Search mail</span>
        </div>
        <div style={{ marginLeft: 'auto', width: 36, height: 36, borderRadius: '50%', background: '#4285F4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: 15 }}>
          J
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{ width: 256, background: '#f6f8fc', padding: '8px 0', borderRight: '1px solid #e0e0e0', flexShrink: 0 }}>
          <div style={{ margin: '4px 16px 12px', background: '#c2e7ff', borderRadius: 20, padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 500 }}>
            <span style={{ fontSize: 20 }}>✏️</span> Compose
          </div>
          {[
            ['📥', 'Inbox', '3'],
            ['⭐', 'Starred', ''],
            ['⏰', 'Snoozed', ''],
            ['📤', 'Sent', ''],
            ['📁', 'Drafts', '2'],
            ['🏷️', 'More', ''],
          ].map(([icon, label, badge]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px 6px 24px', borderRadius: '0 24px 24px 0', cursor: 'pointer', fontWeight: label === 'Inbox' ? 700 : 400, background: label === 'Inbox' ? '#d3e3fd' : 'transparent', marginRight: 8 }}>
              <span>{icon}</span>
              <span style={{ flex: 1 }}>{label}</span>
              {badge && <span style={{ fontSize: 12, color: '#444', fontWeight: 700 }}>{badge}</span>}
            </div>
          ))}
          <div style={{ margin: '12px 0', borderTop: '1px solid #e0e0e0' }}></div>
          {[['🏷️', 'Finance'], ['🏷️', 'Legal'], ['🏷️', 'Client'], ['🏷️', 'Urgent']].map(([icon, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 16px 4px 24px', cursor: 'pointer', color: '#444', fontSize: 13 }}>
              <span style={{ fontSize: 11 }}>●</span>{l}
            </div>
          ))}
        </div>

        {/* Email list */}
        <div style={{ flex: 1, overflow: 'auto', background: '#fff', borderRadius: '0 16px 16px 0', margin: '0 8px 0 0' }}>
          {/* Inbox tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', padding: '0 12px' }}>
            {[['Primary', true], ['Promotions', false], ['Social', false]].map(([tab, active]) => (
              <div key={tab} style={{ padding: '12px 24px', cursor: 'pointer', borderBottom: active ? '3px solid #1a73e8' : '3px solid transparent', color: active ? '#1a73e8' : '#5f6368', fontWeight: active ? 500 : 400, fontSize: 13 }}>
                {tab}
              </div>
            ))}
          </div>

          {/* Email rows */}
          {GMAIL_ROWS.map((row, i) => (
            <div
              key={i}
              onClick={e => handleRowClick(e, i)}
              style={{
                display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 12, cursor: 'pointer',
                borderBottom: '1px solid #f1f3f4',
                background: selected === i ? '#e8f0fe' : row.unread ? '#fff' : '#f8f9fa',
                fontWeight: row.unread ? 700 : 400,
              }}
            >
              <span style={{ color: '#bbb', fontSize: 16 }}>☐</span>
              <span style={{ color: row.star ? '#f4b400' : '#bbb', fontSize: 16 }}>★</span>
              <span style={{ width: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, fontSize: 13 }}>
                {row.from}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                <span>{row.subject}</span>
                <span style={{ color: '#5f6368', fontWeight: 400 }}> — {row.snippet}</span>
              </span>
              {row.label && (
                <span style={{ background: '#e8f0fe', color: '#1a73e8', fontSize: 11, padding: '1px 8px', borderRadius: 12, flexShrink: 0 }}>{row.label}</span>
              )}
              <span style={{ color: '#5f6368', fontSize: 12, flexShrink: 0, width: 56, textAlign: 'right' }}>{row.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Watermark */}
      <div style={{ position: 'absolute', bottom: 12, right: 16, fontSize: 11, color: 'rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
        Back to the game 🏀 · click anywhere or press Esc
      </div>
    </div>
  );
}

// ─── Cell / rowNum styles ────────────────────────────────────────────────────
const cell = {
  border: '1px solid #e0e0e0',
  padding: '2px 4px',
  fontSize: 12,
  verticalAlign: 'middle',
};
const rowNum = {
  background: '#f3f3f3',
  border: '1px solid #d0d0d0',
  textAlign: 'center',
  fontSize: 11,
  color: '#888',
  width: 36,
  padding: '2px 0',
};

// ─── Draggable Boss Button ────────────────────────────────────────────────────
function DraggableBossButton({ onClick }) {
  // posRef drives the actual position; state triggers re-render
  const posRef = useRef(null);
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem('bossButtonPos');
      if (saved) {
        const p = JSON.parse(saved);
        posRef.current = p;
        return p;
      }
    } catch (_) {}
    const p = { x: window.innerWidth - 90, y: window.innerHeight - 170 };
    posRef.current = p;
    return p;
  });

  const dragState = useRef(null); // { startMouseX, startMouseY, startPosX, startPosY }
  const moved = useRef(false);

  function clamp(x, y) {
    return {
      x: Math.max(0, Math.min(window.innerWidth - 72, x)),
      y: Math.max(0, Math.min(window.innerHeight - 72, y)),
    };
  }

  function applyPos(x, y) {
    const p = clamp(x, y);
    posRef.current = p;
    setPos({ ...p });
    return p;
  }

  function startDrag(clientX, clientY) {
    moved.current = false;
    dragState.current = {
      startMouseX: clientX,
      startMouseY: clientY,
      startPosX: posRef.current.x,
      startPosY: posRef.current.y,
    };
  }

  function moveDrag(clientX, clientY) {
    if (!dragState.current) return;
    const { startMouseX, startMouseY, startPosX, startPosY } = dragState.current;
    const dx = clientX - startMouseX;
    const dy = clientY - startMouseY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true;
    applyPos(startPosX + dx, startPosY + dy);
  }

  function endDrag(clientX, clientY) {
    if (!dragState.current) return;
    const { startMouseX, startMouseY, startPosX, startPosY } = dragState.current;
    const p = applyPos(startPosX + (clientX - startMouseX), startPosY + (clientY - startMouseY));
    dragState.current = null;
    localStorage.setItem('bossButtonPos', JSON.stringify(p));
  }

  useEffect(() => {
    const onMouseMove = (e) => moveDrag(e.clientX, e.clientY);
    const onMouseUp   = (e) => endDrag(e.clientX, e.clientY);
    const onTouchMove = (e) => { if (dragState.current) { e.preventDefault(); moveDrag(e.touches[0].clientX, e.touches[0].clientY); } };
    const onTouchEnd  = (e) => { if (dragState.current) endDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY); };

    document.addEventListener('mousemove',  onMouseMove);
    document.addEventListener('mouseup',    onMouseUp);
    document.addEventListener('touchmove',  onTouchMove, { passive: false });
    document.addEventListener('touchend',   onTouchEnd);
    return () => {
      document.removeEventListener('mousemove',  onMouseMove);
      document.removeEventListener('mouseup',    onMouseUp);
      document.removeEventListener('touchmove',  onTouchMove);
      document.removeEventListener('touchend',   onTouchEnd);
    };
  }, []); // eslint-disable-line

  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
      onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
      onClick={() => { if (!moved.current) onClick(); }}
      title="Boss is coming… (B = Excel, G = Gmail)"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9998,
        background: 'rgba(30,30,40,0.75)',
        color: 'rgba(255,255,255,0.80)',
        border: '1px solid rgba(255,255,255,0.22)',
        borderRadius: 10,
        padding: '6px 11px',
        fontSize: 14,
        cursor: 'grab',
        backdropFilter: 'blur(6px)',
        letterSpacing: '0.01em',
        lineHeight: 1.4,
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.85, marginBottom: 3, letterSpacing: '0.04em' }}>Boss Coming?</div>
      👔
    </button>
  );
}

// ─── Main BossMode Component ─────────────────────────────────────────────────
export default function BossMode() {
  const [mode, setMode] = useState(null); // null | 'excel' | 'gmail'
  const { pathname } = useLocation();
  const isDraft  = pathname.includes('/draft');
  const isGolf   = pathname.startsWith('/golf');
  const isHub    = pathname === '/';
  const isAuth   = pathname === '/login' || pathname === '/register' || pathname === '/forgot-password' || pathname === '/reset-password';

  const dismiss = useCallback(() => setMode(null), []);

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (e.key === 'Escape') { dismiss(); return; }
      if (e.key === 'b' || e.key === 'B') { setMode('excel'); return; }
      if (e.key === 'g' || e.key === 'G') { setMode('gmail'); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss]);

  return (
    <>
      {mode === null && !isDraft && !isGolf && !isHub && !isAuth && (
        <DraggableBossButton onClick={() => setMode('excel')} />
      )}
      {mode === 'excel' && <FakeExcel onDismiss={dismiss} />}
      {mode === 'gmail' && <FakeGmail onDismiss={dismiss} />}
    </>
  );
}
