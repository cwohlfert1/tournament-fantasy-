import { useState, useEffect } from 'react';

const MESSAGES = [
  'Loading your squad...',
  'Checking the brackets...',
  'Scouting the competition...',
  'Warming up the scoreboard...',
  'Getting your players ready...',
];

const STYLES = `
@keyframes ballBounce {
  0%, 100% {
    transform: translateY(0) scaleX(1.18) scaleY(0.82);
    animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  50% {
    transform: translateY(-60px) scaleX(0.88) scaleY(1.12);
    animation-timing-function: cubic-bezier(0.55, 0.055, 0.675, 0.19);
  }
}
@keyframes shadowPulse {
  0%, 100% {
    transform: scaleX(1.2);
    opacity: 0.45;
  }
  50% {
    transform: scaleX(0.45);
    opacity: 0.1;
  }
}
`;

/**
 * BallLoader — bouncing 🏀 emoji with squish/stretch + cycling messages.
 *
 * Props:
 *   fullScreen  {boolean} — wraps in min-h-screen centering (default false)
 *   message     {string}  — static message override; cycling disabled when set
 */
export default function BallLoader({ fullScreen = false, message }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);

  useEffect(() => {
    if (message) return;
    const interval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setMsgIndex(i => (i + 1) % MESSAGES.length);
        setFadeIn(true);
      }, 350);
    }, 2500);
    return () => clearInterval(interval);
  }, [message]);

  const displayMsg = message ?? MESSAGES[msgIndex];

  const inner = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <style>{STYLES}</style>

      {/* Ball + shadow stack */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg
          viewBox="0 0 64 64"
          style={{ width: 64, height: 64, display: 'block', animation: 'ballBounce 0.72s ease-in-out infinite' }}
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="bball-shade" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="60%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#c2410c" />
            </radialGradient>
          </defs>
          <circle cx="32" cy="32" r="30" fill="url(#bball-shade)" stroke="#9a3412" strokeWidth="1" />
          <path d="M32 2 Q42 17 42 32 Q42 47 32 62" fill="none" stroke="#7c2d12" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M32 2 Q22 17 22 32 Q22 47 32 62" fill="none" stroke="#7c2d12" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M2 32 Q17 24 32 24 Q47 24 62 32" fill="none" stroke="#7c2d12" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M2 32 Q17 40 32 40 Q47 40 62 32" fill="none" stroke="#7c2d12" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <div style={{
          width: 44,
          height: 10,
          borderRadius: '50%',
          backgroundColor: 'rgba(0,0,0,0.55)',
          marginTop: 6,
          animation: 'shadowPulse 0.72s ease-in-out infinite',
        }} />
      </div>

      {/* Cycling message */}
      <p style={{
        color: '#9ca3af',
        fontSize: 15,
        fontWeight: 500,
        margin: 0,
        minHeight: 22,
        opacity: fadeIn ? 1 : 0,
        transition: 'opacity 0.3s ease',
        textAlign: 'center',
      }}>
        {displayMsg}
      </p>
    </div>
  );

  if (fullScreen) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {inner}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 80,
      paddingBottom: 80,
    }}>
      {inner}
    </div>
  );
}
