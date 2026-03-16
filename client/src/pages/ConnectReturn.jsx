import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import BallLoader from '../components/BallLoader';

export default function ConnectReturn() {
  const [status, setStatus] = useState(null); // { connected, details_submitted }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch the latest Connect status so we can confirm what happened
    api.get('/payments/connect/status')
      .then(r => {
        setStatus(r.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <BallLoader fullScreen message="Checking your Stripe account..." />;

  const isConnected = status?.connected;

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${
        isConnected ? 'bg-green-500/20' : 'bg-yellow-500/20'
      }`}>
        <span className="text-5xl">{isConnected ? '✅' : '⏳'}</span>
      </div>

      <h1 className="text-2xl font-bold text-white mb-3">
        {isConnected ? 'Stripe Account Connected!' : 'Onboarding In Progress'}
      </h1>

      <p className="text-gray-400 mb-8">
        {isConnected
          ? "You're all set to receive payouts. When your league commissioner triggers payouts, funds will be transferred directly to your connected Stripe account."
          : "Your Stripe account is set up but not yet fully verified. You may need to complete additional steps before receiving payouts. Check your email for a message from Stripe."}
      </p>

      {status?.details_submitted && !isConnected && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 text-sm text-yellow-300 mb-6">
          Your details were submitted. Stripe may need additional time to verify your account.
        </div>
      )}

      <Link to="/dashboard" className="btn-primary px-8 py-3 inline-block">
        Go to Dashboard
      </Link>
    </div>
  );
}
