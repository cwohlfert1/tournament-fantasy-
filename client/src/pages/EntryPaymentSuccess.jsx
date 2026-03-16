import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api';
import Disclaimer from '../components/Disclaimer';
import BallLoader from '../components/BallLoader';

export default function EntryPaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const leagueId = searchParams.get('league_id');

  useEffect(() => {
    if (!leagueId) {
      setLoading(false);
      return;
    }
    api.get(`/payments/league/${leagueId}/status`)
      .then(r => {
        setPaymentStatus(r.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [leagueId]);

  if (loading) return <BallLoader fullScreen message="Confirming your payment..." />;

  const paidCount = paymentStatus?.paid_count ?? 0;
  const totalCount = paymentStatus?.total_count ?? 0;
  const unpaidCount = totalCount - paidCount;

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      {/* Success animation */}
      <div className="text-center mb-8">
        <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
          <span className="text-5xl">✅</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Payment Confirmed!</h1>
        <p className="text-gray-400">You're officially in. Good luck this tournament!</p>
      </div>

      {/* League status card */}
      {paymentStatus && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-3">
            League Access
          </h2>

          <div className="text-center mb-4">
            <div className="text-4xl font-bold text-brand-400">$5.00</div>
            <div className="text-gray-400 text-sm mt-1">Access fee paid</div>
          </div>

          {unpaidCount > 0 ? (
            <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 text-sm text-yellow-300 text-center">
              {unpaidCount} team{unpaidCount !== 1 ? 's' : ''} still need to pay before the draft can begin.
            </div>
          ) : (
            <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3 text-sm text-green-300 text-center">
              All teams have paid — the draft can begin!
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {leagueId && (
          <Link to={`/league/${leagueId}`} className="btn-primary w-full py-3 text-center block">
            Go to League →
          </Link>
        )}
        <Link to="/dashboard" className="btn-secondary w-full py-3 text-center block">
          Back to Dashboard
        </Link>
      </div>

      <Disclaimer className="text-center mt-6" />
    </div>
  );
}
