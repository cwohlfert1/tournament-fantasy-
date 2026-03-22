import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Flag, DollarSign, Trophy, Settings, Check, Zap } from 'lucide-react';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';

// ── Format definitions ────────────────────────────────────────────────────────

const FORMATS = [
  {
    key: 'pool',
    Icon: Flag,
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
    title: 'Pool',
    badge: 'Casual',
    badgeColor: 'bg-gray-700/60 text-gray-400 border-gray-600',
    description: 'Pick golfers each tournament. Scores combine. Best for office pools of any size.',
    activeBorder: 'border-green-500/50',
    activeBg: 'bg-green-500/5',
  },
  {
    key: 'dk',
    Icon: DollarSign,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    title: 'Daily Fantasy',
    badge: 'DFS',
    badgeColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    description: 'Salary cap resets every tournament. Pick from scratch each week. No season commitment.',
    activeBorder: 'border-blue-500/50',
    activeBg: 'bg-blue-500/5',
  },
  {
    key: 'tourneyrun',
    Icon: Trophy,
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
    title: 'TourneyRun',
    badge: 'Signature',
    badgeColor: 'bg-green-500/15 text-green-400 border-green-500/30',
    description: 'Draft core players locked all season. Fill flex spots via waiver wire. Majors score 1.5×.',
    activeBorder: 'border-green-500/50',
    activeBg: 'bg-green-500/5',
    recommended: true,
  },
];

// ── Scoring Style options for Pool ───────────────────────────────────────────

const SCORING_STYLES = [
  {
    value: 'stroke_play',
    icon: '🏌️',
    title: 'Classic Stroke Play',
    subtitle: 'Raw total strokes across all picked golfers — lowest score wins',
    description: 'Total strokes, no adjustments',
    recommended: false,
    isNew: false,
  },
  {
    value: 'total_score',
    icon: '⛳',
    title: 'Total Score',
    subtitle: 'Combined strokes vs par across all picked golfers',
    description: 'Classic golf — lowest combined score wins',
    recommended: false,
    isNew: false,
  },
  {
    value: 'tourneyrun',
    icon: '⚡',
    title: 'TourneyRun Style',
    subtitle: 'Eagle +8 · Birdie +3 · Par +0.5 · Bogey −0.5 · Double+ −2',
    description: 'Points per shot, every hole matters',
    recommended: false,
    isNew: true,
  },
];

// ── Shared UI components ──────────────────────────────────────────────────────

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
              ? 'bg-green-500/20 border-green-500/60 text-green-400'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Card({ children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6">
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-gray-800">
      <Icon className="w-5 h-5 text-gray-400 shrink-0" />
      <h2 className="text-white font-bold">{title}</h2>
    </div>
  );
}

// ── Pool tier selector ────────────────────────────────────────────────────────

const POOL_TIERS = [
  { tier: 'standard',   maxTeams: 20,  label: '20 teams',      price: 9.99,  priceLabel: '$9.99/tournament'  },
  { tier: 'standard',   maxTeams: 40,  label: '40 teams',      price: 14.99, priceLabel: '$14.99/tournament' },
  { tier: 'standard',   maxTeams: 60,  label: '60 teams',      price: 14.99, priceLabel: '$14.99/tournament' },
  { tier: 'large_100',  maxTeams: 100, label: '100 teams',     price: 24.99, priceLabel: '$24.99/tournament' },
  { tier: 'enterprise', maxTeams: 999, label: 'Enterprise 100+', price: 34.99, priceLabel: '$34.99/tournament' },
];

function PoolTierSelector({ maxTeams, poolTier, onChange }) {
  const sel = POOL_TIERS.find(t => t.maxTeams === maxTeams && t.tier === poolTier) || POOL_TIERS[0];

  function TierBtn({ t }) {
    const isSelected = t === sel;
    return (
      <button
        type="button"
        onClick={() => onChange(t.maxTeams, t.tier, t.price)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '14px 10px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
          border: isSelected ? '2px solid #00e87a' : '2px solid rgba(255,255,255,0.08)',
          background: isSelected ? 'rgba(0,232,122,0.06)' : 'rgba(255,255,255,0.02)',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
      >
        <span style={{ fontSize: 15, fontWeight: 800, color: isSelected ? '#fff' : '#9ca3af', lineHeight: 1.2 }}>
          {t.label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? '#4ade80' : '#4b5563', marginTop: 4 }}>
          {t.priceLabel}
        </span>
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {POOL_TIERS.slice(0, 3).map(t => <TierBtn key={t.maxTeams} t={t} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        {POOL_TIERS.slice(3).map(t => <TierBtn key={t.maxTeams} t={t} />)}
      </div>
    </div>
  );
}

// ── Scoring Style cards for Pool ─────────────────────────────────────────────

function ScoringStyleSelector({ value, onChange }) {
  return (
    <div className="space-y-2.5">
      {SCORING_STYLES.map(s => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          className={`w-full text-left rounded-xl border-2 p-4 transition-all relative ${
            value === s.value
              ? 'border-green-500/60 bg-green-500/8'
              : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
          }`}
        >
          {/* Selected indicator */}
          {value === s.value && (
            <div className="absolute top-3.5 right-3.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}

          <div className="flex items-start gap-3 pr-6">
            <span className="text-xl leading-none mt-0.5 shrink-0">{s.icon}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className={`font-bold text-sm ${value === s.value ? 'text-white' : 'text-gray-300'}`}>
                  {s.title}
                </span>
                {s.isNew && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-400">
                    NEW
                  </span>
                )}
              </div>
              <p className="text-gray-500 text-xs mb-1 leading-relaxed">{s.subtitle}</p>
              <p className={`text-xs font-medium ${value === s.value ? 'text-green-400/80' : 'text-gray-600'}`}>
                {s.description}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Pick sheet format selector ────────────────────────────────────────────────

const PICK_SHEET_FORMATS = [
  {
    value: 'tiered',
    icon: '🏆',
    title: 'Tiered Draft',
    description: 'Players grouped into tiers by betting odds. Members pick a set number from each tier. Classic office pool format.',
    example: 'e.g. Tier 1 (favorites) pick 2 · Tier 2 pick 3 · Tier 3 pick 2',
    recommended: true,
  },
  {
    value: 'salary_cap',
    icon: '💰',
    title: 'Salary Cap',
    description: 'Each player assigned a price based on odds and recent performance. Members build a roster under the cap. Similar to DraftKings.',
    example: 'e.g. $50,000 cap · Top players cost more',
    recommended: false,
  },
];

function PickSheetFormatSelector({ value, onChange }) {
  return (
    <div className="space-y-2.5">
      {PICK_SHEET_FORMATS.map(f => {
        const selected = value === f.value;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            className={`w-full text-left rounded-xl border-2 p-4 transition-all relative ${
              selected ? 'border-green-500/60 bg-green-500/8' : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
            }`}
          >
            {selected && (
              <div className="absolute top-3.5 right-3.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
            <div className="flex items-start gap-3 pr-7">
              <span className="text-xl leading-none mt-0.5 shrink-0">{f.icon}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`font-bold text-sm ${selected ? 'text-white' : 'text-gray-300'}`}>{f.title}</span>
                  {f.recommended && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-500/20 border border-green-500/30 text-green-400">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-xs leading-relaxed mb-1">{f.description}</p>
                <p className={`text-[11px] font-medium ${selected ? 'text-green-400/70' : 'text-gray-600'}`}>{f.example}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Tier config editor ────────────────────────────────────────────────────────

function TierConfigEditor({ tiers, onChange }) {
  const totalPicks = tiers.reduce((s, t) => s + (parseInt(t.picks) || 0), 0);

  function updateTier(i, field, val) {
    onChange(tiers.map((t, j) => j === i ? { ...t, [field]: val } : t));
  }

  function addTier() {
    onChange([...tiers, { tier: tiers.length + 1, odds_min: '', odds_max: '', picks: 1, approxPlayers: null }]);
  }

  function removeTier(i) {
    onChange(tiers.filter((_, j) => j !== i).map((t, j) => ({ ...t, tier: j + 1 })));
  }

  return (
    <div>
      <div className="space-y-2">
        {tiers.map((t, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 bg-gray-800/40 rounded-xl px-3 py-2.5">
              <span className="text-gray-500 text-xs font-bold w-10 shrink-0">T{t.tier}</span>
              <input
                type="text"
                className="input py-1 text-xs w-20 shrink-0"
                placeholder="8:1"
                value={t.odds_min}
                onChange={e => updateTier(i, 'odds_min', e.target.value)}
              />
              <span className="text-gray-600 text-xs shrink-0">–</span>
              <input
                type="text"
                className="input py-1 text-xs w-24 shrink-0"
                placeholder="250:1+"
                value={t.odds_max}
                onChange={e => updateTier(i, 'odds_max', e.target.value)}
              />
              {t.approxPlayers != null ? (
                <span className="text-gray-600 text-xs shrink-0 hidden sm:inline">~{t.approxPlayers} players</span>
              ) : (
                <span className="text-gray-600 text-xs shrink-0 hidden sm:inline">Rest of field</span>
              )}
              <span className="text-gray-500 text-xs shrink-0 ml-auto">Picks</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => updateTier(i, 'picks', Math.max(1, (parseInt(t.picks) || 1) - 1))}
                  className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-bold flex items-center justify-center transition-colors"
                >−</button>
                <span className="w-6 text-center text-sm font-bold text-white">{t.picks}</span>
                <button
                  type="button"
                  onClick={() => updateTier(i, 'picks', Math.min(10, (parseInt(t.picks) || 1) + 1))}
                  className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-bold flex items-center justify-center transition-colors"
                >+</button>
              </div>
              {tiers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTier(i)}
                  className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-red-400 text-lg leading-none transition-colors shrink-0"
                >×</button>
              )}
            </div>
            {i === 0 && (
              <p className="text-gray-600 text-xs mt-1 ml-3 italic">
                Elite tier — Scheffler, McIlroy and similar favorites land here automatically
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3">
        <button
          type="button"
          onClick={addTier}
          className="text-sm font-semibold text-gray-500 hover:text-green-400 transition-colors"
        >
          + Add Tier
        </button>
        <span className="text-gray-500 text-xs">Total picks per team: <span className="text-white font-bold">{totalPicks}</span></span>
      </div>
      <p className="text-gray-600 text-xs mt-3 leading-relaxed">
        Tiers are auto-assigned by betting odds when the tournament field is loaded. You can adjust any tier before launch.
      </p>
    </div>
  );
}

// ── Salary cap config (pool) ──────────────────────────────────────────────────

function SalaryCapConfig({ cap, capUnit, onCapChange, onUnitChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="label mb-1.5">Total Cap per Team</label>
        <div className="relative w-40">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
          <input
            type="number"
            min="1000"
            step="1000"
            className="input pl-8 text-sm"
            value={cap}
            onChange={e => onCapChange(parseInt(e.target.value) || 50000)}
          />
        </div>
        <p className="text-gray-600 text-xs mt-1.5">Each team must stay under this amount.</p>
      </div>
      <div>
        <label className="label mb-2.5">Cap Unit</label>
        <PillSelector
          options={[
            { value: 1000,  label: '$1,000s'  },
            { value: 10000, label: '$10,000s' },
            { value: 50000, label: '$50,000s' },
          ]}
          value={capUnit}
          onChange={onUnitChange}
        />
        <p className="text-gray-600 text-xs mt-1.5">Sets the scale for individual player prices.</p>
      </div>
      <div className="flex items-start gap-2 bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3">
        <p className="text-blue-300/80 text-xs leading-relaxed">
          Player salaries are auto-generated from betting odds, world ranking, and recent finishes. You can adjust individual salaries after the league is created in Commissioner Settings.
        </p>
      </div>
    </div>
  );
}

// ── Ordinal helper ────────────────────────────────────────────────────────────
function ordinal(n) {
  if (n === 1) return '1st Place';
  if (n === 2) return '2nd Place';
  if (n === 3) return '3rd Place';
  return `${n}th Place`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

const DEFAULT_FORM = {
  name: '',
  team_name: '',
  max_teams: 8,
  buy_in_amount: '',
  payment_instructions: '',
  payment_methods: [],
  payout_places: [
    { place: 1, pct: 70 },
    { place: 2, pct: 20 },
    { place: 3, pct: 10 },
  ],
  // Pool
  pool_tournament_id: '',
  picks_per_team: 8,
  scoring_style: 'stroke_play',
  pool_tier: 'standard',
  comm_pro_price: 19.99,
  pick_sheet_format: 'tiered',
  pool_tiers: [
    { tier: 1, odds_min: '1:1',   odds_max: '12:1',   picks: 1, approxPlayers: 3  },
    { tier: 2, odds_min: '14:1',  odds_max: '25:1',   picks: 1, approxPlayers: 5  },
    { tier: 3, odds_min: '28:1',  odds_max: '50:1',   picks: 1, approxPlayers: 10 },
    { tier: 4, odds_min: '55:1',  odds_max: '100:1',  picks: 1, approxPlayers: 17 },
    { tier: 5, odds_min: '110:1', odds_max: '200:1',  picks: 1, approxPlayers: 25 },
    { tier: 6, odds_min: '250:1', odds_max: '',        picks: 1, approxPlayers: null },
  ],
  pool_salary_cap: 50000,
  pool_cap_unit: 50000,
  // DK
  weekly_salary_cap: 50000,
  starters_count: 6,
  // TourneyRun
  salary_cap: 2400,
  core_spots: 4,
  flex_spots: 4,
  faab_budget: 500,
  use_faab: true,
  draft_type: 'auction',
  auction_budget: 1000,
  faab_weekly_budget: 100,
  bid_timer_seconds: 30,
};

export default function CreateGolfLeague() {
  useDocTitle('Create a Golf Pool | TourneyRun');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialFormat = (() => {
    const f = searchParams.get('format');
    return ['pool', 'dk', 'tourneyrun'].includes(f) ? f : 'tourneyrun';
  })();

  const [format, setFormat] = useState(initialFormat);
  const [form, setForm] = useState(() => ({
    ...DEFAULT_FORM,
    ...(initialFormat === 'pool' ? { max_teams: 20, pool_tier: 'standard', comm_pro_price: 19.99 } : {}),
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tournaments, setTournaments] = useState([]);
  const [promoCode, setPromoCode] = useState(searchParams.get('promo') || '');
  const [promoStatus, setPromoStatus] = useState(null); // null | { valid, label, discountType, discountValue } | { error }
  const [promoChecking, setPromoChecking] = useState(false);

  useEffect(() => {
    api.get('/golf/tournaments').then(res => {
      const upcoming = (res.data.tournaments || []).filter(t => t.status !== 'completed');
      setTournaments(upcoming);
    }).catch(() => {});
  }, []);

  // Auto-validate promo code if pre-filled from URL param
  useEffect(() => {
    if (promoCode && format === 'pool') validatePromo(promoCode);
  }, []); // eslint-disable-line

  async function validatePromo(code) {
    if (!code.trim()) { setPromoStatus(null); return; }
    setPromoChecking(true);
    try {
      const res = await api.post('/golf/payments/validate-promo', { code: code.trim() });
      setPromoStatus({ valid: true, ...res.data });
    } catch (err) {
      setPromoStatus({ valid: false, error: err.response?.data?.error || 'Invalid code' });
    } finally {
      setPromoChecking(false);
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleFormatChange(f) {
    setFormat(f);
    setForm(prev => ({
      ...prev,
      max_teams: f === 'pool' ? 20 : 8,
      ...(f === 'pool' ? { pool_tier: 'standard', comm_pro_price: 19.99 } : {}),
    }));
  }

  const payoutTotal = form.payout_places.reduce((s, r) => s + (parseInt(r.pct) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (format === 'pool' && !form.pool_tournament_id) {
      setError('Please select a tournament for this pool.');
      return;
    }
    const hasBuyIn = parseFloat(form.buy_in_amount) > 0;
    if (hasBuyIn && payoutTotal !== 100) {
      setError('Payout percentages must add up to 100%');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        format_type: format,
        buy_in_amount: parseFloat(form.buy_in_amount) || 0,
        use_faab: form.use_faab ? 1 : 0,
        // backward-compat scalar fields derived from payout_places
        payout_first:  parseInt(form.payout_places[0]?.pct) || 0,
        payout_second: parseInt(form.payout_places[1]?.pct) || 0,
        payout_third:  parseInt(form.payout_places[2]?.pct) || 0,
        // JSON fields
        payout_places:    JSON.stringify(form.payout_places),
        payment_methods:  JSON.stringify(form.payment_methods),
        pool_tiers:       JSON.stringify(form.pool_tiers),
      };
      const createRes = await api.post('/golf/leagues', payload);
      const league = createRes.data.league;

      // Trigger payment gate — league is created with pending_payment status
      const payRes = await api.post('/golf/payments/create-checkout-session', {
        type: 'comm_pro',
        leagueId: league.id,
        ...(promoStatus?.valid && promoCode ? { promoCode: promoCode.trim() } : {}),
      });

      if (payRes.data.free || payRes.data.alreadyPaid) {
        navigate(`/golf/league/${league.id}`);
      } else {
        // Redirect to Square hosted checkout
        window.location.href = payRes.data.url;
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create league');
      setLoading(false);
    }
  };

  const selectedFmt = FORMATS.find(f => f.key === format);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-10">

      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-white">Create Golf League</h1>
        <p className="text-gray-400 mt-1 text-sm sm:text-base">Set up your PGA Tour fantasy league for the 2026 season.</p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm mb-6">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">

        {/* ── 1. Format ── */}
        <Card>
          <CardHeader icon={Trophy} title="Choose Your Format" />
          <div className="grid md:grid-cols-3 gap-3">
            {FORMATS.map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => handleFormatChange(f.key)}
                className={`relative text-left rounded-2xl border-2 p-4 transition-all ${
                  format === f.key
                    ? `${f.activeBorder} ${f.activeBg}`
                    : 'border-gray-700 bg-gray-800/20 hover:border-gray-600'
                }`}
              >
                {format === f.key && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.iconBg}`}>
                  <f.Icon className={`w-5 h-5 ${f.iconColor}`} />
                </div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap pr-6">
                  <span className={`font-black text-sm sm:text-base ${format === f.key ? 'text-white' : 'text-gray-300'}`}>
                    {f.title}
                  </span>
                  <span className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${f.badgeColor}`}>
                    {f.badge}
                  </span>
                  {f.recommended && (
                    <span className="inline-block bg-green-500/20 border border-green-500/30 text-green-400 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-xs leading-relaxed">{f.description}</p>
              </button>
            ))}
          </div>
        </Card>

        {/* ── 2. League Basics ── */}
        <Card>
          <CardHeader icon={Flag} title="League Basics" />
          <div className="space-y-4">
            <div>
              <label className="label">League Name *</label>
              <input
                type="text"
                className="input text-base"
                placeholder={format === 'dk' ? 'DFS Golf 2026' : format === 'pool' ? 'Golf Pool 2026' : 'Golf Degens 2026'}
                value={form.name}
                onChange={e => set('name', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Your Team Name *</label>
              <input
                type="text"
                className="input text-base"
                placeholder="The Bogey Boys"
                value={form.team_name}
                onChange={e => set('team_name', e.target.value)}
                required
              />
            </div>
          </div>
        </Card>

        {/* ── 3. League Settings — POOL ── */}
        {format === 'pool' && (
          <div className="animate-format">
          <Card>
            <CardHeader icon={Settings} title="⚙️ Pool Settings" />
            <div className="space-y-6">

              {/* Tournament Picker */}
              <div>
                <label className="label mb-1.5">Which tournament is this pool for? *</label>
                <select
                  className="input text-sm"
                  value={form.pool_tournament_id}
                  onChange={e => set('pool_tournament_id', e.target.value)}
                  required
                >
                  <option value="">— Select a tournament —</option>
                  {tournaments.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.start_date ? ` · ${new Date(t.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}{t.is_major ? ' (Major)' : ''}
                    </option>
                  ))}
                </select>
                {tournaments.length === 0 && (
                  <p className="text-gray-600 text-xs mt-1.5">Loading tournaments…</p>
                )}
              </div>

              {/* Max Teams */}
              <div>
                <label className="label mb-2.5">Max Teams</label>
                <PoolTierSelector
                  maxTeams={form.max_teams}
                  poolTier={form.pool_tier}
                  onChange={(maxTeams, poolTier, commProPrice) => setForm(f => ({ ...f, max_teams: maxTeams, pool_tier: poolTier, comm_pro_price: commProPrice }))}
                />
              </div>

              {/* Picks Per Tournament */}
              <div>
                <label className="label mb-2.5">Picks Per Tournament</label>
                <PillSelector
                  options={[6, 8, 10].map(n => ({ value: n, label: String(n) }))}
                  value={form.picks_per_team}
                  onChange={v => set('picks_per_team', v)}
                />
                <p className="text-gray-600 text-xs mt-2">Each manager picks this many golfers per tournament.</p>
              </div>

              {/* Scoring Style */}
              <div>
                <label className="label mb-3">Scoring Style</label>
                <ScoringStyleSelector value={form.scoring_style} onChange={v => set('scoring_style', v)} />
              </div>

              {/* Pick Sheet Format */}
              <div>
                <label className="label mb-1">Pick Sheet Format</label>
                <p className="text-gray-600 text-xs mb-3">How will members make their picks each tournament?</p>
                <PickSheetFormatSelector
                  value={form.pick_sheet_format}
                  onChange={v => set('pick_sheet_format', v)}
                />

                {/* Tier config */}
                {form.pick_sheet_format === 'tiered' && (
                  <div className="mt-4">
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2.5">Tier Setup</p>
                    <p className="text-gray-600 text-xs mb-3">Customize your tiers. Members will pick from each.</p>
                    <TierConfigEditor
                      tiers={form.pool_tiers}
                      onChange={v => set('pool_tiers', v)}
                    />
                  </div>
                )}

                {/* Salary cap config */}
                {form.pick_sheet_format === 'salary_cap' && (
                  <div className="mt-4">
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Salary Cap Settings</p>
                    <SalaryCapConfig
                      cap={form.pool_salary_cap}
                      capUnit={form.pool_cap_unit}
                      onCapChange={v => set('pool_salary_cap', v)}
                      onUnitChange={v => set('pool_cap_unit', v)}
                    />
                  </div>
                )}
              </div>

            </div>
          </Card>
          </div>
        )}

        {/* ── 3. League Settings — TOURNEYRUN ── */}
        {format === 'tourneyrun' && (
          <div className="animate-format">
          <Card>
            <CardHeader icon={Settings} title="⚙️ TourneyRun Settings" />
            <div className="space-y-5">

              {/* Max Teams */}
              <div>
                <label className="label mb-2.5">Max Teams</label>
                <PillSelector
                  options={[4, 6, 8, 10, 12].map(n => ({ value: n, label: String(n) }))}
                  value={form.max_teams}
                  onChange={v => set('max_teams', v)}
                />
              </div>

              {/* Draft Type */}
              <div>
                <label className="label mb-2.5">Draft Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: 'auction', label: 'Auction', desc: 'Nominate & bid — highest wins' },
                    { val: 'snake',   label: 'Snake',   desc: 'Classic serpentine draft'       },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => set('draft_type', opt.val)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        form.draft_type === opt.val
                          ? 'border-green-500/60 bg-green-500/8'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className={`font-bold text-sm ${form.draft_type === opt.val ? 'text-green-400' : 'text-gray-300'}`}>
                        {opt.label}
                      </div>
                      <div className="text-gray-500 text-xs mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Auction Budget */}
              {form.draft_type === 'auction' && (
                <div>
                  <label className="label mb-2.5">Auction Budget Per Team</label>
                  <PillSelector
                    options={[
                      { value: 500,  label: '$500'   },
                      { value: 1000, label: '$1,000' },
                      { value: 2000, label: '$2,000' },
                    ]}
                    value={form.auction_budget}
                    onChange={v => set('auction_budget', v)}
                  />
                  <p className="text-gray-600 text-xs mt-2">Credits used during the live auction to win players.</p>
                </div>
              )}

              {/* Snake Salary Cap */}
              {form.draft_type === 'snake' && (
                <div>
                  <label className="label mb-2.5">Draft Salary Cap</label>
                  <PillSelector
                    options={[
                      { value: 2000, label: '$2,000' },
                      { value: 2400, label: '$2,400' },
                      { value: 2800, label: '$2,800' },
                      { value: 3200, label: '$3,200' },
                    ]}
                    value={form.salary_cap}
                    onChange={v => set('salary_cap', v)}
                  />
                  <p className="text-gray-600 text-xs mt-2">Applied during the initial draft of core players.</p>
                </div>
              )}

              {/* Core + Flex Spots */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label mb-2.5">Core Spots</label>
                  <PillSelector
                    options={[2, 3, 4, 5].map(n => ({ value: n, label: String(n) }))}
                    value={form.core_spots}
                    onChange={v => set('core_spots', v)}
                  />
                </div>
                <div>
                  <label className="label mb-2.5">Flex Spots</label>
                  <PillSelector
                    options={[2, 3, 4, 5, 6].map(n => ({ value: n, label: String(n) }))}
                    value={form.flex_spots}
                    onChange={v => set('flex_spots', v)}
                  />
                </div>
              </div>
              <p className="text-gray-600 text-xs -mt-2">
                Core players locked for the season. Flex spots via waiver wire.
                Total roster: {form.core_spots + form.flex_spots} players.
              </p>

              {/* Bid Timer */}
              {form.draft_type === 'auction' && (
                <div>
                  <label className="label mb-2.5">Bid Timer</label>
                  <PillSelector
                    options={[
                      { value: 20, label: '20s' },
                      { value: 30, label: '30s' },
                      { value: 60, label: '60s' },
                    ]}
                    value={form.bid_timer_seconds}
                    onChange={v => set('bid_timer_seconds', v)}
                  />
                  <p className="text-gray-600 text-xs mt-2">Countdown resets after each new bid.</p>
                </div>
              )}

              {/* FAAB Budget */}
              <div>
                <label className="label mb-2.5">Weekly FAAB Budget</label>
                <PillSelector
                  options={[
                    { value: 50,  label: '$50'  },
                    { value: 100, label: '$100' },
                    { value: 200, label: '$200' },
                  ]}
                  value={form.faab_weekly_budget}
                  onChange={v => set('faab_weekly_budget', v)}
                />
                <p className="text-gray-600 text-xs mt-2">Resets every Monday for waiver wire bidding.</p>
              </div>

              {/* Waiver Wire Type */}
              <div>
                <label className="label mb-2.5">Waiver Wire Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: true,  label: 'FAAB Bidding',     desc: 'Blind bids — highest wins' },
                    { val: false, label: 'Reverse Standings', desc: 'Last place picks first'    },
                  ].map(opt => (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => set('use_faab', opt.val)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        form.use_faab === opt.val
                          ? 'border-green-500/60 bg-green-500/8'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className={`font-bold text-sm ${form.use_faab === opt.val ? 'text-green-400' : 'text-gray-300'}`}>
                        {opt.label}
                      </div>
                      <div className="text-gray-500 text-xs mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </Card>
          </div>
        )}

        {/* ── 3. League Settings — DAILY FANTASY ── */}
        {format === 'dk' && (
          <div className="animate-format">
          <Card>
            <CardHeader icon={Settings} title="⚙️ Daily Fantasy Settings" />
            <div className="space-y-5">

              {/* Max Teams */}
              <div>
                <label className="label mb-2.5">Max Teams</label>
                <PillSelector
                  options={[4, 6, 8, 10, 12].map(n => ({ value: n, label: String(n) }))}
                  value={form.max_teams}
                  onChange={v => set('max_teams', v)}
                />
              </div>

              {/* Picks Per Tournament */}
              <div>
                <label className="label mb-2.5">Picks Per Tournament</label>
                <PillSelector
                  options={[6, 8, 10].map(n => ({ value: n, label: String(n) }))}
                  value={form.starters_count}
                  onChange={v => set('starters_count', v)}
                />
                <p className="text-gray-600 text-xs mt-2">How many golfers each manager picks per tournament.</p>
              </div>

              {/* Salary Cap */}
              <div>
                <label className="label mb-2.5">Weekly Salary Cap</label>
                <PillSelector
                  options={[
                    { value: 25000,  label: '$25k'  },
                    { value: 50000,  label: '$50k'  },
                    { value: 75000,  label: '$75k'  },
                    { value: 100000, label: '$100k' },
                  ]}
                  value={form.weekly_salary_cap}
                  onChange={v => set('weekly_salary_cap', v)}
                />
                <p className="text-gray-600 text-xs mt-2">
                  Cap resets every tournament. Pick {form.starters_count} golfers within the cap.
                </p>
              </div>

              {/* Reset note */}
              <div className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3">
                <span className="text-blue-400 text-sm">🔄</span>
                <p className="text-blue-300/80 text-xs">Roster resets every tournament — no waiver wire.</p>
              </div>

            </div>
          </Card>
          </div>
        )}

        {/* ── 4. Buy-in (optional) ── */}
        <Card>
          <CardHeader icon={DollarSign} title="Buy-in (Optional)" />
          <div className="space-y-5">

            {/* Amount */}
            <div>
              <label className="label">Buy-in Per Team</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input pl-8"
                  placeholder="0"
                  value={form.buy_in_amount}
                  onChange={e => set('buy_in_amount', e.target.value)}
                />
              </div>
              <p className="text-gray-600 text-xs mt-2 leading-relaxed">
                💡 TourneyRun does not collect or handle buy-in money. Payments are managed directly between league members outside the platform.
              </p>
            </div>

            {parseFloat(form.buy_in_amount) > 0 && (
              <>
                {/* Prize Pool Breakdown */}
                {(() => {
                  const buyIn = parseFloat(form.buy_in_amount) || 0;
                  const teams = parseInt(form.max_teams) || 0;
                  const pool  = buyIn * teams;
                  return (
                    <div className="bg-gray-800/50 border border-gray-700/60 rounded-xl p-4">
                      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Prize Pool Estimate</p>
                      <p className="text-white text-sm font-bold mb-3">
                        ${buyIn.toLocaleString()} × {teams} teams
                        <span className="text-gray-400 font-normal"> = </span>
                        <span className="text-green-400">${pool.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </p>
                      <div className="space-y-1.5">
                        {form.payout_places.map((row, i) => {
                          const pct = parseInt(row.pct) || 0;
                          const amt = pool * pct / 100;
                          return (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">{ordinal(row.place)}</span>
                              <span className="text-gray-500">{pct}%</span>
                              <span className={`font-semibold tabular-nums ${pct > 0 ? 'text-gray-200' : 'text-gray-600'}`}>
                                ${amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div className={`mt-3 pt-3 border-t border-gray-700/60 text-xs font-semibold flex justify-between ${payoutTotal === 100 ? 'text-green-400' : 'text-amber-400'}`}>
                        <span>Total</span>
                        <span>{payoutTotal === 100 ? '100% ✓' : `${payoutTotal}% — must be 100%`}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Payment Instructions */}
                <div>
                  <label className="label">Payment Instructions (optional)</label>
                  <p className="text-gray-600 text-xs mb-3">Tell members how to pay you — shown on the league invite page.</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {['Venmo', 'PayPal', 'Zelle'].map(m => {
                      const key = m.toLowerCase();
                      const active = form.payment_methods.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => set('payment_methods', active
                            ? form.payment_methods.filter(x => x !== key)
                            : [...form.payment_methods, key]
                          )}
                          className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                            active
                              ? 'bg-green-500/20 border-green-500/60 text-green-400'
                              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    className="input"
                    placeholder='e.g. "@CollinW on Venmo — send before draft day"'
                    value={form.payment_instructions}
                    onChange={e => set('payment_instructions', e.target.value)}
                  />
                </div>

                {/* Payout Split */}
                <div>
                  <label className="label">Payout Split</label>
                  <p className="text-gray-600 text-xs mb-3">Set how the prize pool is divided. Must total 100%.</p>

                  <div className="space-y-2">
                    {form.payout_places.map((row, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm font-medium w-20 shrink-0">{ordinal(row.place)}</span>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="input pr-7 text-right font-bold py-1.5 text-sm"
                            value={row.pct}
                            onChange={e => {
                              const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              set('payout_places', form.payout_places.map((r, j) => j === i ? { ...r, pct: val } : r));
                            }}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                        </div>
                        {form.payout_places.length > 1 && (
                          <button
                            type="button"
                            onClick={() => set('payout_places',
                              form.payout_places.filter((_, j) => j !== i).map((r, j) => ({ ...r, place: j + 1 }))
                            )}
                            className="w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:text-red-400 text-lg leading-none transition-colors"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const n = form.payout_places.length + 1;
                      const even = Math.floor(100 / n);
                      set('payout_places', Array.from({ length: n }, (_, i) => ({
                        place: i + 1,
                        pct: i < n - 1 ? even : 100 - even * (n - 1),
                      })));
                    }}
                    className="mt-3 text-sm font-semibold text-gray-500 hover:text-green-400 transition-colors"
                  >
                    + Add Payout Place
                  </button>

                  <div className={`mt-2 text-xs font-semibold ${payoutTotal === 100 ? 'text-green-400' : 'text-amber-400'}`}>
                    {payoutTotal !== 100 && `Total: ${payoutTotal}% — must equal 100%`}
                  </div>
                </div>
              </>
            )}

          </div>
        </Card>

        {/* ── Scoring reference strip ── */}
        {format === 'tourneyrun' && (
          <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-4 h-4 text-green-400" />
              <span className="text-green-400 font-bold text-sm">Scoring System</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
              <div>Eagle → <span className="text-yellow-400 font-bold">+8 pts</span></div>
              <div>Birdie → <span className="text-green-400 font-bold">+3 pts</span></div>
              <div>Par → <span className="text-gray-300 font-bold">+0.5 pts</span></div>
              <div>Bogey → <span className="text-orange-400 font-bold">−0.5 pts</span></div>
              <div>Double+ → <span className="text-red-400 font-bold">−2 pts</span></div>
              <div>Majors → <span className="text-yellow-400 font-bold">1.5× all</span></div>
            </div>
            <p className="text-gray-500 text-xs mt-3">Finish bonuses: Win +30, Top 5 +15, Top 10 +8, Top 25 +3</p>
          </div>
        )}
        {format === 'dk' && (
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-blue-400 font-bold text-sm">DFS Scoring</span>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Same eagle/birdie/par points system. Salary cap resets each tournament — build a fresh lineup every week within your cap.
            </p>
          </div>
        )}

        {/* ── Pricing summary line ── */}
        {selectedFmt?.key === 'pool' && (() => {
          const tier = POOL_TIERS.find(t => t.maxTeams === form.max_teams && t.tier === form.pool_tier) || POOL_TIERS[0];
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.18)', borderRadius: 8, padding: '11px 14px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: 13, color: '#d1fae5', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700, color: '#4ade80' }}>Platform fee: {tier.priceLabel}</span>
                {' · '}Zero prize pool fees{' · '}Your group keeps every dollar
              </span>
            </div>
          );
        })()}

        {/* ── Promo code (Pool only) ── */}
        {format === 'pool' && (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Promo / Ambassador Code <span style={{ color: '#374151', fontWeight: 400 }}>(optional)</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="input"
                placeholder="e.g. JAKE10"
                value={promoCode}
                style={{ textTransform: 'uppercase', flex: 1, letterSpacing: '0.05em' }}
                onChange={e => {
                  const v = e.target.value.toUpperCase();
                  setPromoCode(v);
                  setPromoStatus(null);
                }}
                onBlur={() => validatePromo(promoCode)}
              />
              <button
                type="button"
                onClick={() => validatePromo(promoCode)}
                disabled={promoChecking || !promoCode.trim()}
                style={{ padding: '0 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {promoChecking ? '…' : 'Apply'}
              </button>
            </div>
            {promoStatus?.valid && (
              <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, color: '#4ade80', fontSize: 13, fontWeight: 600 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {promoCode} applied — {promoStatus.label}
              </div>
            )}
            {promoStatus?.valid === false && (
              <div style={{ marginTop: 7, color: '#f87171', fontSize: 13 }}>✕ {promoStatus.error}</div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', background: loading ? 'rgba(0,232,122,0.4)' : '#00e87a', color: '#001a0d', fontWeight: 700, fontSize: 14, padding: '14px 24px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s, transform 0.15s', letterSpacing: '0.01em' }}
          onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = '#00cc6a'; e.currentTarget.style.transform = 'scale(1.01)'; } }}
          onMouseLeave={e => { if (!loading) { e.currentTarget.style.background = '#00e87a'; e.currentTarget.style.transform = 'scale(1)'; } }}
        >
          {loading ? 'Creating League...' : (
            { pool: 'Launch Office Pool →', dk: 'Launch DFS League →', tourneyrun: 'Launch Fantasy League →' }[selectedFmt?.key] ?? `Create ${selectedFmt?.title} League →`
          )}
        </button>
      </form>
    </div>
  );
}
