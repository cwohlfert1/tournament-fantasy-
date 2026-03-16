import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import Disclaimer from '../components/Disclaimer';
import { useDocTitle } from '../hooks/useDocTitle';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

// ── Pill selector ─────────────────────────────────────────────────────────────

function PillSelector({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
            value === opt.value
              ? 'bg-brand-500/20 border-brand-500/60 text-brand-400 shadow-sm shadow-brand-500/20'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ icon, title, children }) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-gray-800">
        <span className="text-xl">{icon}</span>
        <h2 className="text-white font-bold text-base">{title}</h2>
      </div>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

// ── Progress steps ────────────────────────────────────────────────────────────

const STEPS = ['Setup', 'Buy-in', 'Draft Settings', 'Review'];

function ProgressSteps({ current }) {
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => (
        <div key={step} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${
              i < current
                ? 'bg-brand-500 border-brand-500 text-white'
                : i === current
                ? 'bg-brand-500/15 border-brand-500 text-brand-400'
                : 'bg-gray-800/80 border-gray-700 text-gray-600'
            }`}>
              {i < current ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
              i === current ? 'text-brand-400' : i < current ? 'text-gray-400' : 'text-gray-600'
            }`}>{step}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`h-0.5 w-10 sm:w-16 mx-1 mb-4 rounded transition-all ${
              i < current ? 'bg-brand-500' : 'bg-gray-800'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CreateLeague() {
  useDocTitle('Create League | TourneyRun');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    name: '',
    team_name: '',
    max_teams: 10,
    total_rounds: 10,
    pick_time_limit: 60,
    auto_start_on_full: false,
    draft_start_time: '',
    buy_in_amount: '',
    payment_instructions: '',
    payout_first: 70,
    payout_second: 20,
    payout_third: 10,
    payout_bonus: '',
    // Pre-select Smart Draft if user came from the landing page CTA or standalone checkout
    smartDraft: searchParams.get('smartdraft') === '1',
  });
  const [sdOpen, setSdOpen] = useState(false); // "how it works" expanded
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const buyIn     = parseFloat(form.buy_in_amount) || 0;
  const prizePool = buyIn * form.max_teams;
  const bonus     = parseFloat(form.payout_bonus) || 0;
  const mainPool  = Math.max(0, prizePool - bonus);
  const p1        = parseInt(form.payout_first)  || 0;
  const p2        = parseInt(form.payout_second) || 0;
  const p3        = parseInt(form.payout_third)  || 0;
  const payoutSum = p1 + p2 + p3;
  const payoutError = payoutSum > 100
    ? `Payouts sum to ${payoutSum}% — must be ≤ 100%`
    : '';

  const minDateTime = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16);

  // Derive current progress step
  const currentStep = (() => {
    if (!form.name || !form.team_name) return 0;
    if (!form.buy_in_amount)           return 1;
    if (!form.max_teams)               return 2;
    return 3;
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (payoutError) return;
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        auto_start_on_full: form.auto_start_on_full ? 1 : 0,
        draft_start_time: form.draft_start_time
          ? new Date(form.draft_start_time).toISOString()
          : null,
        buy_in_amount: buyIn,
        payout_bonus: parseFloat(form.payout_bonus) || 0,
      };
      const res = await api.post('/leagues', payload);
      const leagueId = res.data.league.id;
      const checkoutRes = await api.post('/payments/entry-checkout', { leagueId, includeSmartDraft: form.smartDraft });
      window.location.href = checkoutRes.data.url;
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create league');
      setLoading(false);
    }
  };

  // Shared submit button label
  const totalDue = form.smartDraft ? '$7.99' : '$5';
  const submitLabel = loading ? 'Creating league...' : `Create League & Pay ${totalDue} Entry Fee →`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">

      {/* ── Page header ── */}
      <div className="mb-8">
        <div className="relative inline-block mb-1">
          <h1 className="text-3xl sm:text-4xl font-black text-white relative z-10">
            Create Your League
          </h1>
          <div className="absolute -inset-3 bg-brand-500/10 blur-2xl rounded-full pointer-events-none" />
        </div>
        <p className="text-gray-400 mt-1">Set it up once. Draft day handles itself.</p>
        <div className="mt-5">
          <ProgressSteps current={currentStep} />
        </div>
      </div>

      {searchParams.get('smartdraft') === '1' && (
        <div className="flex items-center gap-2.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-xl px-4 py-3 text-sm mb-5">
          <span className="text-xl shrink-0">⚡</span>
          <div>
            <span className="font-bold">Smart Draft credit applied!</span>
            <span className="text-yellow-400/80 ml-1.5">Your $2.99 upgrade is included — just finish setting up your league.</span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 space-y-5 lg:space-y-0">

          {/* ── Left: form cards ── */}
          <div className="space-y-5">

            {/* League Basics */}
            <SectionCard icon="🏆" title="League Basics">
              <div>
                <label className="label">League Name *</label>
                <input
                  type="text"
                  className="input text-base"
                  placeholder="March Madness 2026"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">
                  <span className="mr-1.5">👤</span>Your Team Name *
                </label>
                <input
                  type="text"
                  className="input text-base"
                  placeholder="The Underdogs"
                  value={form.team_name}
                  onChange={e => set('team_name', e.target.value)}
                  required
                />
              </div>
            </SectionCard>

            {/* Draft Settings */}
            <SectionCard icon="⚙️" title="Draft Settings">
              <div>
                <label className="label mb-2.5">Max Teams</label>
                <PillSelector
                  options={[4,6,8,10,12,14,16,18,20].map(n => ({ value: n, label: String(n) }))}
                  value={form.max_teams}
                  onChange={v => set('max_teams', v)}
                />
                <p className="text-gray-600 text-xs mt-2">Sweet spot is 6–10 for competitive drafts.</p>
              </div>
              <div>
                <label className="label mb-2.5">Draft Rounds</label>
                <PillSelector
                  options={[5,6,7,8,9,10,12,15].map(n => ({ value: n, label: String(n) }))}
                  value={form.total_rounds}
                  onChange={v => set('total_rounds', v)}
                />
                <p className="text-gray-600 text-xs mt-2">More rounds = deeper rosters and more Cinderella upside.</p>
              </div>
              <div>
                <label className="label mb-2.5">Pick Timer</label>
                <PillSelector
                  options={[
                    { value: 30,  label: '30s'  },
                    { value: 60,  label: '60s'  },
                    { value: 90,  label: '90s'  },
                    { value: 120, label: '2min' },
                  ]}
                  value={form.pick_time_limit}
                  onChange={v => set('pick_time_limit', v)}
                />
              </div>
            </SectionCard>

            {/* Buy-in & Prize Pool */}
            <SectionCard icon="💰" title="Buy-in &amp; Prize Pool">

              {/* Info banner */}
              <div className="flex items-start gap-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg px-3.5 py-2.5 -mt-1">
                <span className="text-blue-400 text-base mt-0.5 shrink-0">ℹ️</span>
                <p className="text-gray-400 text-xs leading-relaxed">
                  Payment tracking is informational only. Collect buy-ins via Venmo, Zelle, or however your group agrees — TourneyRun doesn't handle the money.
                </p>
              </div>

              {/* Buy-in amount */}
              <div>
                <label className="label">Buy-in Amount per Team</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input pl-8 text-lg font-semibold"
                    placeholder="0"
                    value={form.buy_in_amount}
                    onChange={e => set('buy_in_amount', e.target.value)}
                  />
                </div>
                {buyIn > 0 && (
                  <p className="text-brand-400 text-xs mt-1.5 font-medium">
                    Prize pool: <span className="font-black text-sm">{fmt(prizePool)}</span>
                    <span className="text-gray-500 ml-1">({form.max_teams} teams × {fmt(buyIn)})</span>
                  </p>
                )}
              </div>

              {/* Payment instructions */}
              <div>
                <label className="label">
                  Payment Instructions <span className="text-gray-600 font-normal">(optional)</span>
                </label>
                <textarea
                  className="input resize-none"
                  rows={2}
                  placeholder='e.g. "Venmo @collinw before draft day"'
                  value={form.payment_instructions}
                  onChange={e => set('payment_instructions', e.target.value)}
                  maxLength={200}
                />
              </div>

              {/* Payout breakdown */}
              <div>
                <div className="label mb-3">Payout Breakdown</div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: '🥇 1st', key: 'payout_first'  },
                    { label: '🥈 2nd', key: 'payout_second' },
                    { label: '🥉 3rd', key: 'payout_third'  },
                  ].map(({ label, key }) => (
                    <div key={key} className="bg-gray-800/50 border border-gray-700/60 rounded-xl p-3">
                      <div className="text-xs text-gray-400 font-semibold mb-2">{label}</div>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="input pr-6 text-right font-bold py-1.5"
                          value={form[key]}
                          onChange={e => set(key, e.target.value)}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                      </div>
                      {buyIn > 0 && (
                        <div className="text-brand-400 text-xs mt-1.5 text-right font-bold">
                          {fmt(mainPool * (parseInt(form[key]) || 0) / 100)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {payoutError ? (
                  <p className="text-red-400 text-xs mt-2">{payoutError}</p>
                ) : payoutSum < 100 ? (
                  <p className="text-gray-600 text-xs mt-1.5">
                    Remaining {100 - payoutSum}% is yours to allocate however your league decides.
                  </p>
                ) : (
                  <p className="text-green-500 text-xs mt-1.5">✓ Payouts add up to 100%</p>
                )}
              </div>

              {/* Single game bonus */}
              <div>
                <label className="label">
                  🎯 Single Game Bonus <span className="text-gray-600 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="input pl-8"
                    placeholder="e.g. 20"
                    value={form.payout_bonus}
                    onChange={e => set('payout_bonus', e.target.value)}
                  />
                </div>
                <p className="text-gray-600 text-xs mt-1">
                  Bonus paid to whoever has the best single-game performance (your call).
                </p>
              </div>
            </SectionCard>

            {/* Draft Start */}
            <SectionCard icon="⚡" title="Draft Start">
              <div className="grid sm:grid-cols-2 gap-3">

                {/* Auto-start option */}
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, auto_start_on_full: true, draft_start_time: '' }))}
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                    form.auto_start_on_full
                      ? 'border-brand-500/60 bg-brand-500/8'
                      : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚡</span>
                    <span className={`font-bold text-sm ${form.auto_start_on_full ? 'text-brand-400' : 'text-white'}`}>
                      Auto-start when full
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs leading-relaxed">
                    Draft begins automatically as soon as all teams have joined.
                  </p>
                  {form.auto_start_on_full && (
                    <span className="text-[10px] bg-brand-500/20 text-brand-400 border border-brand-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                      Selected
                    </span>
                  )}
                </button>

                {/* Schedule option */}
                <button
                  type="button"
                  onClick={() => set('auto_start_on_full', false)}
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                    !form.auto_start_on_full
                      ? 'border-brand-500/60 bg-brand-500/8'
                      : 'border-gray-700 bg-gray-800/40 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📅</span>
                    <span className={`font-bold text-sm ${!form.auto_start_on_full ? 'text-brand-400' : 'text-white'}`}>
                      Schedule a time
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs leading-relaxed">
                    Set a specific date and time for the draft to start.
                  </p>
                  {!form.auto_start_on_full && (
                    <span className="text-[10px] bg-brand-500/20 text-brand-400 border border-brand-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                      Selected
                    </span>
                  )}
                </button>
              </div>

              {!form.auto_start_on_full && (
                <div>
                  <label className="label">
                    Draft Date &amp; Time <span className="text-gray-600 font-normal">(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="input"
                    value={form.draft_start_time}
                    min={minDateTime}
                    onChange={e => set('draft_start_time', e.target.value)}
                  />
                  <p className="text-gray-600 text-xs mt-1">
                    Leave blank for manual start by commissioner.
                  </p>
                </div>
              )}
            </SectionCard>

            {/* Smart Draft Upgrade */}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-yellow-400 text-base">⚡</span>
                    <h3 className="text-white font-bold text-sm">Smart Draft</h3>
                    <span className="text-[10px] bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">$2.99</span>
                    {form.smartDraft && (
                      <span className="text-[10px] bg-brand-500/20 text-brand-400 border border-brand-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Active</span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    If you miss your pick timer, our algorithm drafts for you — skips injuries, balances your roster, targets high-upside players.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSdOpen(o => !o)}
                    className="text-brand-400 text-xs mt-1.5 hover:text-brand-300 transition-colors"
                  >
                    {sdOpen ? 'Show less ▲' : 'How it works ▼'}
                  </button>
                  {sdOpen && (
                    <div className="mt-2.5 space-y-1.5">
                      {[
                        ['🚫', 'Automatically skips injured players'],
                        ['⚖️', 'Balances your roster by team and region'],
                        ['🎯', 'Targets highest-upside available players'],
                        ['🏀', 'Boosts guards if your roster is lacking'],
                      ].map(([icon, text]) => (
                        <div key={text} className="flex items-center gap-2 text-xs text-gray-400">
                          <span>{icon}</span><span>{text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => set('smartDraft', !form.smartDraft)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${form.smartDraft ? 'bg-brand-500' : 'bg-gray-700 hover:bg-gray-600'}`}
                  aria-label="Toggle Smart Draft"
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${form.smartDraft ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>

            {/* Mobile-only submit */}
            <div className="lg:hidden pb-2">
              <button
                type="submit"
                disabled={loading || !!payoutError}
                className="btn-primary w-full py-4 text-base font-black disabled:opacity-50"
              >
                {submitLabel}
              </button>
              <Disclaimer className="text-center mt-3" />
            </div>
          </div>

          {/* ── Right: sticky summary ── */}
          <div className="hidden lg:block">
            <div className="sticky top-24 space-y-3">
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
                  <span>📋</span>
                  <h3 className="text-white font-bold text-sm">League Summary</h3>
                </div>

                <div className="space-y-2.5 text-sm">
                  <Row label="League">
                    {form.name
                      ? <span className="text-white font-semibold truncate max-w-[160px] block text-right">{form.name}</span>
                      : <span className="text-gray-700 italic font-normal">Not set</span>}
                  </Row>
                  <Row label="Your team">
                    {form.team_name
                      ? <span className="text-white font-semibold truncate max-w-[160px] block text-right">{form.team_name}</span>
                      : <span className="text-gray-700 italic font-normal">Not set</span>}
                  </Row>

                  <div className="border-t border-gray-800 pt-2.5 space-y-2">
                    <Row label="Teams"><span className="text-white font-semibold">{form.max_teams}</span></Row>
                    <Row label="Rounds"><span className="text-white font-semibold">{form.total_rounds}</span></Row>
                    <Row label="Total picks"><span className="text-white font-semibold">{form.total_rounds * form.max_teams}</span></Row>
                    <Row label="Pick timer">
                      <span className="text-white font-semibold">
                        {form.pick_time_limit < 60 ? `${form.pick_time_limit}s` : `${form.pick_time_limit / 60}min`}
                      </span>
                    </Row>
                  </div>

                  {buyIn > 0 && (
                    <div className="border-t border-gray-800 pt-2.5 space-y-2">
                      <Row label="Buy-in">
                        <span className="text-white font-semibold">{fmt(buyIn)}/mgr</span>
                      </Row>
                      <Row label="Prize pool">
                        <span className="text-brand-400 font-black text-base">{fmt(mainPool)}</span>
                      </Row>
                      {p1 > 0 && (
                        <Row label={`🥇 1st (${p1}%)`}>
                          <span className="text-white text-xs">{fmt(mainPool * p1 / 100)}</span>
                        </Row>
                      )}
                      {p2 > 0 && (
                        <Row label={`🥈 2nd (${p2}%)`}>
                          <span className="text-white text-xs">{fmt(mainPool * p2 / 100)}</span>
                        </Row>
                      )}
                      {p3 > 0 && (
                        <Row label={`🥉 3rd (${p3}%)`}>
                          <span className="text-white text-xs">{fmt(mainPool * p3 / 100)}</span>
                        </Row>
                      )}
                      {bonus > 0 && (
                        <Row label="🎯 Bonus">
                          <span className="text-white text-xs">{fmt(bonus)}</span>
                        </Row>
                      )}
                    </div>
                  )}

                  <div className="border-t border-gray-800 pt-2.5">
                    {form.auto_start_on_full ? (
                      <div className="flex items-center gap-1.5 text-brand-400 text-xs">
                        <span>⚡</span> Auto-starts when full
                      </div>
                    ) : form.draft_start_time ? (
                      <div className="flex items-start gap-1.5 text-brand-400 text-xs">
                        <span className="shrink-0">📅</span>
                        <span>{new Date(form.draft_start_time).toLocaleString()}</span>
                      </div>
                    ) : (
                      <div className="text-gray-600 text-xs">Manual start by commissioner</div>
                    )}
                  </div>

                  <div className="border-t border-gray-800 pt-2.5 space-y-2">
                    <Row label="TourneyRun fee">
                      <span className="text-white font-semibold">$5.00</span>
                    </Row>
                    {form.smartDraft && (
                      <Row label="⚡ Smart Draft">
                        <span className="text-yellow-400 font-semibold">$2.99</span>
                      </Row>
                    )}
                    {form.smartDraft && (
                      <div className="border-t border-gray-700 pt-2">
                        <Row label="Total due today">
                          <span className="text-white font-black text-base">$7.99</span>
                        </Row>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !!payoutError}
                className="btn-primary w-full py-3 font-bold disabled:opacity-50"
              >
                {submitLabel}
              </button>
              <Disclaimer className="text-center" />
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}

// ── Tiny helper row ───────────────────────────────────────────────────────────

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500 shrink-0 text-xs">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
