import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDocTitle } from '../hooks/useDocTitle';
import AuthLayout, { IconInput } from '../components/AuthLayout';
import api from '../api';

export default function Login() {
  useDocTitle('Sign In | TourneyRun');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sdSession = searchParams.get('smartdraft_session');
  const thenUrl   = searchParams.get('then');

  const [form, setForm]       = useState({ email: '', password: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [showForgotJoke, setShowForgotJoke] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      if (sdSession) {
        try { await api.post('/payments/claim-credit', { session_id: sdSession }); } catch {}
        navigate('/basketball/create-league?smartdraft=1');
      } else if (thenUrl) {
        navigate(thenUrl);
      } else {
        navigate('/basketball/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Headline */}
      <div className="text-center mb-7">
        <h1 className="text-2xl font-black text-white mb-1">Welcome Back</h1>
        <p className="text-gray-400 text-sm">Sign in to your TourneyRun account</p>
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
            icon="📧"
            type="text"
            placeholder="Email or username"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            required
            autoComplete="username"
          />
          <IconInput
            icon="🔒"
            type={showPw ? 'text' : 'password'}
            placeholder="Password"
            value={form.password}
            onChange={e => set('password', e.target.value)}
            required
            autoComplete="current-password"
            rightSlot={
              <button type="button" onClick={() => setShowPw(s => !s)} className="text-gray-500 hover:text-gray-300 transition-colors text-sm select-none">
                {showPw ? '🙈' : '👁'}
              </button>
            }
          />
        </div>

        <div className="flex justify-end -mt-1">
          {!showForgotJoke ? (
            <button
              type="button"
              onClick={() => setShowForgotJoke(true)}
              className="text-xs text-green-400 hover:text-green-300 transition-colors"
            >
              Forgot password?
            </button>
          ) : (
            <p className="text-xs text-gray-400 text-right leading-relaxed">
              Forgot your password? Contact your commissioner… just kidding,{' '}
              <Link to="/forgot-password" className="text-green-400 hover:text-green-300 font-semibold transition-colors">
                click here to reset it
              </Link>
              .
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl font-black text-base text-black transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:scale-100"
          style={{ background: 'linear-gradient(135deg, #22c55e 0%, #00c96a 100%)', boxShadow: undefined }}
        >
          {loading ? 'Signing in…' : 'Sign In →'}
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
