import SilkSwatch from './SilkSwatch';

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
            className={`border rounded-2xl p-3 transition-colors ${
              isScratched ? 'border-red-500/30 opacity-50' :
              isMe ? 'border-horses-500 bg-horses-500/10' :
              'border-gray-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <SilkSwatch silkColors={a.silk_colors} size={32} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-sm font-semibold ${isMe ? 'text-horses-300' : 'text-white'}`}>
                    {a.display_name}{isMe ? ' (you)' : ''}
                  </span>
                  {isScratched && (
                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wide">Refund pending</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-mono">#{a.post_position || '?'}</span>
                  <span className={`font-medium ${isScratched ? 'line-through text-gray-600' : 'text-gray-300'}`}>
                    {a.horse_name}
                  </span>
                  {a.jockey_name && <span>&middot; {a.jockey_name}</span>}
                  {a.morning_line_odds && <span>({a.morning_line_odds})</span>}
                  {isShared && !isScratched && (
                    <span className="text-gray-600">shared with {shared.length - 1} other{shared.length > 2 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
