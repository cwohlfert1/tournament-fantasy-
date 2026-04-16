import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MailCheck, ArrowLeft } from 'lucide-react';
import { useDocTitle } from '../hooks/useDocTitle';
import AuthLayout, { IconInput } from '../components/AuthLayout';
import Alert from '../components/ui/Alert';
import api from '../api';

export default function ForgotPassword() {
  useDocTitle('Reset Password | TourneyRun');
  const [email, setEmail]     = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email }, { timeout: 10000 });
      setSubmitted(true);
    } catch (err) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Something went wrong sending the email. Please try again or contact support.');
      } else {
        setError(err.response?.data?.error || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="text-center mb-7">
        <h1 className="text-2xl font-black text-white mb-1">Reset Password</h1>
        <p className="text-gray-400 text-sm">We'll send you a link to set a new password</p>
      </div>

      {submitted ? (
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-2" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <MailCheck size={26} style={{ color: '#4ade80' }} />
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">
            If that email is registered, you'll receive a reset link shortly. Check your inbox (and spam folder).
          </p>
          <p className="text-gray-500 text-xs">The link expires in 1 hour.</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 mt-4 text-green-400 hover:text-green-300 font-semibold text-sm transition-colors"
          >
            <ArrowLeft size={14} /> Back to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive" title={error} onClose={() => setError('')} compact />
          )}

          <IconInput
            icon={<Mail size={16} aria-hidden="true" />}
            type="email"
            placeholder="Your account email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-black text-base text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-brand-500/25 disabled:opacity-50 disabled:scale-100"
            style={{ background: 'linear-gradient(135deg, #378ADD 0%, #2563EB 100%)' }}
          >
            {loading ? 'Sending…' : 'Send Reset Link →'}
          </button>

          <div className="text-center">
            <Link to="/login" className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors">
              <ArrowLeft size={12} /> Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
