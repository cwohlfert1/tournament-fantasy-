import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

const CHIPS = [
  "Who should I target in round 1?",
  "Best value picks this tournament?",
  "Which 1 seed is most likely to get upset?",
  "Break down the Midwest region",
];

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function SindariusWidget() {
  const { user } = useAuth();
  const location = useLocation();

  const leagueId = location.pathname.match(/^\/league\/([^/]+)/)?.[1] ?? null;

  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState([
    { role: 'assistant', content: "What's good? I'm Sindarius — ask me anything about the tournament. 🏀", ts: Date.now() },
  ]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [chipsUsed, setChipsUsed] = useState(false);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const historyRef = useRef([]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Only render on /league/* pages — early return AFTER all hooks
  if (!user || !leagueId) return null;

  const send = async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || loading) return;

    setInput('');
    setChipsUsed(true);

    const userMsg = { role: 'user', content: trimmed, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await api.post('/sindarius/chat', {
        message: trimmed,
        leagueId,
        conversationHistory: historyRef.current,
      });

      const reply = res.data.reply;
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: reply },
      ].slice(-16);

      setMessages(prev => [...prev, { role: 'assistant', content: reply, ts: Date.now() }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err.response?.data?.error || "My bad — hit a snag. Run it back.",
        ts: Date.now(),
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const isMe = (msg) => msg.role === 'user';

  return (
    <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 9900 }} className="hidden md:block">

      {/* ── Chat panel ── */}
      {open && (
        <div style={{
          position: 'absolute', bottom: 64, left: 0,
          width: 320,
          background: '#1f2937',
          borderRadius: 14,
          border: '0.5px solid #374151',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          height: 420,
        }}>

          {/* Header */}
          <div style={{
            padding: '10px 14px', borderBottom: '0.5px solid #374151',
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#1f2937', flexShrink: 0,
          }}>
            <span style={{ fontSize: 16 }}>🏀</span>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, flex: 1 }}>Sindarius</span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#22c55e',
              background: '#22c55e18', border: '1px solid #22c55e40',
              borderRadius: 20, padding: '2px 7px', letterSpacing: '0.04em',
            }}>● AI</span>
            <button
              onClick={() => setOpen(false)}
              style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2 }}
            >✕</button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 10,
            background: '#111827',
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: isMe(msg) ? 'row-reverse' : 'row',
                alignItems: 'flex-end', gap: 6,
              }}>
                {/* Avatar */}
                {!isMe(msg) && (
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: '#1e3a5f', border: '1px solid #2563eb44',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11,
                  }}>🏀</div>
                )}

                <div style={{
                  maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: 2,
                  alignItems: isMe(msg) ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    background: isMe(msg) ? '#1e3a5f' : '#1e2d3d',
                    border: isMe(msg) ? '1px solid #2563eb33' : '1px solid #1e40af22',
                    color: msg.error ? '#f87171' : '#e2e8f0',
                    fontSize: 12, lineHeight: 1.5,
                    padding: '7px 10px',
                    borderRadius: isMe(msg) ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                  <div style={{ color: '#4b5563', fontSize: 9, padding: '0 2px' }}>
                    {fmtTime(msg.ts)}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: '#1e3a5f', border: '1px solid #2563eb44',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                }}>🏀</div>
                <div style={{
                  background: '#1e2d3d', border: '1px solid #1e40af22',
                  color: '#64748b', fontSize: 12, padding: '7px 10px',
                  borderRadius: '14px 14px 14px 4px',
                  fontStyle: 'italic',
                }}>
                  Sindarius is thinking... 🏀
                </div>
              </div>
            )}

            {/* Suggestion chips */}
            {!chipsUsed && messages.length <= 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {CHIPS.map(chip => (
                  <button
                    key={chip}
                    onClick={() => send(chip)}
                    style={{
                      background: 'none', border: '1px solid #374151',
                      borderRadius: 8, color: '#94a3b8',
                      fontSize: 11, padding: '6px 10px', cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'border-color 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.color = '#e2e8f0'; }}
                    onMouseLeave={e => { e.target.style.borderColor = '#374151'; e.target.style.color = '#94a3b8'; }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '8px 10px', borderTop: '0.5px solid #374151',
            display: 'flex', gap: 6, alignItems: 'center',
            background: '#1f2937', flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask Sindarius..."
              disabled={loading}
              style={{
                flex: 1, background: '#111827',
                border: '0.5px solid #374151', borderRadius: 8,
                color: '#fff', fontSize: 12, padding: '6px 10px', outline: 'none',
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 28, height: 28, borderRadius: 8, border: 'none', flexShrink: 0,
                background: input.trim() && !loading ? '#3b82f6' : '#374151',
                color: '#fff', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}
            >↑</button>
          </div>
        </div>
      )}

      {/* ── Launcher button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 2,
          width: 52, height: 52, borderRadius: '50%',
          background: '#1f2937', border: '1px solid #374151',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          position: 'relative',
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>🧠</span>
        <span style={{ fontSize: 8, color: '#64748b', fontWeight: 500, letterSpacing: '0.02em', lineHeight: 1 }}>
          Ask Sindarius
        </span>
      </button>
    </div>
  );
}
