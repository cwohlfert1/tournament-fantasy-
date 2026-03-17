import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import Disclaimer from '../components/Disclaimer';

function fmt(n) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

const STRIPE_ENABLED = import.meta.env.VITE_STRIPE_ENABLED === 'true';

export default function JoinLeague() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ invite_code: '', team_name: '', venmo_handle: '', zelle_handle: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // League preview (fetched once invite code is 8 chars)
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // After joining successfully
  const [joined, setJoined] = useState(null); // { league }
  const [paying, setPaying] = useState(false);

  // Auto-fetch league preview when invite code reaches 8 chars
  useEffect(() => {
    if (form.invite_code.length !== 8) {
      setPreview(null);
      setPreviewError('');
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError('');
    api.get(`/leagues/preview/${form.invite_code}`)
      .then(res => { if (!cancelled) { setPreview(res.data.league); setPreviewLoading(false); } })
      .catch(err => {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(err.response?.data?.error || 'League not found');
          setPreviewLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [form.invite_code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/leagues/join', form);
      const { league, requiresPayment } = res.data;
      if (!requiresPayment) {
        navigate(`/league/${league.id}`);
      } else {
        setJoined({ league });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to join league');
    } finally {
      setLoading(false);
    }
  };

  const handlePayEntryFee = async () => {
    setError('');
    setPaying(true);
    try {
      const res = await api.post('/payments/entry-checkout', { leagueId: joined.league.id });
      window.location.href = res.data.url;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start payment');
      setPaying(false);
    }
  };

  // ── Payment prompt screen (after successful join) ─────────────────────────
  if (joined) {
    const league = joined.league;
    const buyIn = league.buy_in_amount || 0;
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">✅</span>
          </div>
          <h1 className="text-2xl font-bold text-white">You're In!</h1>
          <p className="text-gray-400 mt-1">
            You've joined <span className="text-white font-semibold">{league.name}</span>.
          </p>
        </div>

        <div className="card p-6 mb-4 space-y-4">
          {/* TourneyRun $5 access fee */}
          <div>
            <div className="text-white font-semibold text-sm mb-2">Step 1 — TourneyRun Access Fee</div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Platform access fee</span>
              <span className="text-white font-bold">$5.00</span>
            </div>
            <p className="text-gray-500 text-xs">Paid securely via Stripe. Required to participate in the draft.</p>
          </div>

          {/* Group buy-in reminder */}
          {buyIn > 0 && (
            <div className="border-t border-gray-700 pt-4">
              <div className="text-white font-semibold text-sm mb-2">Step 2 — Group Buy-in</div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">League buy-in</span>
                <span className="text-brand-400 font-bold text-lg">{fmt(buyIn)}</span>
              </div>
              {league.payment_instructions ? (
                <div className="bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2 text-brand-300 text-sm mt-2">
                  <span className="font-semibold">How to pay: </span>{league.payment_instructions}
                </div>
              ) : (
                <p className="text-gray-500 text-xs">Pay your commissioner directly — ask them how they'd like to collect.</p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          {STRIPE_ENABLED ? (
            <>
              <button
                onClick={handlePayEntryFee}
                disabled={paying}
                className="btn-primary w-full py-3 text-lg"
              >
                {paying ? 'Redirecting to Stripe...' : 'Pay $5.00 Access Fee'}
              </button>
              <button
                onClick={() => navigate(`/league/${league.id}`)}
                className="w-full mt-1 text-center text-gray-400 hover:text-gray-200 text-sm py-2 transition-colors"
              >
                Pay later — go to league
              </button>
            </>
          ) : (
            <>
              <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-4 text-sm text-brand-300 leading-relaxed">
                <span className="font-semibold block mb-1">Payment collected separately</span>
                Payment is collected via Venmo or Zelle. Join now to reserve your spot — your commissioner will confirm payment directly.
              </div>
              <button
                onClick={() => navigate(`/league/${league.id}`)}
                className="btn-primary w-full py-3 text-lg"
              >
                Go to League →
              </button>
            </>
          )}

          <Disclaimer className="text-center mt-1" />
        </div>
      </div>
    );
  }

  // ── Join form ─────────────────────────────────────────────────────────────
  const buyIn = preview?.buy_in_amount || 0;

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">🏀</div>
        <h1 className="text-3xl font-bold text-white">Join a League</h1>
        <p className="text-gray-400 mt-1">Enter your invite code to join an existing league</p>
      </div>

      <div className="card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="label">Invite Code</label>
            <input
              type="text"
              className="input font-mono uppercase tracking-widest text-lg text-center"
              placeholder="XXXX0000"
              value={form.invite_code}
              onChange={e => setForm({ ...form, invite_code: e.target.value.toUpperCase() })}
              maxLength={8}
              required
            />
            <p className="text-gray-500 text-xs mt-1.5">Ask your commissioner for the invite code</p>
          </div>

          {/* League preview */}
          {previewLoading && (
            <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-4 text-center text-gray-500 text-sm animate-pulse">
              Looking up league...
            </div>
          )}
          {previewError && (
            <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-3 text-red-400 text-sm">
              {previewError}
            </div>
          )}
          {preview && !previewLoading && (
            <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-bold">{preview.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  preview.status === 'lobby' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-700 text-gray-400'
                }`}>
                  {preview.status === 'lobby' ? 'Open' : preview.status}
                </span>
              </div>

              {/* Managers joined */}
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{preview.member_count} of {preview.max_teams} teams joined</span>
                  <span>{preview.max_teams - preview.member_count} spots left</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-brand-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${(preview.member_count / preview.max_teams) * 100}%` }}
                  />
                </div>
              </div>

              {/* Buy-in info */}
              {buyIn > 0 ? (
                <div className="space-y-1.5 border-t border-brand-500/20 pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Buy-in per team</span>
                    <span className="text-brand-400 font-bold">{fmt(buyIn)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Prize pool (if full)</span>
                    <span className="text-white font-semibold">{fmt(buyIn * preview.max_teams)}</span>
                  </div>
                  {preview.payment_instructions && (
                    <div className="bg-gray-800/60 rounded px-3 py-2 text-gray-300 text-xs mt-1">
                      <span className="text-gray-400 font-medium">How to pay: </span>
                      {preview.payment_instructions}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-500 text-xs border-t border-gray-700 pt-2">
                  No group buy-in — this is a free league.
                </div>
              )}
            </div>
          )}

          <div>
            <label className="label">Your Team Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. One Shining Moment"
              value={form.team_name}
              onChange={e => setForm({ ...form, team_name: e.target.value })}
              required
            />
          </div>

          {/* Payment handles — required for all leagues except the free one */}
          {preview && form.invite_code.toUpperCase() !== 'G7V9XM6W' && (
            <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-4 space-y-3">
              <div>
                <div className="text-white font-semibold text-sm mb-0.5">How will you pay your buy-in?</div>
                <p className="text-gray-500 text-xs">At least one payment handle is required so your commissioner can collect.</p>
              </div>
              <div>
                <label className="label">Venmo</label>
                <input
                  type="text"
                  className="input"
                  placeholder="@yourhandle"
                  value={form.venmo_handle}
                  onChange={e => setForm({ ...form, venmo_handle: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Zelle</label>
                <input
                  type="text"
                  className="input"
                  placeholder="phone number or email"
                  value={form.zelle_handle}
                  onChange={e => setForm({ ...form, zelle_handle: e.target.value })}
                />
              </div>
              {!form.venmo_handle.trim() && !form.zelle_handle.trim() && (
                <p className="text-amber-400/80 text-xs">⚠ Fill in at least one to continue</p>
              )}
            </div>
          )}

          {!STRIPE_ENABLED && preview && (
            <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-3 text-sm text-brand-300 leading-relaxed">
              <span className="font-semibold">Payment collected separately via Venmo or Zelle.</span>{' '}
              Join now to reserve your spot — your commissioner will confirm payment directly.
            </div>
          )}

          {(() => {
            const isFree = form.invite_code.toUpperCase() === 'G7V9XM6W';
            const needsHandle = preview && !isFree && !form.venmo_handle.trim() && !form.zelle_handle.trim();
            return (
              <button
                type="submit"
                disabled={loading || !!previewError || needsHandle}
                className="btn-primary w-full py-3 disabled:opacity-50"
              >
                {loading ? 'Joining...' : 'Join League →'}
              </button>
            );
          })()}

          {buyIn > 0 && (
            <p className="text-gray-500 text-xs text-center">
              Joining commits you to the {fmt(buyIn)} buy-in — pay your commissioner per their instructions.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
