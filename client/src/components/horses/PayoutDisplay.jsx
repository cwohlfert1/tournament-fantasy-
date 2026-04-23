export default function PayoutDisplay({ payouts = [], venmo, paypal, zelle, grossPool, adminFee, netPool }) {
  if (!payouts.length) {
    return <div className="text-center py-4 text-gray-500">No payouts calculated yet.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Payout table */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400 text-left">
              <th className="px-4 py-2">Position</th>
              <th className="px-4 py-2">Winner</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p, i) => (
              <tr key={i} className="border-b border-gray-800">
                <td className="px-4 py-2 text-gray-400 uppercase text-xs tracking-wide">{p.payout_type}</td>
                <td className="px-4 py-2 text-white">
                  {p.display_name}
                  {p.is_split && <span className="text-gray-500 text-xs ml-1">(split {p.split_count} ways)</span>}
                </td>
                <td className="px-4 py-2 text-white text-right font-mono">${Number(p.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pool breakdown */}
      {grossPool != null && (
        <div className="border border-gray-700 rounded-lg p-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-400">Gross Pool</span><span className="text-white">${Number(grossPool).toFixed(2)}</span></div>
          {adminFee > 0 && <div className="flex justify-between"><span className="text-gray-400">Admin Fee</span><span className="text-red-400">-${Number(adminFee).toFixed(2)}</span></div>}
          <div className="flex justify-between border-t border-gray-700 pt-1 mt-1"><span className="text-gray-400 font-medium">Net Payout</span><span className="text-white font-medium">${Number(netPool).toFixed(2)}</span></div>
        </div>
      )}

      {/* Payment handles */}
      {(venmo || paypal || zelle) && (
        <div className="border border-gray-700 rounded-lg p-4 space-y-2">
          <div className="text-sm text-gray-400 uppercase tracking-wide mb-1">Pay via</div>
          {venmo && <div className="text-sm"><span className="text-gray-500">Venmo:</span> <span className="text-white">{venmo}</span></div>}
          {paypal && <div className="text-sm"><span className="text-gray-500">PayPal:</span> <span className="text-white">{paypal}</span></div>}
          {zelle && <div className="text-sm"><span className="text-gray-500">Zelle:</span> <span className="text-white">{zelle}</span></div>}
        </div>
      )}
    </div>
  );
}
