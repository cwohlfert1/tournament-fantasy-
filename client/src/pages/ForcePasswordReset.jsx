import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, KeyRound, Eye, EyeOff, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import AuthLayout, { IconInput } from '../components/AuthLayout';
import Alert from '../components/ui/Alert';
import { useDocTitle } from '../hooks/useDocTitle';
import api from '../api';

export default function ForcePasswordReset() {
  useDocTitle('Set New Password | TourneyRun');
  const { user, updateUser, loading } = useAuth();
  const navigate = useNavigate();

  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew, setShowNew]     = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/login', { replace: true }); return; }
    if (!user.force_password_reset) { navigate('/', { replace: true }); }
  }, [user, loading, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPw.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match'); return; }
    setSaving(true);
    try {
      await api.post('/auth/force-reset-password', { newPassword: newPw });
      updateUser({ force_password_reset: false });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return null;

  const EyeBtn = ({ show, onToggle }) => (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? 'Hide password' : 'Show password'}
      className="h-8 w-8 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors rounded-md"
    >
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );

  return (
    <AuthLayout>
      <div className="text-center mb-6">
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <KeyRound size={22} style={{ color: '#fbbf24' }} />
        </div>
        <h1 className="text-2xl font-semibold text-white tracking-tight mb-2">Set your password</h1>
        <p className="text-gray-400 text-sm leading-relaxed">
          Your account was given a temporary password.<br />
          Create a new one to continue.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="destructive" title={error} onClose={() => setError('')} compact />
        )}

        <IconInput
          label="New password"
          icon={<Lock size={16} aria-hidden="true" />}
          type={showNew ? 'text' : 'password'}
          placeholder="At least 6 characters"
          value={newPw}
          onChange={e => setNewPw(e.target.value)}
          required
          autoComplete="new-password"
          rightSlot={<EyeBtn show={showNew} onToggle={() => setShowNew(s => !s)} />}
        />
        <IconInput
          label="Confirm password"
          icon={<CheckCircle2 size={16} aria-hidden="true" />}
          type={showConf ? 'text' : 'password'}
          placeholder="Re-enter password"
          value={confirmPw}
          onChange={e => setConfirmPw(e.target.value)}
          required
          autoComplete="new-password"
          rightSlot={<EyeBtn show={showConf} onToggle={() => setShowConf(s => !s)} />}
        />

        <button
          type="submit"
          disabled={saving}
          className="w-full h-11 rounded-xl font-bold text-sm text-black transition-all duration-200 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 mt-2"
          style={{ background: 'linear-gradient(135deg, #22c55e 0%, #00c96a 100%)' }}
        >
          {saving ? 'Saving…' : (<>Set new password <ArrowRight size={16} /></>)}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-gray-600">
        Signed in as <span className="text-gray-400">{user.email}</span>
      </p>
    </AuthLayout>
  );
}
