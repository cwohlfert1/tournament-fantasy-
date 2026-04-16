import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Flag, DollarSign, Trophy, Settings, Check, Zap, X } from 'lucide-react';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import { isMastersPromoActive, POOL_TIERS } from '../../utils/poolPricing';
import Select from '../../components/ui/Select';

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
    key: 'salary_cap',
    Icon: DollarSign,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    title: 'Salary Cap',
    badge: 'Budget',
    badgeColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    description: 'Build a roster under a budget. Each player has a price based on betting odds. Stay under the cap — top score wins.',
    activeBorder: 'border-blue-500/50',
    activeBg: 'bg-blue-500/5',
  },
  {
    key: 'tourneyrun',
    Icon: Trophy,
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
    title: 'TourneyRun',
    description: 'Season-long fantasy golf. Draft your core roster before the season, pick up free agents weekly, and compete across every tournament. Majors score 1.5×.',
    activeBorder: 'border-green-500/50',
    activeBg: 'bg-green-500/5',
  },
];

// ── Scoring Style options for Pool ───────────────────────────────────────────

const SCORING_STYLES = [
  {
    value: 'stroke_play',
    icon: '🏌️',
    title: 'Classic Stroke Play',
    subtitle: 'Raw total strokes across all picked golfers — lowest score wins',
    description: '',
    example: 'e.g. Your 7 players combine for −14 for the week. Lowest combined score wins.',
    recommended: false,
    isNew: false,
    isPopular: false,
  },
  {
    value: 'tourneyrun',
    icon: '⚡',
    title: 'TourneyRun Style',
    subtitle: 'Eagle +8 · Birdie +3 · Par +0.5 · Bogey −0.5 · Double+ −2',
    description: 'Points per shot, every hole matters',
    example: 'Win +30 · Top 5 +15 · Top 10 +8 · Top 25 +3 on top of shot scoring.',
    recommended: false,
    isNew: true,
    isPopular: false,
  },
  {
    value: 'total_score',
    icon: '⛳',
    title: 'Finish Scoring',
    subtitle: 'Award points for finishing position. Simple and beginner-friendly.',
    description: '',
    example: 'Win = 30pts · Top 5 = 15pts · Top 10 = 8pts · Top 25 = 3pts. Highest points wins.',
    recommended: false,
    isNew: false,
    isPopular: false,
  },
];

// ── Shared UI components ──────────────────────────────────────────────────────

function PillSelector({ options, value, onChange, extra }) {
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
      {extra}
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
          border: isSelected ? '2px solid #22c55e' : '2px solid rgba(255,255,255,0.08)',
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
    <div>
      <style>{`
        @media (max-width:480px) {
          .max-teams-grid { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>
      <div className="max-teams-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {POOL_TIERS.map(t => (
          <div key={t.maxTeams} className={t.tier === 'enterprise' ? 'enterprise-card' : ''}>
            <TierBtn t={t} />
          </div>
        ))}
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
                {s.isPopular && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400">
                    POPULAR
                  </span>
                )}
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
              {s.example && (
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{s.example}</p>
              )}
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

// Parse "18:1" odds format → decimal (e.g. 19.0) for range comparisons
function oddsToDecimal(str) {
  if (!str) return null;
  const parts = String(str).replace(/\+/g, '').split(':');
  if (parts.length === 2) {
    const n = parseFloat(parts[0]), d = parseFloat(parts[1]);
    if (!isNaN(n) && !isNaN(d) && d > 0) return n / d + 1;
  }
  return null;
}

function TierConfigEditor({ tiers, onChange, fieldPlayers }) {
  const totalPicks = tiers.reduce((s, t) => s + (parseInt(t.picks) || 0), 0);

  function updateTier(i, field, val) {
    onChange(tiers.map((t, j) => j === i ? { ...t, [field]: val } : t));
  }

  function addTier() {
    // Auto-scale beyond the default 5 tiers in ~250-odds increments.
    // Close the previously-last (open-ended) tier, then open the new last one.
    // Step size: 250. Example progression after the 5-tier default:
    //   T6: 501:1 – 750:1, T7: 751:1+ (then close to 1000:1, T8: 1001:1+, etc.)
    const STEP = 250;
    const parseOdds = s => parseInt(String(s || '').split(':')[0]) || 0;
    const next = [...tiers];
    const lastIdx = next.length - 1;
    if (lastIdx >= 0) {
      const last = next[lastIdx];
      // Only auto-close if user hasn't already specified an upper bound
      if (!last.odds_max) {
        const lastMin = parseOdds(last.odds_min);
        const closedMax = (lastMin > 0 ? lastMin + STEP - 1 : STEP);
        next[lastIdx] = { ...last, odds_max: `${closedMax}:1` };
      }
    }
    const prevMax = parseOdds(next[lastIdx]?.odds_max) || 0;
    const newMin  = prevMax + 1;
    next.push({
      tier: next.length + 1,
      odds_min: newMin > 1 ? `${newMin}:1` : '',
      odds_max: '', // open-ended last tier
      picks: 1,
      approxPlayers: null,
    });
    onChange(next);
  }

  function removeTier(i) {
    onChange(tiers.filter((_, j) => j !== i).map((t, j) => ({ ...t, tier: j + 1 })));
  }

  // Compute live tier stats from fieldPlayers whenever tiers or players change
  const tierStats = (fieldPlayers && fieldPlayers.length > 0)
    ? tiers.map((t, i) => {
        const minDec = oddsToDecimal(t.odds_min);
        const maxDec = oddsToDecimal(t.odds_max);
        const isLastTier = i === tiers.length - 1;
        const inTier = fieldPlayers.filter(p => {
          const dec = p.odds_decimal || 999;
          if (minDec !== null && dec < minDec) return false;
          if (!isLastTier && maxDec !== null && dec > maxDec) return false;
          return true;
        });
        const top3 = inTier.slice(0, 3).map(p => p.name.split(' ').pop()); // last name only
        return { count: inTier.length, top3 };
      })
    : tiers.map(t => ({
        count: t.approxPlayers ?? null,
        top3: t.sample ?? [],
      }));

  return (
    <div>
      <style>{`
        @media (max-width: 480px) {
          .tier-odds-input { width: 54px !important; font-size: 11px !important; padding: 4px 5px !important; }
        }
      `}</style>
      <div className="space-y-2">
        {tiers.map((t, i) => {
          const stats = tierStats[i];
          return (
            <div key={i}>
              <div className="flex items-center gap-2 bg-gray-800/40 rounded-xl px-3 py-2.5">
                <span className="text-gray-500 text-xs font-bold w-10 shrink-0">T{t.tier}</span>
                <input
                  type="text"
                  className="input py-1 text-xs w-20 shrink-0 tier-odds-input"
                  placeholder="1:1"
                  value={t.odds_min}
                  onChange={e => updateTier(i, 'odds_min', e.target.value)}
                />
                <span className="text-gray-600 text-xs shrink-0">–</span>
                <input
                  type="text"
                  className="input py-1 text-xs w-24 shrink-0 tier-odds-input"
                  placeholder="250:1+"
                  value={t.odds_max}
                  onChange={e => updateTier(i, 'odds_max', e.target.value)}
                />
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
                  ><X size={14} /></button>
                )}
              </div>
              {/* Tier stats bar */}
              <div className="flex items-center gap-3 px-3 mt-1 mb-0.5">
                {stats.count != null && (
                  <span className="text-gray-500 text-[11px]">~{stats.count} players</span>
                )}
                {stats.top3 && stats.top3.length > 0 && (
                  <span className="text-gray-600 text-[11px] truncate">
                    {stats.top3.join(', ')}{stats.count > 3 ? '…' : ''}
                  </span>
                )}
                {i === 0 && (!stats.top3 || stats.top3.length === 0) && (
                  <span className="text-gray-600 text-[11px] italic">Scheffler, McIlroy, Rory…</span>
                )}
              </div>
            </div>
          );
        })}
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
  picks_per_team: 7,
  scoring_style: 'stroke_play',
  pool_tier: 'standard',
  comm_pro_price: 12.99,
  pick_sheet_format: 'tiered',
  // Default 5 tiers covering elite favorites through deep longshots.
  // Last tier is always open-ended; addTier() auto-scales beyond.
  pool_tiers: [
    { tier: 1, odds_min: '1:1',   odds_max: '30:1',  picks: 1, approxPlayers: 10 },
    { tier: 2, odds_min: '31:1',  odds_max: '55:1',  picks: 1, approxPlayers: 15 },
    { tier: 3, odds_min: '56:1',  odds_max: '100:1', picks: 2, approxPlayers: 20 },
    { tier: 4, odds_min: '101:1', odds_max: '250:1', picks: 1, approxPlayers: 30 },
    { tier: 5, odds_min: '251:1', odds_max: '',      picks: 2, approxPlayers: null },
  ],
  pool_drop_count: 0,
  pool_max_entries: 1,
  // Missed-cut rule (default: +8 strokes per missed round). Auto-overridden
  // to 'exclude' when commissioner picks a no_cut tournament.
  missed_cut_rule: 'fixed',
  missed_cut_penalty: 8,
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
    return ['pool', 'salary_cap', 'tourneyrun'].includes(f) ? f : 'tourneyrun';
  })();

  const [format, setFormat] = useState(initialFormat);
  const [form, setForm] = useState(() => ({
    ...DEFAULT_FORM,
    ...(initialFormat === 'pool' ? { max_teams: 20, pool_tier: 'standard', comm_pro_price: 12.99 } : {}),
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tournaments, setTournaments] = useState([]);
  const [promoCode, setPromoCode] = useState(searchParams.get('promo') || '');
  const [promoStatus, setPromoStatus] = useState(null); // null | { valid, label, discountType, discountValue } | { error }
  const [promoChecking, setPromoChecking] = useState(false);
  const [tiersAutoBalanced, setTiersAutoBalanced] = useState(false);
  const [fieldPlayers, setFieldPlayers] = useState([]); // sorted field for tier odds preview

  useEffect(() => {
    api.get('/golf/tournaments').then(res => {
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = (res.data.tournaments || []).filter(t => t.end_date >= today);
      setTournaments(upcoming);
    }).catch(() => {});
  }, []);

  // Auto-validate promo code if pre-filled from URL param
  useEffect(() => {
    if (promoCode) validatePromo(promoCode);
  }, []); // eslint-disable-line

  // Auto-balance tier suggestions when tournament is selected
  useEffect(() => {
    if (format !== 'pool' || !form.pool_tournament_id) {
      setTiersAutoBalanced(false);
      return;
    }
    const tierCount = form.pool_tiers.length || 4;
    api.get(`/golf/tournaments/${form.pool_tournament_id}/suggested-tiers?count=${tierCount}`)
      .then(res => {
        const suggested = res.data.tiers.map((t, i) => ({
          tier:          t.tier,
          odds_min:      t.odds_min,
          odds_max:      t.odds_max,
          picks:         form.pool_tiers[i]?.picks ?? 1,
          approxPlayers: t.approxPlayers,
          sample:        t.sample || [],
        }));
        set('pool_tiers', suggested);
        setTiersAutoBalanced(true);
      })
      .catch(() => setTiersAutoBalanced(false));
    // Also fetch sorted field for live odds preview in TierConfigEditor
    api.get(`/golf/tournaments/${form.pool_tournament_id}/field-players`)
      .then(res => setFieldPlayers(res.data.players || []))
      .catch(() => setFieldPlayers([]));
  }, [form.pool_tournament_id]); // eslint-disable-line

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
      ...(f === 'pool' ? { pool_tier: 'standard', comm_pro_price: 12.99 } : {}),
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
        // JSONB source of truth for payout splits
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
        // Land on the commissioner tab with the re-invite prompt highlighted —
        // commissioners can pull members from a past pool without re-typing emails.
        navigate(`/golf/league/${league.id}?tab=commissioner&just_created=1`);
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
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Create Golf League</h1>
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
                  <span className={`font-bold text-sm sm:text-base ${format === f.key ? 'text-white' : 'text-gray-300'}`}>
                    {f.title}
                  </span>
                  {f.recommended && (
                    <span className="inline-block bg-green-500/20 border border-green-500/30 text-green-400 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide">
                      Season Long Fantasy
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
                placeholder={format === 'salary_cap' ? 'Salary Cap Golf 2026' : format === 'pool' ? 'Golf Pool 2026' : 'Golf Degens 2026'}
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
                <Select
                  value={form.pool_tournament_id}
                  onChange={v => set('pool_tournament_id', v)}
                  options={tournaments.map(t => ({
                    value: t.id,
                    label: `${t.name}${t.start_date ? ` · ${new Date(t.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}${t.is_major ? ' (Major)' : ''}`,
                  }))}
                  placeholder="— Select a tournament —"
                  fullWidth
                />
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
                  options={[4, 5, 6, 7, 8, 9, 10, 'custom'].map(n => ({ value: n === 'custom' ? 'custom' : n, label: String(n) }))}
                  value={[4,5,6,7,8,9,10].includes(form.picks_per_team) ? form.picks_per_team : 'custom'}
                  onChange={v => set('picks_per_team', v === 'custom' ? 11 : v)}
                />
                {![4,5,6,7,8,9,10].includes(form.picks_per_team) && (
                  <input
                    type="number" min="1" max="30" step="1"
                    className="input w-28 text-sm mt-2"
                    placeholder="Enter number"
                    value={form.picks_per_team}
                    onChange={e => { const v = parseInt(e.target.value); if (v > 0) set('picks_per_team', v); }}
                  />
                )}
                <p className="text-gray-600 text-xs mt-2">Each manager picks this many golfers per tournament.</p>
              </div>

              {/* Scoring Rule — drop N worst players */}
              <div>
                <label className="label mb-2.5">Scoring Rule</label>
                <div className="space-y-2">
                  {[
                    { val: true,  title: 'Drop lowest scores', sub: `Worst ${form.pool_drop_count || 2} players dropped each tournament` },
                    { val: false, title: 'All picks count',    sub: 'Every player\'s total score is added' },
                  ].map(opt => {
                    const active = opt.val ? form.pool_drop_count > 0 : form.pool_drop_count === 0;
                    return (
                      <button key={String(opt.val)} type="button"
                        onClick={() => set('pool_drop_count', opt.val ? (form.pool_drop_count || 2) : 0)}
                        className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${active ? 'border-green-500/50 bg-green-500/8' : 'border-gray-700 bg-gray-800/20 hover:border-gray-600'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-green-400' : 'border-gray-600'}`}>
                            {active && <div className="w-2 h-2 rounded-full bg-green-400" />}
                          </div>
                          <div>
                            <div className={`font-bold text-sm ${active ? 'text-white' : 'text-gray-300'}`}>{opt.title}</div>
                            <div className="text-gray-500 text-xs mt-0.5">{opt.sub}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {form.pool_drop_count > 0 && (
                  <div className="flex items-center gap-3 mt-3 pl-1">
                    <span className="text-gray-400 text-sm">Drop</span>
                    <PillSelector
                      options={[1,2,3,4].map(n => ({ value: n, label: String(n) }))}
                      value={form.pool_drop_count}
                      onChange={v => set('pool_drop_count', v)}
                    />
                    <span className="text-gray-400 text-sm">worst players</span>
                  </div>
                )}
              </div>

              {/* Missed Cut Rule */}
              <div data-testid="missed-cut-section">
                <label className="label mb-2.5">Missed Cut Rule</label>
                <p className="text-gray-600 text-xs mb-3">How to score players who don't make the cut. Locked once tournament starts.</p>
                <div className="space-y-2">
                  {[
                    { val: 'fixed',           title: `Fixed Penalty (+${form.missed_cut_penalty || 8})`, sub: `Each missed round = +${form.missed_cut_penalty || 8} strokes over par. Simple and most common.` },
                    { val: 'highest_carded',  title: 'Highest Carded Round',                              sub: 'Missed players take the worst round score from the field that day. Updates live.' },
                    { val: 'stroke_penalty',  title: 'Custom Stroke Penalty',                             sub: 'Set your own penalty (1–10) per unfinished round.' },
                    { val: 'exclude',         title: 'Exclude (No Penalty)',                              sub: 'Missed-cut scores ignored entirely. Used for no-cut events.' },
                  ].map(opt => {
                    const active = (form.missed_cut_rule || 'fixed') === opt.val;
                    return (
                      <button key={opt.val} type="button"
                        onClick={() => set('missed_cut_rule', opt.val)}
                        className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${active ? 'border-green-500/50 bg-green-500/8' : 'border-gray-700 bg-gray-800/20 hover:border-gray-600'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-green-400' : 'border-gray-600'}`}>
                            {active && <div className="w-2 h-2 rounded-full bg-green-400" />}
                          </div>
                          <div>
                            <div className={`font-bold text-sm ${active ? 'text-white' : 'text-gray-300'}`}>{opt.title}</div>
                            <div className="text-gray-500 text-xs mt-0.5">{opt.sub}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {form.missed_cut_rule === 'stroke_penalty' && (
                  <div className="flex items-center gap-3 mt-3 pl-1">
                    <span className="text-gray-400 text-sm">Penalty</span>
                    <input
                      type="number" min="1" max="10" step="1"
                      value={form.missed_cut_penalty || 8}
                      onChange={e => { const v = Math.max(1, Math.min(10, parseInt(e.target.value) || 8)); set('missed_cut_penalty', v); }}
                      className="input w-16 text-sm text-center"
                    />
                    <span className="text-gray-400 text-sm">strokes per missed round</span>
                  </div>
                )}
              </div>

              {/* Additional Entries */}
              <div>
                <label className="label mb-2">Entries Per Player</label>
                <p className="text-gray-600 text-xs mb-3">Allow each member to submit multiple independent pick sets. Default is 1.</p>
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set('pool_max_entries', n)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                        form.pool_max_entries === n
                          ? 'border-green-500/50 bg-green-500/10 text-green-400'
                          : 'border-gray-700 bg-gray-800/30 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {n === 1 ? '1 entry' : `${n} entries`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scoring Style */}
              <div>
                <label className="label mb-3">Scoring Style</label>
                <ScoringStyleSelector value={form.scoring_style} onChange={v => set('scoring_style', v)} />
              </div>

              {/* Tier config */}
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2.5">Tier Setup</p>
                {tiersAutoBalanced ? (
                  <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/25 rounded-lg px-3 py-2 mb-3">
                    <span className="text-green-400 text-xs">⚖️</span>
                    <p className="text-green-400 text-xs font-medium">Tiers auto-balanced for this tournament's field. Adjust before launching.</p>
                  </div>
                ) : (
                  <p className="text-gray-600 text-xs mb-3">Customize your tiers. Members will pick from each.</p>
                )}
                <TierConfigEditor
                  tiers={form.pool_tiers}
                  onChange={v => { set('pool_tiers', v); setTiersAutoBalanced(false); }}
                  fieldPlayers={fieldPlayers}
                />
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

        {/* ── 3. League Settings — SALARY CAP ── */}
        {format === 'salary_cap' && (
          <div className="animate-format">
          <Card>
            <CardHeader icon={Settings} title="⚙️ Salary Cap Settings" />
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

              {/* Scoring Style */}
              <div>
                <label className="label mb-1">Scoring Style</label>
                <ScoringStyleSelector value={form.scoring_style} onChange={v => set('scoring_style', v)} />
              </div>

              {/* Picks Per Tournament */}
              <div>
                <label className="label mb-2.5">Players Per Team</label>
                <PillSelector
                  options={[4, 5, 6, 7, 8].map(n => ({ value: n, label: String(n) }))}
                  value={form.starters_count}
                  onChange={v => { set('starters_count', v); set('_startersCustom', false); }}
                  extra={
                    form._startersCustom
                      ? <input type="number" min="3" max="20" className="input w-20 text-sm text-center" value={form.starters_count}
                          onChange={e => set('starters_count', Math.max(3, Math.min(20, parseInt(e.target.value) || 6)))} />
                      : <button type="button" className="px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-all bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300" onClick={() => set('_startersCustom', true)}>Custom</button>
                  }
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
                  value={form._capCustom ? null : form.weekly_salary_cap}
                  onChange={v => { set('weekly_salary_cap', v); set('_capCustom', false); }}
                  extra={
                    form._capCustom
                      ? <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-sm">$</span>
                          <input type="number" min="10000" max="500000" step="1000" className="input w-28 text-sm text-center"
                            value={form.weekly_salary_cap}
                            onChange={e => set('weekly_salary_cap', Math.max(10000, Math.min(500000, parseInt(e.target.value) || 50000)))} />
                        </div>
                      : <button type="button" className="px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-all bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300" onClick={() => set('_capCustom', true)}>Custom</button>
                  }
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
                          ><X size={14} /></button>
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
        {format === 'salary_cap' && (
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-blue-400 font-bold text-sm">Salary Cap Scoring</span>
            </div>
            {form.scoring_style === 'stroke_play' && (
              <p className="text-gray-400 text-xs leading-relaxed">
                Lowest combined strokes across your {form.starters_count} picks wins. Cap resets each tournament.
              </p>
            )}
            {form.scoring_style === 'tourneyrun' && (
              <>
                <p className="text-gray-400 text-xs mb-1">Eagle +8 · Birdie +3 · Par +0.5 · Bogey −0.5 · Double+ −2</p>
                <p className="text-gray-500 text-xs">Finish bonuses: Win +30, Top 5 +15, Top 10 +8, Top 25 +3. Cap resets each tournament.</p>
              </>
            )}
            {form.scoring_style === 'total_score' && (
              <p className="text-gray-400 text-xs leading-relaxed">
                Win = 30pts · Top 5 = 15pts · Top 10 = 8pts · Top 25 = 3pts. Highest points total wins. Cap resets each tournament.
              </p>
            )}
          </div>
        )}

        {/* ── Pricing summary line ── */}
        {(() => {
          const period = format === 'tourneyrun' ? '/season' : '/tournament';
          let price, promoPrice, priceLabel;
          if (format === 'pool') {
            const tier = POOL_TIERS.find(t => t.maxTeams === form.max_teams && t.tier === form.pool_tier) || POOL_TIERS[0];
            price = tier.price;
            promoPrice = tier.promoPrice;
            priceLabel = tier.priceLabel;
          } else {
            price = 12.99;
            promoPrice = 9.99;
            priceLabel = `$12.99${period}`;
          }
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,232,122,0.05)', border: '1px solid rgba(0,232,122,0.18)', borderRadius: 8, padding: '11px 14px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: 13, color: '#d1fae5', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700, color: '#4ade80' }}>
                  Platform fee:{' '}
                  {isMastersPromoActive() ? (
                    <>
                      <span style={{ textDecoration: 'line-through', color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>${price.toFixed(2)}</span>
                      {' '}${promoPrice.toFixed(2)}{period}
                      <span style={{ color: '#fb923c', fontWeight: 600, fontSize: 12, marginLeft: 6 }}>Masters Launch Pricing · ends April 10</span>
                    </>
                  ) : priceLabel}
                </span>
                {' · '}Zero prize pool fees{' · '}Your group keeps every dollar
              </span>
            </div>
          );
        })()}

        {/* ── Promo / Ambassador Code ── */}
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

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', background: loading ? 'rgba(0,232,122,0.4)' : '#22c55e', color: '#001a0d', fontWeight: 700, fontSize: 14, padding: '14px 24px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s, transform 0.15s', letterSpacing: '0.01em' }}
          onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = '#16a34a'; e.currentTarget.style.transform = 'scale(1.01)'; } }}
          onMouseLeave={e => { if (!loading) { e.currentTarget.style.background = '#22c55e'; e.currentTarget.style.transform = 'scale(1)'; } }}
        >
          {loading ? 'Creating League...' : (
            { pool: 'Launch Office Pool →', salary_cap: 'Launch Salary Cap League →', tourneyrun: 'Launch Fantasy League →' }[selectedFmt?.key] ?? `Create ${selectedFmt?.title} League →`
          )}
        </button>
      </form>
    </div>
  );
}
