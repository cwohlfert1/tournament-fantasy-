import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api';
import BallLoader from '../components/BallLoader';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const leagueId = searchParams.get('league_id');
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!leagueId) {
      setError('Missing league ID');
      setLoading(false);
      return;
    }
    api.get(`/leagues/${leagueId}/activate?session_id=${sessionId}`)
      .then(r => {
        setLeague(r.data.league);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Failed to activate league');
        setLoading(false);
      });
  }, [leagueId, sessionId]);

  const copyCode = () => {
    navigator.clipboard.writeText(league.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <BallLoader fullScreen message="Activating your league..." />;

  if (error) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
        <p className="text-red-400 mb-6">{error}</p>
        <Link to="/dashboard" className="btn-primary px-6 py-3">
          Go to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      {/* Success animation */}
      <div className="text-center mb-8">
        <div className="relative inline-block">
          <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <div className="text-5xl">✅</div>
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Payment Successful!</h1>
        <p className="text-gray-400">Your league is now active and ready for members.</p>
      </div>

      <div className="card p-6 mb-6 space-y-4">
        <h2 className="text-lg font-bold text-white border-b border-gray-800 pb-3">
          {league.name}
        </h2>

        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Status</span>
            <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full text-xs font-medium">
              Active Lobby
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Max Teams</span>
            <span className="text-white">{league.max_teams}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Draft Rounds</span>
            <span className="text-white">{league.total_rounds}</span>
          </div>
        </div>

        <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-2">Your Invite Code — share this with friends</p>
          <div className="flex items-center gap-3">
            <span className="text-brand-400 font-mono font-bold text-2xl tracking-widest flex-1">
              {league.invite_code}
            </span>
            <button
              onClick={copyCode}
              className="bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Link to={`/league/${league.id}`} className="btn-primary w-full py-3 text-center block">
          Go to League →
        </Link>
        <Link to="/dashboard" className="btn-secondary w-full py-3 text-center block">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
