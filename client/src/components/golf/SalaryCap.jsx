export default function SalaryCap({ used, cap }) {
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">Salary used</span>
        <span className={pct > 90 ? 'text-red-400 font-bold' : 'text-gray-300'}>
          ${used.toLocaleString()} / ${cap.toLocaleString()}
        </span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
