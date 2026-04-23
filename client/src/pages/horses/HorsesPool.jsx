import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import RandomDrawResults from '../../components/horses/RandomDrawResults';
import PickWPSForm from '../../components/horses/PickWPSForm';
import SquaresGrid from '../../components/horses/SquaresGrid';
import ResultsEntry from '../../components/horses/ResultsEntry';
import PayoutDisplay from '../../components/horses/PayoutDisplay';

const FORMAT_LABELS = { random_draw: 'Random Draw', pick_wps: 'Pick W/P/S', squares: 'Squares' };

export default function HorsesPool() {
  const { id } = useParams();
  const { user } = useAuth();
  const [pool, setPool] = useState(null);
  const [entries, setEntries] = useState([]);
  const [horses, setHorses] = useState([]);
  const [results, setResults] = useState([]);
  const [payouts, setPayouts] = useState(null);
  const [picks, setPicks] = useState([]);
  const [squares, setSquares] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawLoading, setDrawLoading] = useState(false);

  const isCommissioner = pool?.commissioner_id === user?.id;
  const myEntry = entries.find(e => e.user_id === user?.id);

  const loadPool = useCallback(async () => {
    try {
      const [poolRes, entriesRes, horsesRes] = await Promise.all([
        api.get(`/horses/pools/${id}`).catch(() => null),
        api.get(`/horses/pools/${id}`).catch(() => null), // pool endpoint returns entries too once implemented
        null, // horses loaded via event
      ]);

      // For now, load data from individual endpoints
      const p = poolRes?.data?.pool || poolRes?.data;
      if (p) setPool(p);

      // Load entries
      const eRes = await api.get(`/horses/pools/${id}`).catch(() => null);

      // Load horses for event
      if (p?.event_id) {
        const hRes = await api.get(`/horses/events/${p.event_id}/horses`).catch(() => null);
        if (hRes?.data?.horses) setHorses(hRes.data.horses);
      }

      // Load format-specific data
      if (p?.format_type === 'random_draw' && p.status !== 'open') {
        // Get draw assignments from entries
      }
      if (p?.format_type === 'pick_wps') {
        const pickRes = await api.get(`/horses/pools/${id}/picks`).catch(() => null);
        if (pickRes?.data?.picks) setPicks(pickRes.data.picks);
      }
      if (p?.format_type === 'squares') {
        const sqRes = await api.get(`/horses/pools/${id}/squares`).catch(() => null);
        if (sqRes?.data?.squares) setSquares(sqRes.data.squares);
      }

      // Load results
      if (p && ['results_entered', 'finalized'].includes(p.status)) {
        const rRes = await api.get(`/horses/pools/${id}/results`).catch(() => null);
        if (rRes?.data?.results) setResults(rRes.data.results);
      }

      // Load payouts
      if (p?.status === 'finalized') {
        const pRes = await api.get(`/horses/pools/${id}/payouts`).catch(() => null);
        if (pRes?.data) setPayouts(pRes.data);
      }
    } catch (err) {
      console.error('Failed to load pool:', err);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { loadPool(); }, [loadPool]);

  async function handleTriggerDraw() {
    setDrawLoading(true);
    try {
      await api.post(`/horses/pools/${id}/draw`);
      loadPool();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to trigger draw');
    } finally { setDrawLoading(false); }
  }

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">Loading...</div>;
  if (!pool) return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">Pool not found.</div>;

  const lockDate = pool.lock_time ? new Date(pool.lock_time) : null;
  const isLocked = pool.status !== 'open';
  const inviteUrl = `${window.location.origin}/horses/join?code=${pool.invite_code}`;

  // Parse payout_structure for display
  const payoutStructure = typeof pool.payout_structure === 'string' ? JSON.parse(pool.payout_structure) : pool.payout_structure;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Pool Header */}
      <div className="border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-white">{pool.name}</h1>
          <span className="text-xs text-gray-400 uppercase tracking-wide">{pool.status}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
          <span>{FORMAT_LABELS[pool.format_type]}</span>
          <span>${Number(pool.entry_fee).toFixed(2)} entry</span>
          {lockDate && <span>Locks {lockDate.toLocaleString()}</span>}
          <span>Payout: {payoutStructure?.map(p => `${p.pct}%`).join(' / ')}</span>
        </div>
        {pool.status === 'open' && (
          <div className="mt-3 flex items-center gap-2">
            <input readOnly value={inviteUrl} className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-white text-xs flex-1 font-mono" />
            <button onClick={() => { navigator.clipboard.writeText(inviteUrl); }}
              className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded">Copy</button>
          </div>
        )}
      </div>

      {/* Entrants */}
      <div>
        <h2 className="text-sm text-gray-400 uppercase tracking-wide mb-2">Entrants ({entries.length || 'loading...'})</h2>
        {/* Entrant list will be populated when GET /pools/:id returns entries */}
      </div>

      {/* Format-specific section */}
      <div>
        <h2 className="text-sm text-gray-400 uppercase tracking-wide mb-2">
          {pool.format_type === 'random_draw' ? 'Draw Results' : pool.format_type === 'pick_wps' ? 'Picks' : 'Squares Grid'}
        </h2>

        {pool.format_type === 'random_draw' && (
          <>
            {pool.status === 'open' && isCommissioner && (
              <button onClick={handleTriggerDraw} disabled={drawLoading}
                className="mb-3 bg-horses-500 hover:bg-horses-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
                {drawLoading ? 'Drawing...' : 'Trigger Draw Now'}
              </button>
            )}
            <RandomDrawResults assignments={assignments} currentUserId={user?.id} poolStatus={pool.status} />
          </>
        )}

        {pool.format_type === 'pick_wps' && (
          <PickWPSForm poolId={id} eventId={pool.event_id} horses={horses} currentPicks={picks} poolStatus={pool.status} onPicksSaved={loadPool} />
        )}

        {pool.format_type === 'squares' && (
          <SquaresGrid poolId={id} squares={squares} currentEntryId={myEntry?.id} poolStatus={pool.status} onUpdate={loadPool} />
        )}
      </div>

      {/* Results section (post-lock) */}
      {isLocked && (
        <div>
          <h2 className="text-sm text-gray-400 uppercase tracking-wide mb-2">Results</h2>
          {isCommissioner ? (
            <ResultsEntry poolId={id} horses={horses} formatType={pool.format_type}
              existingResults={results} isFinalized={!!pool.payouts_finalized_at}
              onResultsSaved={loadPool} onPayoutsTriggered={loadPool} />
          ) : results.length ? (
            <div className="space-y-1">
              {results.map(r => (
                <div key={r.finish_position} className="border border-gray-700 rounded-lg p-3 flex items-center gap-3">
                  <span className="text-gray-400 font-mono w-8">{r.finish_position}.</span>
                  <span className="text-white">{r.horse_name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Waiting for commissioner to enter results.</p>
          )}
        </div>
      )}

      {/* Payouts section (post-finalization) */}
      {pool.status === 'finalized' && payouts && (
        <div>
          <h2 className="text-sm text-gray-400 uppercase tracking-wide mb-2">Payouts</h2>
          <PayoutDisplay payouts={payouts.payouts} venmo={payouts.venmo} paypal={payouts.paypal} zelle={payouts.zelle}
            grossPool={payouts.grossPool} adminFee={payouts.adminFee} netPool={payouts.netPool} />
        </div>
      )}
    </div>
  );
}
