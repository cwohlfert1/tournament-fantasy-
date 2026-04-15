import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDocTitle } from '../hooks/useDocTitle';
import AuthLayout, { IconInput } from '../components/AuthLayout';
import api from '../api';

export default function Login() {
  useDocTitle('Sign In | TourneyRun');
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sdSession = searchParams.get('smartdraft_session');
  const thenUrl   = searchParams.get('then');

  const [form, setForm]       = useState({ email: '', password: '' });
  const [remember, setRemember] = useState(true);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [showForgotJoke, setShowForgotJoke] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (authLoading || !user) return;
    if (user.force_password_reset) {
      navigate('/account/set-password', { replace: true });
      return;
    }
    const dest = sdSession
      ? '/basketball/create-league?smartdraft=1'
      : thenUrl || '/';
    navigate(dest, { replace: true });
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      if (sdSession) {
        try { await api.post('/payments/claim-credit', { session_id: sdSession }); } catch {}
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const ForgotLink = !showForgotJoke ? (
    <button
      type="button"
      onClick={() => setShowForgotJoke(true)}
      className="text-xs text-green-400 hover:text-green-300 transition-colors"
    >
      Forgot password?
    </button>
  ) : (
    <Link to="/forgot-password" className="text-xs text-green-400 hover:text-green-300 font-medium transition-colors">
      Reset here →
    </Link>
  );

  return (
    <AuthLayout>
      {/* Headline */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Welcome back</h1>
        <p className="text-gray-400 text-sm mt-1">Sign in to access your pools and leagues.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3.5 py-2.5 text-sm">
            <span className="shrink-0 mt-0.5">⚠️</span>
            {error}
          </div>
        )}

        <IconInput
          id="email"
          label="Email or username"
          icon={<Mail size={16} aria-hidden="true" />}
          type="text"
          placeholder="you@example.com"
          value={form.email}
          onChange={e => set('email', e.target.value)}
          required
          autoComplete="username"
        />

        <IconInput
          id="password"
          label="Password"
          labelRight={ForgotLink}
          icon={<Lock size={16} aria-hidden="true" />}
          type={showPw ? 'text' : 'password'}
          placeholder="Enter your password"
          value={form.password}
          onChange={e => set('password', e.target.value)}
          required
          autoComplete="current-password"
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPw(s => !s)}
              className="h-8 w-8 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors rounded-md"
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          }
        />

        <label className="flex items-center gap-2 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            style={{ accentColor: '#22c55e', width: 15, height: 15 }}
          />
          <span className="text-sm text-gray-400">Remember me for 30 days</span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-xl font-bold text-sm text-black transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #22c55e 0%, #00c96a 100%)' }}
        >
          {loading ? 'Signing in…' : (<>Sign in <ArrowRight size={16} /></>)}
        </button>
      </form>

      <div className="mt-5 pt-5 border-t border-gray-800 text-center text-sm text-gray-500">
        Don't have an account?{' '}
        <Link to="/register" className="text-green-400 hover:text-green-300 font-semibold transition-colors">
          Create one
        </Link>
      </div>
    </AuthLayout>
  );
}
