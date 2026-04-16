/**
 * MassBlast — inline textarea + "Send to all members" for custom
 * messages that aren't one of the quick-send templates.
 */
import { useState } from 'react';
import api from '../../../../api';

export default function MassBlast({ leagueId }) {
  const [msg, setMsg]         = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function send() {
    if (!msg.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post(`/golf/leagues/${leagueId}/blast`, { message: msg });
      setSent(true);
      setMsg('');
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send. Please try again.');
    }
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="Or write a custom message to all league members…"
        rows={3}
        className="input w-full resize-none text-sm"
      />
      {sent  && <p className="text-green-400 text-xs">Message sent to all members!</p>}
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        onClick={send}
        disabled={loading || !msg.trim()}
        className="text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? 'Sending…' : 'Send to all members'}
      </button>
    </div>
  );
}
