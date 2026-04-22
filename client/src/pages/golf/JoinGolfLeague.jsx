import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Flag, ArrowRight, Users, Calendar, ChevronDown, Trophy } from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useDocTitle } from '../../hooks/useDocTitle';
import PlayerAvatar from '../../components/golf/PlayerAvatar';
import { tierAccent } from '../../utils/golfTierColors';

function fmtDateRange(start, end) {
  if (!start) return '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const s = new Date(start + 'T12:00:00');
  const e = end ? new Date(end + 'T12:00:00') : null;
  if (!e || start === end) return `${MONTHS[s.getMonth()]} ${s.getDate()}`;
  if (s.getMonth() === e.getMonth()) return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}`;
  return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}`;
}

export default function JoinGolfLeague() {
  useDocTitle('Join Golf League | TourneyRun', {
    description: "You've been invited to join a golf pool on TourneyRun. Pick your players by tier and compete for the prize pool.",
    image: 'https://www.tourneyrun.app/golf-og-image.png',
  });
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const codeFromUrl = searchParams.get('code') || '';

  const [code, setCode]           = useState(codeFromUrl.toUpperCase());
  const [preview, setPreview]     = useState(null);
  const [tiers, setTiers]         = useState([]);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(!!codeFromUrl);
  const [openTier, setOpenTier]   = useState(null);

  const [teamName, setTeamName]   = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');


  // Capture ref code from URL
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) sessionStorage.setItem('golf_ref_code', ref.toUpperCase());
  }, [searchParams]);

  // Fetch league preview whenever code changes (public endpoint, no auth needed)
  useEffect(() => {
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < 4) { setPreview(null); return; }
    setPreviewLoading(true);
    setPreviewError('');
    api.get(`/golf/leagues/preview/${trimmed}`)
      .then(r => {
        setPreview(r.data.league);
        setTiers(r.data.tiers || []);
        setPreviewError('');
        // Auto-open the first tier
        if (r.data.tiers?.length) setOpenTier(r.data.tiers[0].tier);
      })
      .catch(err => {
        setPreview(null);
        setTiers([]);
        setPreviewError(err.response?.status === 404 ? 'Invalid invite code.' : 'Could not load league.');
      })
      .finally(() => setPreviewLoading(false));
  }, [code]);

  async function doJoin() {
    setJoinLoading(true);
    setJoinError('');
    try {
      const res = await api.post('/golf/leagues/join', { invite_code: code.trim(), team_name: teamName.trim() });
      navigate(`/golf/league/${res.data.league_id}`);
    } catch (err) {
      setJoinError(err.response?.data?.error || 'Failed to join league');
      setJoinLoading(false);
    }
  }

  function handleJoinSubmit(e) {
    e.preventDefault();
    doJoin();
  }

  // Redirect URL for auth buttons — encode so code survives the ?then= round-trip
  const returnUrl = encodeURIComponent(`/golf/join?code=${code.trim()}`);

  return (
    <div className="max-w-md mx-auto px-4 py-12 sm:py-16">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
          <Flag className="w-8 h-8 text-green-400" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Join a Golf League</h1>
        <p className="text-gray-400 mt-2">Enter your invite code to preview players and join.</p>
      </div>

      {/* Invite code input */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-5">
        <label className="label">Invite Code</label>
        <input
          type="text"
          className="input text-base uppercase tracking-widest font-bold"
          placeholder="ABCD1234"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={12}
        />
        {previewLoading && <p className="text-gray-500 text-xs mt-2">Looking up league…</p>}
        {previewError && <p className="text-red-400 text-xs mt-2">{previewError}</p>}
      </div>

      {/* League preview card */}
      {preview && (
        <div className="bg-gray-900 border border-green-500/30 rounded-2xl p-5 mb-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border bg-green-500/15 border-green-500/30 text-green-400 uppercase">
                {preview.format_type === 'pool' ? 'Pool' : preview.format_type === 'salary_cap' ? 'Salary Cap' : preview.format_type === 'draft' ? 'Snake Draft' : 'TourneyRun'}
              </span>
              {parseFloat(preview.buy_in_amount) === 0 && (
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border bg-yellow-500/10 border-yellow-500/30 text-yellow-400">FREE</span>
              )}
            </div>
            <h2 className="text-white font-bold text-xl">{preview.name}</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-1 text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">
                <Users className="w-3 h-3" /> Members
              </div>
              <div className="text-white text-sm font-bold">{preview.member_count}/{preview.max_teams}</div>
            </div>
            {preview.format_type === 'pool' && (
              <div className="bg-gray-800/60 rounded-xl px-3 py-2.5">
                <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-0.5">Picks per team</div>
                <div className="text-white text-sm font-bold">{preview.picks_per_team || 8}</div>
              </div>
            )}
          </div>

          {preview.pool_tournament_name && (
            <div className="flex items-start gap-2 bg-gray-800/40 rounded-xl px-3 py-2.5">
              <Calendar className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-white text-sm font-semibold">{preview.pool_tournament_name}</div>
                {(preview.pool_tournament_start || preview.pool_tournament_course) && (
                  <div className="text-gray-500 text-xs mt-0.5">
                    {[
                      preview.pool_tournament_start && fmtDateRange(preview.pool_tournament_start, preview.pool_tournament_end),
                      preview.pool_tournament_course,
                    ].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tier/player preview — browse before signup */}
          {tiers.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Trophy style={{ width: 14, height: 14, color: '#6b7280' }} />
                <span style={{ color: '#9ca3af', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Pick {tiers.reduce((sum, t) => sum + (t.picks || 1), 0)} golfers across {tiers.length} tiers
                </span>
              </div>
              {tiers.map(t => {
                const isOpen = openTier === t.tier;
                const accent = tierAccent(t.tier);
                return (
                  <div key={t.tier} style={{ marginBottom: 6 }}>
                    <button
                      type="button"
                      onClick={() => setOpenTier(isOpen ? null : t.tier)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${isOpen ? accent + '44' : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span style={{ width: 24, height: 24, borderRadius: 6, background: accent + '22', border: `1px solid ${accent}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: accent, flexShrink: 0 }}>
                        {t.tier}
                      </span>
                      <span style={{ flex: 1, color: '#d1d5db', fontSize: 13, fontWeight: 600 }}>
                        Tier {t.tier}
                        <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                          {t.players.length} golfers · pick {t.picks || 1}
                        </span>
                      </span>
                      <ChevronDown style={{ width: 14, height: 14, color: '#6b7280', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                    {isOpen && (
                      <div style={{ padding: '6px 0 2px', maxHeight: 240, overflowY: 'auto' }}>
                        {t.players.map((p, pi) => (
                          <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <PlayerAvatar name={p.name} tier={t.tier} espnPlayerId={p.espn_player_id} size={28} />
                            <span style={{ flex: 1, color: '#d1d5db', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name}
                            </span>
                            {p.odds && (
                              <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                {p.odds}
                              </span>
                            )}
                            {p.ranking && (
                              <span style={{ color: '#6b7280', fontSize: 10, flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
                                #{p.ranking}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Buy-in info */}
          {parseFloat(preview.buy_in_amount) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px' }}>
              <span style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700 }}>${preview.buy_in_amount} buy-in</span>
            </div>
          )}

          {/* Auth gates — shown only when NOT logged in */}
          {!user && (
            <div className="space-y-2 pt-1">
              <Link
                to={`/login?then=${returnUrl}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: '#22c55e', color: '#001a0d', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 8, textDecoration: 'none' }}
              >
                Sign In to Join <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to={`/register?then=${returnUrl}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 8, textDecoration: 'none' }}
              >
                Create Account to Join
              </Link>
            </div>
          )}

          {/* Join form — shown only when logged in */}
          {user && (
            <form onSubmit={handleJoinSubmit} className="space-y-3 pt-1">
              <div>
                <label className="label">Your Team Name *</label>
                <input
                  type="text"
                  className="input text-base"
                  placeholder="The Bogey Boys"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  required
                />
              </div>

              {joinError && (
                <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm">
                  {joinError}
                </div>
              )}

              <button
                type="submit"
                disabled={joinLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/20"
              >
                {joinLoading ? 'Joining…' : <><span>Join League</span><ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}
        </div>
      )}

    </div>
  );
}
