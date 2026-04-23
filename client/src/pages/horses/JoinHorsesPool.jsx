import { useState, useEffect } from 'react';
import { useSearchParams, useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';

const FORMAT_LABELS = { random_draw: 'Random Draw', pick_wps: 'Pick W/P/S', squares: 'Squares' };

export default function JoinHorsesPool() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { code: urlCode } = useParams();
  const [code, setCode] = useState(urlCode || searchParams.get('code') || '');
  const [preview, setPreview] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (code.length >= 4) fetchPreview(code);
  }, [code]);

  useEffect(() => {
    if (user) setDisplayName(user.username || user.full_name || '');
  }, [user]);

  async function fetchPreview(c) {
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const r = await api.get(`/horses/pools/preview/${c.toUpperCase()}`);
      setPreview(r.data.pool);
    } catch {
      if (c.length >= 8) setError('Pool not found. Check your invite code.');
    } finally { setLoading(false); }
  }

  async function handleJoin() {
    setError('');
    setJoining(true);
    try {
      const r = await api.post('/horses/pools/join', { invite_code: code.toUpperCase(), display_name: displayName });
      const { entry_id, pool_id } = r.data;

      // If entry fee > 0, redirect to payment
      if (preview && Number(preview.entry_fee) > 0) {
        const payRes = await api.post('/horses/payments/entry', { pool_id, entry_id });
        if (payRes.data.alreadyPaid || payRes.data.free) {
          navigate(`/horses/pool/${pool_id}`);
        } else if (payRes.data.url) {
          window.location.href = payRes.data.url;
        }
      } else {
        navigate(`/horses/pool/${pool_id}`);
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to join pool';
      if (err.response?.status === 409) {
        navigate(`/horses/pool/${err.response.data.pool_id}`);
      } else {
        setError(msg);
      }
    } finally { setJoining(false); }
  }

  const returnUrl = encodeURIComponent(`/horses/join?code=${code}`);

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl sm:text-3xl font-black text-white mb-6">Join Horse Racing Pool</h1>

      {/* Code input */}
      {!urlCode && (
        <div className="mb-6">
          <label className="text-sm text-gray-400 mb-1 block">Invite Code</label>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="Enter 8-character code" maxLength={8}
            className="bg-gray-800 border border-gray-800 rounded-2xl px-3 py-2 text-white text-sm w-full font-mono tracking-widest text-center text-lg" />
        </div>
      )}

      {loading && <div className="text-gray-500 text-center py-4">Looking up pool...</div>}
      {error && <div className="text-red-400 text-sm border border-red-500/30 rounded-2xl px-3 py-2 mb-4">{error}</div>}

      {/* Pool preview */}
      {preview && (
        <div className="border border-gray-800 rounded-2xl p-4 mb-6 space-y-3">
          <h2 className="text-white font-semibold text-lg">{preview.name}</h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Format</span><span className="text-white">{FORMAT_LABELS[preview.format_type] || preview.format_type}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Event</span><span className="text-white">{preview.event_name}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Entry Fee</span><span className="text-white">{Number(preview.entry_fee) > 0 ? `$${preview.entry_fee}` : 'FREE'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Entrants</span><span className="text-white">{preview.entrant_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Lock Time</span><span className="text-white">{preview.lock_time ? new Date(preview.lock_time).toLocaleString() : 'TBD'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Commissioner</span><span className="text-white">{preview.commissioner_name}</span></div>
          </div>

          {/* Auth gate */}
          {!user ? (
            <div className="space-y-2 pt-2">
              <Link to={`/login?then=${returnUrl}`} className="block w-full text-center bg-horses-500 hover:bg-horses-600 text-white py-2 rounded-2xl text-sm">Sign In to Join</Link>
              <Link to={`/register?then=${returnUrl}`} className="block w-full text-center border border-gray-800 hover:border-horses-500/40 text-white py-2 rounded-2xl text-sm">Create Account</Link>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Your Display Name</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="How others will see you" className="bg-gray-800 border border-gray-800 rounded-2xl px-3 py-2 text-white text-sm w-full" />
              </div>
              <button onClick={handleJoin} disabled={joining || !displayName}
                className="w-full bg-horses-500 hover:bg-horses-600 text-white py-2 rounded-2xl text-sm font-medium disabled:opacity-50">
                {joining ? 'Joining...' : Number(preview.entry_fee) > 0 ? `Join & Pay $${preview.entry_fee}` : 'Join Pool'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
