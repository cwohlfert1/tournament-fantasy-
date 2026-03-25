import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDocTitle } from '../hooks/useDocTitle';
import AuthLayout, { IconInput } from '../components/AuthLayout';
import api from '../api';

export default function Register() {
  useDocTitle('Create Account | TourneyRun');
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sdSession = searchParams.get('smartdraft_session');
  const thenUrl   = searchParams.get('then');

  const [form, setForm]     = useState({ email: '', username: '', password: '', confirmPassword: '' });
  const [checks, setChecks] = useState({ terms: false, age: false, state: false });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const allChecked = checks.terms && checks.age && checks.state;
  const [showPw, setShowPw]   = useState(false);
  const [showCPw, setShowCPw] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    if (form.password.length < 6) return setError('Password must be at least 6 characters');
    if (!allChecked) return setError('Please complete all required acknowledgments to continue.');
    setLoading(true);
    try {
      await register(form.email, form.username, form.password, {
        agreement_accepted: checks.terms,
        age_confirmed: checks.age,
        state_eligible: checks.state,
      });
      // Claim the standalone Smart Draft credit if we came from Stripe checkout
      if (sdSession) {
        try { await api.post('/payments/claim-credit', { session_id: sdSession }); } catch {}
        navigate('/basketball/create-league?smartdraft=1');
      } else if (thenUrl) {
        navigate(thenUrl);
      } else {
        navigate('/basketball/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const EyeBtn = ({ show, onToggle }) => (
    <button type="button" onClick={onToggle} className="text-gray-500 hover:text-gray-300 transition-colors text-sm select-none">
      {show ? '🙈' : '👁'}
    </button>
  );

  return (
    <AuthLayout>
      {/* Smart Draft credit banner */}
      {sdSession && (
        <div className="flex items-center gap-2.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-xl px-4 py-3 text-sm mb-5">
          <span className="text-xl shrink-0">⚡</span>
          <div>
            <div className="font-bold">Smart Draft credit ready!</div>
            <div className="text-yellow-400/80 text-xs mt-0.5">Create your account to activate it.</div>
          </div>
        </div>
      )}

      {/* Headline */}
      <div className="text-center mb-7">
        <h1 className="text-2xl font-black text-white mb-1">Create your TourneyRun account</h1>
        <p className="text-gray-400 text-sm">Golf pools, fantasy leagues, and more.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3.5 py-2.5 text-sm">
            <span className="shrink-0 mt-0.5">⚠️</span>
            {error}
          </div>
        )}

        <div className="space-y-3">
          <IconInput
            icon="👤"
            type="text"
            placeholder="Username"
            value={form.username}
            onChange={e => set('username', e.target.value)}
            required
            autoComplete="username"
          />
          <IconInput
            icon="📧"
            type="email"
            placeholder="Email address"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            required
            autoComplete="email"
          />
          <IconInput
            icon="🔒"
            type={showPw ? 'text' : 'password'}
            placeholder="Password (min. 6 characters)"
            value={form.password}
            onChange={e => set('password', e.target.value)}
            required
            autoComplete="new-password"
            rightSlot={<EyeBtn show={showPw} onToggle={() => setShowPw(s => !s)} />}
          />
          <IconInput
            icon="🔒"
            type={showCPw ? 'text' : 'password'}
            placeholder="Confirm password"
            value={form.confirmPassword}
            onChange={e => set('confirmPassword', e.target.value)}
            required
            autoComplete="new-password"
            rightSlot={<EyeBtn show={showCPw} onToggle={() => setShowCPw(s => !s)} />}
          />
        </div>

        {/* Compliance checkboxes */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            {
              key: 'terms',
              label: (
                <>
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#00e87a', textDecoration: 'underline' }}>Terms of Service</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#00e87a', textDecoration: 'underline' }}>Privacy Policy</a>
                </>,
              ),
            },
            {
              key: 'age',
              label: 'I confirm that I am 18 years of age or older',
            },
            {
              key: 'state',
              label: 'I confirm that I am not located in or a resident of Washington (WA), Idaho (ID), Montana (MT), Nevada (NV), or Louisiana (LA)',
            },
          ].map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={checks[key]}
                onChange={e => setChecks(c => ({ ...c, [key]: e.target.checked }))}
                style={{ accentColor: '#00e87a', marginTop: 2, flexShrink: 0, width: 15, height: 15 }}
              />
              <span style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{label}</span>
            </label>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading || !allChecked}
          className="w-full py-3 rounded-xl font-black text-base text-black transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:scale-100"
          style={{ background: 'linear-gradient(135deg, #00e87a 0%, #00c96a 100%)' }}
        >
          {loading ? 'Creating account…' : 'Create Account →'}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-gray-800 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link to="/login" className="text-green-400 hover:text-green-300 font-semibold transition-colors">
          Sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
