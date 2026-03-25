import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useDocTitle } from '../hooks/useDocTitle';
import AuthLayout, { IconInput } from '../components/AuthLayout';
import api from '../api';

export default function ResetPassword() {
  useDocTitle('Set New Password | TourneyRun');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [form, setForm]       = useState({ password: '', confirmPassword: '' });
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [showCPw, setShowCPw] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (!token) {
    return (
      <AuthLayout>
        <div className="text-center space-y-4">
          <div className="text-4xl">🔗</div>
          <p className="text-gray-300 text-sm">This reset link is missing a token. Please request a new one.</p>
          <Link to="/forgot-password" className="block text-brand-400 hover:text-brand-300 font-semibold text-sm transition-colors">
            Request new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    if (form.password.length < 6) return setError('Password must be at least 6 characters');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password: form.password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed — the link may have expired');
    } finally {
      setLoading(false);
    }
  };

  const EyeBtn = ({ show, onToggle }) => (
    <button type="button" onClick={onToggle} className="p-2 text-gray-500 hover:text-gray-300 transition-colors text-sm select-none">
      {show ? '🙈' : '👁'}
    </button>
  );

  return (
    <AuthLayout>
      <div className="text-center mb-7">
        <h1 className="text-2xl font-black text-white mb-1">Set New Password</h1>
        <p className="text-gray-400 text-sm">Choose a strong password for your account</p>
      </div>

      {done ? (
        <div className="text-center space-y-3">
          <div className="text-5xl">✅</div>
          <p className="text-gray-300 text-sm">Password updated! Redirecting you to sign in…</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3.5 py-2.5 text-sm">
              <span className="shrink-0 mt-0.5">⚠️</span>
              {error}
            </div>
          )}

          <div className="space-y-3">
            <IconInput
              icon="🔒"
              type={showPw ? 'text' : 'password'}
              placeholder="New password (min. 6 characters)"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              required
              autoComplete="new-password"
              rightSlot={<EyeBtn show={showPw} onToggle={() => setShowPw(s => !s)} />}
            />
            <IconInput
              icon="🔒"
              type={showCPw ? 'text' : 'password'}
              placeholder="Confirm new password"
              value={form.confirmPassword}
              onChange={e => set('confirmPassword', e.target.value)}
              required
              autoComplete="new-password"
              rightSlot={<EyeBtn show={showCPw} onToggle={() => setShowCPw(s => !s)} />}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-black text-base text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-brand-500/25 disabled:opacity-50 disabled:scale-100"
            style={{ background: 'linear-gradient(135deg, #378ADD 0%, #2563EB 100%)' }}
          >
            {loading ? 'Updating…' : 'Update Password →'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
