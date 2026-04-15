import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { User, Mail, Lock, IdCard, Eye, EyeOff, ArrowRight, Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDocTitle } from '../hooks/useDocTitle';
import AuthLayout, { IconInput } from '../components/AuthLayout';
import api from '../api';

export default function Register() {
  useDocTitle('Create Account | TourneyRun');
  const { register, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sdSession = searchParams.get('smartdraft_session');
  const thenUrl   = searchParams.get('then');
  const refCode   = searchParams.get('ref') || localStorage.getItem('ref_code') || '';

  const [form, setForm]     = useState({ email: '', username: '', full_name: '', password: '', confirmPassword: '' });
  const [checks, setChecks] = useState({ terms: false, age: false, state: false });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const allChecked = checks.terms && checks.age && checks.state;
  const [showPw, setShowPw]   = useState(false);
  const [showCPw, setShowCPw] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (authLoading || !user) return;
    const dest = sdSession
      ? '/basketball/create-league?smartdraft=1'
      : thenUrl || '/golf/dashboard';
    navigate(dest, { replace: true });
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    if (form.password.length < 6) return setError('Password must be at least 6 characters');
    if (!allChecked) return setError('Please complete all required acknowledgments to continue.');
    setLoading(true);
    try {
      await register(form.email, form.username, form.password, {
        full_name: form.full_name,
        agreement_accepted: checks.terms,
        age_confirmed: checks.age,
        state_eligible: checks.state,
        ...(refCode && { ref_code: refCode }),
      });
      if (refCode) localStorage.removeItem('ref_code');
      if (sdSession) {
        try { await api.post('/payments/claim-credit', { session_id: sdSession }); } catch {}
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const EyeBtn = ({ show, onToggle }) => (
    <button
      type="button"
      onClick={onToggle}
      className="h-8 w-8 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors rounded-md"
      aria-label={show ? 'Hide password' : 'Show password'}
    >
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );

  return (
    <AuthLayout>
      {/* Smart Draft credit banner */}
      {sdSession && (
        <div className="flex items-center gap-2.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-xl px-4 py-3 text-sm mb-5">
          <Zap size={18} className="shrink-0 text-yellow-400" />
          <div>
            <div className="font-bold">Smart Draft credit ready!</div>
            <div className="text-yellow-400/80 text-xs mt-0.5">Create your account to activate it.</div>
          </div>
        </div>
      )}

      {/* Headline */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Create your account</h1>
        <p className="text-gray-400 text-sm mt-1">Golf pools, fantasy leagues, and more.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3.5 py-2.5 text-sm">
            <span className="shrink-0 mt-0.5">⚠️</span>
            {error}
          </div>
        )}

        <IconInput
          id="username"
          label="Username"
          icon={<User size={16} aria-hidden="true" />}
          type="text"
          placeholder="yourhandle"
          value={form.username}
          onChange={e => set('username', e.target.value)}
          required
          autoComplete="username"
        />

        <div>
          <IconInput
            id="full_name"
            label="Full name"
            icon={<IdCard size={16} aria-hidden="true" />}
            type="text"
            placeholder="John Smith"
            value={form.full_name}
            onChange={e => set('full_name', e.target.value)}
            autoComplete="name"
          />
          <p className="text-gray-600 text-[10px] mt-1 ml-1">
            Used by pool commissioners to identify you for payment tracking
          </p>
        </div>

        <IconInput
          id="email"
          label="Email address"
          icon={<Mail size={16} aria-hidden="true" />}
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={e => set('email', e.target.value)}
          required
          autoComplete="email"
        />

        <IconInput
          id="password"
          label="Password"
          icon={<Lock size={16} aria-hidden="true" />}
          type={showPw ? 'text' : 'password'}
          placeholder="At least 6 characters"
          value={form.password}
          onChange={e => set('password', e.target.value)}
          required
          autoComplete="new-password"
          rightSlot={<EyeBtn show={showPw} onToggle={() => setShowPw(s => !s)} />}
        />

        <IconInput
          id="confirmPassword"
          label="Confirm password"
          icon={<Lock size={16} aria-hidden="true" />}
          type={showCPw ? 'text' : 'password'}
          placeholder="Re-enter password"
          value={form.confirmPassword}
          onChange={e => set('confirmPassword', e.target.value)}
          required
          autoComplete="new-password"
          rightSlot={<EyeBtn show={showCPw} onToggle={() => setShowCPw(s => !s)} />}
        />

        {/* Compliance checkboxes */}
        <div className="mt-4 flex flex-col gap-3 pt-2">
          {[
            {
              key: 'terms',
              label: (
                <>
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 underline underline-offset-2">
                    Terms of Service
                  </a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 underline underline-offset-2">
                    Privacy Policy
                  </a>
                </>
              ),
            },
            { key: 'age', label: 'I confirm that I am 18 years of age or older' },
            { key: 'state', label: 'I confirm that I am not located in or a resident of Washington (WA), Idaho (ID), Montana (MT), Nevada (NV), or Louisiana (LA)' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={checks[key]}
                onChange={e => setChecks(c => ({ ...c, [key]: e.target.checked }))}
                style={{ accentColor: '#22c55e', marginTop: 2, flexShrink: 0, width: 15, height: 15 }}
              />
              <span className="text-[13px] text-gray-400 leading-snug">{label}</span>
            </label>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading || !allChecked}
          className="w-full h-11 rounded-xl font-bold text-sm text-black transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 mt-2"
          style={{ background: 'linear-gradient(135deg, #22c55e 0%, #00c96a 100%)' }}
        >
          {loading ? 'Creating account…' : (<>Create account <ArrowRight size={16} /></>)}
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
