import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

export default function InviteSignup() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const { login } = useAuth();

  const [inviteInfo, setInviteInfo]   = useState(null); // { email, leagueName, leagueId }
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError, setInfoError]     = useState('');

  const [username, setUsername]             = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [formError, setFormError]           = useState('');

  // Fetch invite metadata on mount
  useEffect(() => {
    if (!token) {
      setInfoError('No invite token found in this link.');
      setLoadingInfo(false);
      return;
    }
    api.get(`/auth/invite/${token}`)
      .then(r => setInviteInfo(r.data))
      .catch(err => setInfoError(err.response?.data?.error || 'Invalid or expired invite link.'))
      .finally(() => setLoadingInfo(false));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/activate', { token, username, password });
      // Store token + user via AuthContext login helper
      await login(inviteInfo.email, password);
      // Navigate to the league if we know it, otherwise golf dashboard
      const dest = inviteInfo?.leagueId
        ? `/golf/league/${inviteInfo.leagueId}`
        : '/golf/dashboard';
      navigate(dest, { replace: true });
    } catch (err) {
      setFormError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  const bg = { minHeight: '100vh', background: '#0f1923', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' };
  const card = { width: '100%', maxWidth: 440, background: '#1a2733', borderRadius: 12, padding: '36px 32px', border: '1px solid #253544' };
  const label = { display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 6, fontWeight: 500 };
  const input = { width: '100%', background: '#0f1923', border: '1px solid #374151', borderRadius: 8, padding: '10px 14px', color: '#ffffff', fontSize: 15, boxSizing: 'border-box', outline: 'none' };
  const btn = { display: 'block', width: '100%', background: '#22c55e', color: '#0a1a10', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 24 };
  const btnDisabled = { ...btn, opacity: 0.5, cursor: 'not-allowed' };

  if (loadingInfo) {
    return (
      <div style={bg}>
        <div style={{ color: '#6b7280', fontSize: 15 }}>Checking invite…</div>
      </div>
    );
  }

  if (infoError) {
    return (
      <div style={bg}>
        <div style={card}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', marginBottom: 12 }}>Invite Link Invalid</div>
          <p style={{ color: '#9ca3af', fontSize: 15, marginTop: 0, marginBottom: 24 }}>{infoError}</p>
          <Link to="/golf" style={{ color: '#22c55e', fontSize: 14 }}>← Back to Golf</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={bg}>
      <div style={card}>
        {/* Logo */}
        <div style={{ marginBottom: 28, fontSize: 20, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.5px' }}>
          tourney<span style={{ color: '#22c55e' }}>run</span>
        </div>

        {/* Invite context */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            League Invite
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: '#ffffff' }}>
            Create your account
          </h1>
          {inviteInfo?.leagueName && (
            <p style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}>
              You've been invited to join{' '}
              <span style={{ color: '#22c55e', fontWeight: 600 }}>{inviteInfo.leagueName}</span>.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Email (locked) */}
          <div style={{ marginBottom: 16 }}>
            <span style={label}>Email</span>
            <div style={{ ...input, color: '#6b7280', cursor: 'default', userSelect: 'none' }}>
              {inviteInfo?.email}
            </div>
          </div>

          {/* Username */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Choose a username</label>
            <input
              style={input}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="coolplayer99"
              maxLength={30}
              required
              autoFocus
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Password</label>
            <input
              style={input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
            />
          </div>

          {/* Confirm */}
          <div style={{ marginBottom: 8 }}>
            <label style={label}>Confirm password</label>
            <input
              style={input}
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              required
            />
          </div>

          {formError && (
            <div style={{ fontSize: 13, color: '#f87171', marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
              {formError}
            </div>
          )}

          <button
            type="submit"
            style={submitting || !username || !password || !confirmPassword ? btnDisabled : btn}
            disabled={submitting || !username || !password || !confirmPassword}
          >
            {submitting ? 'Creating account…' : 'Create Account & Join League →'}
          </button>
        </form>

        <p style={{ margin: '20px 0 0', fontSize: 13, color: '#4b5563', textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#22c55e' }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}
