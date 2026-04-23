export default function RandomDrawResults({ assignments = [], currentUserId, poolStatus }) {
  if (poolStatus === 'open') {
    return (
      <div className="text-center py-8 text-gray-500">
        Draw has not been run yet. Waiting for lock time or commissioner trigger.
      </div>
    );
  }

  if (!assignments.length) {
    return <div className="text-center py-8 text-gray-500">No draw results available.</div>;
  }

  // Group by horse to detect shared assignments
  const byHorse = {};
  assignments.forEach(a => {
    if (!byHorse[a.assigned_horse_id]) byHorse[a.assigned_horse_id] = [];
    byHorse[a.assigned_horse_id].push(a);
  });

  return (
    <div className="space-y-2">
      {assignments.map(a => {
        const isMe = a.user_id === currentUserId;
        const shared = byHorse[a.assigned_horse_id];
        const isShared = shared.length > 1;
        const isScratched = a.refund_status === 'scratched_refund';

        return (
          <div
            key={a.entry_id}
            className={`border rounded-lg p-3 transition-colors ${
              isScratched ? 'border-red-500/30 opacity-50' :
              isMe ? 'border-horses-500 bg-horses-500/10' :
              'border-gray-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-sm font-medium ${isMe ? 'text-horses-300' : 'text-white'}`}>
                {a.display_name}{isMe ? ' (you)' : ''}
              </span>
              {isScratched && (
                <span className="text-xs text-red-400 uppercase tracking-wide">Refund pending</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-400 font-mono">#{a.post_position || '?'}</span>
              <span className={`text-white font-medium ${isScratched ? 'line-through' : ''}`}>
                {a.horse_name}
              </span>
              {a.jockey_name && <span className="text-gray-500">{a.jockey_name}</span>}
              {a.morning_line_odds && <span className="text-gray-500">({a.morning_line_odds})</span>}
              {isShared && !isScratched && (
                <span className="text-gray-500 text-xs">shared with {shared.length - 1} other{shared.length > 2 ? 's' : ''}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
