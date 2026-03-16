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
        <div style={{
          fontSize: 64,
          lineHeight: 1,
          display: 'block',
          animation: 'ballBounce 0.72s ease-in-out infinite',
        }}>
          🏀
        </div>
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
