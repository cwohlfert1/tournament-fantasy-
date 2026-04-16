/**
 * Email Copy Modal — proper "Copy All" UX.
 *
 * Mobile users got a useless native prompt() OK/Cancel dialog before.
 * Now: textarea pre-selected on open + a clipboard-icon button that flips
 * to "Copied!" with a checkmark for 2s before resetting.
 */
import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function EmailCopyModal({ emails, count, onClose }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef(null);

  // Auto-select textarea content on open so even tap-to-copy works.
  useEffect(() => {
    const t = textRef.current;
    if (t) { t.focus(); t.select(); }
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(emails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers: select + execCommand fallback.
      const t = textRef.current;
      if (t) {
        t.focus(); t.select();
        try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      }
    }
  }

  return (
    <div
      onClick={onClose}
      data-testid="email-copy-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520,
        background: '#0d0d0d',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{count} Email Address{count === 1 ? '' : 'es'}</div>
          <button onClick={onClose} type="button" aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4, lineHeight: 0, borderRadius: 4 }}><X size={14} /></button>
        </div>
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 0, marginBottom: 10 }}>
          Tap Copy All, then paste into your email client's BCC field.
        </p>
        <textarea
          ref={textRef}
          readOnly
          value={emails}
          rows={6}
          style={{
            width: '100%', resize: 'vertical', minHeight: 110,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '10px 12px',
            color: '#e5e7eb', fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            lineHeight: 1.5, outline: 'none',
          }}
        />
        <button
          type="button"
          data-testid="copy-all-button"
          onClick={handleCopy}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', marginTop: 12, padding: '11px 16px', borderRadius: 10,
            border: copied ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(34,197,94,0.4)',
            background: copied ? 'rgba(34,197,94,0.22)' : 'rgba(34,197,94,0.14)',
            color: '#4ade80', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {copied ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy All
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'block', margin: '10px auto 0',
            background: 'transparent', border: 'none', color: '#6b7280',
            fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
          }}
        >Close</button>
      </div>
    </div>
  );
}
