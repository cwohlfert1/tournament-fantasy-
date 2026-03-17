import { useState, useEffect, useRef } from 'react';
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

export default function SindariusTab({ leagueId }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "What's good? I'm Sindarius — ask me anything about the tournament. 🏀", ts: Date.now() },
  ]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [chipsUsed, setChipsUsed] = useState(false);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || loading) return;
    setInput('');
    setChipsUsed(true);

    setMessages(prev => [...prev, { role: 'user', content: trimmed, ts: Date.now() }]);
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
    <div className="card overflow-hidden flex flex-col" style={{ height: 520 }}>

      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '0.5px solid #374151',
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#1f2937', flexShrink: 0,
      }}>
        <span style={{ fontSize: 18 }}>🧠</span>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, flex: 1 }}>Sindarius</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#22c55e',
          background: '#22c55e18', border: '1px solid #22c55e40',
          borderRadius: 20, padding: '2px 8px', letterSpacing: '0.04em',
        }}>● AI</span>
        <span style={{ color: '#6b7280', fontSize: 11 }}>TourneyRun AI Analyst</span>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
        background: '#111827',
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            flexDirection: isMe(msg) ? 'row-reverse' : 'row',
            alignItems: 'flex-end', gap: 8,
          }}>
            {!isMe(msg) && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: '#1e3a5f', border: '1px solid #2563eb44',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>🏀</div>
            )}
            <div style={{
              maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: 3,
              alignItems: isMe(msg) ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                background: isMe(msg) ? '#1e3a5f' : '#1e2d3d',
                border: isMe(msg) ? '1px solid #2563eb33' : '1px solid #1e40af22',
                color: msg.error ? '#f87171' : '#e2e8f0',
                fontSize: 13, lineHeight: 1.55,
                padding: '8px 12px',
                borderRadius: isMe(msg) ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
              <div style={{ color: '#4b5563', fontSize: 10, padding: '0 2px' }}>
                {fmtTime(msg.ts)}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: '#1e3a5f', border: '1px solid #2563eb44',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            }}>🏀</div>
            <div style={{
              background: '#1e2d3d', border: '1px solid #1e40af22',
              color: '#64748b', fontSize: 13, padding: '8px 12px',
              borderRadius: '14px 14px 14px 4px', fontStyle: 'italic',
            }}>
              Sindarius is thinking... 🏀
            </div>
          </div>
        )}

        {/* Suggestion chips */}
        {!chipsUsed && messages.length <= 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {CHIPS.map(chip => (
              <button
                key={chip}
                onClick={() => send(chip)}
                style={{
                  background: 'none', border: '1px solid #374151',
                  borderRadius: 20, color: '#94a3b8',
                  fontSize: 12, padding: '6px 12px', cursor: 'pointer',
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
        padding: '10px 14px', borderTop: '0.5px solid #374151',
        display: 'flex', gap: 8, alignItems: 'center',
        background: '#1f2937', flexShrink: 0,
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask Sindarius anything about the tournament..."
          disabled={loading}
          style={{
            flex: 1, background: '#111827',
            border: '0.5px solid #374151', borderRadius: 10,
            color: '#fff', fontSize: 13, padding: '8px 12px', outline: 'none',
          }}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
            background: input.trim() && !loading ? '#3b82f6' : '#374151',
            color: '#fff', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}
        >↑</button>
      </div>
    </div>
  );
}
