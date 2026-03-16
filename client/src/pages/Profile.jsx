import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import { useDocTitle } from '../hooks/useDocTitle';
import BallLoader from '../components/BallLoader';

// ── Helpers ────────────────────────────────────────────────────────────────

function ordinal(n) {
  if (!n) return '—';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function initials(name) {
  if (!name) return '?';
  return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Card({ title, subtitle, children, className = '' }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden ${className}`}>
      {(title || subtitle) && (
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-base font-bold text-white">{title}</h2>
          {subtitle && <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer select-none group">
      <span className="text-gray-300 text-sm group-hover:text-white transition-colors">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          checked ? 'bg-brand-500' : 'bg-gray-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

function SaveButton({ loading, saved, onClick, label = 'Save Changes' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
        saved
          ? 'bg-green-600 text-white'
          : 'bg-brand-500 hover:bg-brand-400 text-white disabled:opacity-50'
      }`}
    >
      {loading ? (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : saved ? '✓ Saved' : null}
      {!loading && (saved ? null : label)}
    </button>
  );
}

function AvatarUploader({ src, name, onUpload, onRemove, uploading, endpoint, field, accept = 'image/*', placeholder }) {
  const inputRef = useRef(null);
  return (
    <div className="flex items-center gap-5">
      <div
        className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-gray-700 bg-gray-800 flex items-center justify-center shrink-0 cursor-pointer group"
        onClick={() => inputRef.current?.click()}
      >
        {src ? (
          <img src={src} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl font-black text-gray-400">{placeholder || initials(name)}</span>
        )}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        {uploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="block text-sm text-brand-400 hover:text-brand-300 font-semibold transition-colors"
        >
          {src ? 'Change photo' : 'Upload photo'}
        </button>
        {src && (
          <button
            type="button"
            onClick={onRemove}
            className="block text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Remove
          </button>
        )}
        <p className="text-gray-600 text-xs">JPG, PNG or GIF · Max 3 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Profile() {
  useDocTitle('Profile | TourneyRun');
  const { user: authUser, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile]       = useState(null);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Section-level save states
  const [acctSaving, setAcctSaving]         = useState(false);
  const [acctSaved, setAcctSaved]           = useState(false);
  const [teamSaving, setTeamSaving]         = useState(false);
  const [teamSaved, setTeamSaved]           = useState(false);
  const [venmoSaving, setVenmoSaving]       = useState(false);
  const [venmoSaved, setVenmoSaved]         = useState(false);
  const [notifSaving, setNotifSaving]       = useState(false);
  const [notifSaved, setNotifSaved]         = useState(false);
  const [pwSaving, setPwSaving]             = useState(false);
  const [pwSaved, setPwSaved]               = useState(false);
  const [pwError, setPwError]               = useState('');

  // Avatar / logo upload
  const [avatarUploading, setAvatarUploading]   = useState(false);
  const [logoUploading, setLogoUploading]       = useState(false);

  // Account form
  const [username, setUsername]   = useState('');
  const [email, setEmail]         = useState('');

  // Team form
  const [defaultTeamName, setDefaultTeamName] = useState('');

  // Venmo/Zelle
  const [venmoHandle, setVenmoHandle] = useState('');

  // Notifications
  const [notifTurn, setNotifTurn]               = useState(true);
  const [notifDraftStart, setNotifDraftStart]   = useState(true);
  const [notifStandings, setNotifStandings]     = useState(true);

  // Password
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');

  // Referral
  const [refCopied, setRefCopied]   = useState(false);

  // Delete account
  const [deleteStep, setDeleteStep]   = useState(0); // 0 = idle, 1 = confirm, 2 = password
  const [deletePw, setDeletePw]       = useState('');
  const [deleting, setDeleting]       = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([api.get('/profile'), api.get('/profile/stats')])
      .then(([profileRes, statsRes]) => {
        const p = profileRes.data.user;
        setProfile(p);
        setUsername(p.username || '');
        setEmail(p.email || '');
        setDefaultTeamName(p.default_team_name || '');
        setVenmoHandle(p.venmo_handle || '');
        setNotifTurn(p.notif_turn !== 0);
        setNotifDraftStart(p.notif_draft_start !== 0);
        setNotifStandings(p.notif_standings_recap !== 0);
        setStats(statsRes.data.stats);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load profile'); setLoading(false); });
  }, []);

  // ── Save helpers ──────────────────────────────────────────────────────────
  function flashSaved(setter) {
    setter(true);
    setTimeout(() => setter(false), 2500);
  }

  async function saveAccount() {
    setAcctSaving(true);
    setError('');
    try {
      const res = await api.put('/profile', { username, email });
      setProfile(p => ({ ...p, ...res.data.user }));
      updateUser({ username: res.data.user.username, email: res.data.user.email });
      flashSaved(setAcctSaved);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save account settings');
    } finally {
      setAcctSaving(false);
    }
  }

  async function saveTeam() {
    setTeamSaving(true);
    try {
      const res = await api.put('/profile', { default_team_name: defaultTeamName });
      setProfile(p => ({ ...p, ...res.data.user }));
      flashSaved(setTeamSaved);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save team identity');
    } finally {
      setTeamSaving(false);
    }
  }

  async function saveVenmo() {
    setVenmoSaving(true);
    try {
      const res = await api.put('/profile', { venmo_handle: venmoHandle });
      setProfile(p => ({ ...p, ...res.data.user }));
      flashSaved(setVenmoSaved);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save payment handle');
    } finally {
      setVenmoSaving(false);
    }
  }

  async function saveNotifs() {
    setNotifSaving(true);
    try {
      const res = await api.put('/profile', {
        notif_turn: notifTurn,
        notif_draft_start: notifDraftStart,
        notif_standings_recap: notifStandings,
      });
      setProfile(p => ({ ...p, ...res.data.user }));
      flashSaved(setNotifSaved);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save notifications');
    } finally {
      setNotifSaving(false);
    }
  }

  async function changePassword() {
    setPwError('');
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return; }
    if (newPw.length < 6) { setPwError('Password must be at least 6 characters'); return; }
    setPwSaving(true);
    try {
      await api.put('/profile/password', { currentPassword: currentPw, newPassword: newPw });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      flashSaved(setPwSaved);
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  }

  async function uploadAvatar(file) {
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await api.post('/profile/avatar', fd);
      setProfile(p => ({ ...p, avatar_url: res.data.avatarUrl }));
    } catch (err) {
      setError(err.response?.data?.error || 'Avatar upload failed');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function removeAvatar() {
    setAvatarUploading(true);
    try {
      await api.delete('/profile/avatar');
      setProfile(p => ({ ...p, avatar_url: null }));
    } catch { setError('Failed to remove avatar'); }
    finally { setAvatarUploading(false); }
  }

  async function uploadLogo(file) {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await api.post('/profile/team-logo', fd);
      setProfile(p => ({ ...p, team_logo_url: res.data.logoUrl }));
    } catch (err) {
      setError(err.response?.data?.error || 'Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  }

  async function removeLogo() {
    setLogoUploading(true);
    try {
      await api.delete('/profile/team-logo');
      setProfile(p => ({ ...p, team_logo_url: null }));
    } catch { setError('Failed to remove logo'); }
    finally { setLogoUploading(false); }
  }

  function copyReferral() {
    const base = window.location.origin;
    navigator.clipboard.writeText(`${base}/register?ref=${profile.referral_code}`);
    setRefCopied(true);
    setTimeout(() => setRefCopied(false), 2000);
  }

  async function deleteAccount() {
    if (!deletePw) { setDeleteError('Enter your password to confirm'); return; }
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete('/profile', { data: { password: deletePw } });
      logout();
      navigate('/');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account');
      setDeleting(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return <BallLoader />;

  if (error && !profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const referralUrl = `${window.location.origin}/register?ref=${profile?.referral_code}`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center gap-4 mb-2">
        <div className="w-12 h-12 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Your Profile</h1>
          <p className="text-gray-500 text-sm">Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}</p>
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── 1. Account Settings ── */}
      <Card title="Account Settings" subtitle="Your login credentials and profile photo">
        <div className="space-y-5">
          <AvatarUploader
            src={profile?.avatar_url}
            name={profile?.username}
            onUpload={uploadAvatar}
            onRemove={removeAvatar}
            uploading={avatarUploading}
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Username">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input w-full"
                maxLength={30}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input w-full"
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <SaveButton loading={acctSaving} saved={acctSaved} onClick={saveAccount} />
          </div>
        </div>
      </Card>

      {/* ── 2. Change Password ── */}
      <Card title="Change Password">
        <div className="space-y-4">
          {pwError && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-300 rounded-lg px-3 py-2 text-sm">
              {pwError}
            </div>
          )}
          <Field label="Current Password">
            <input
              type="password"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              className="input w-full"
              placeholder="Enter current password"
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="New Password">
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                className="input w-full"
                placeholder="Min 6 characters"
              />
            </Field>
            <Field label="Confirm New Password">
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                className="input w-full"
                placeholder="Repeat new password"
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <SaveButton loading={pwSaving} saved={pwSaved} onClick={changePassword} label="Update Password" />
          </div>
        </div>
      </Card>

      {/* ── 3. Team Identity ── */}
      <Card title="Team Identity" subtitle="Your default team name and logo shown across leagues">
        <div className="space-y-5">
          <AvatarUploader
            src={profile?.team_logo_url}
            name={defaultTeamName || profile?.username}
            onUpload={uploadLogo}
            onRemove={removeLogo}
            uploading={logoUploading}
            placeholder="🏀"
          />
          <Field label="Default Team Name">
            <input
              type="text"
              value={defaultTeamName}
              onChange={e => setDefaultTeamName(e.target.value)}
              className="input w-full"
              maxLength={40}
              placeholder="e.g. Bracket Busters"
            />
            <p className="text-gray-600 text-xs mt-1">Used as the default when you join a new league</p>
          </Field>
          <div className="flex justify-end">
            <SaveButton loading={teamSaving} saved={teamSaved} onClick={saveTeam} />
          </div>
        </div>
      </Card>

      {/* ── 4. Venmo / Zelle ── */}
      <Card title="Payment Handle" subtitle="Used by commissioners to send you winnings">
        <div className="space-y-4">
          <Field label="Venmo or Zelle handle">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 select-none">@</span>
              <input
                type="text"
                value={venmoHandle}
                onChange={e => setVenmoHandle(e.target.value.replace(/^@/, ''))}
                className="input w-full pl-7"
                placeholder="your-handle"
                maxLength={50}
              />
            </div>
            <p className="text-gray-600 text-xs mt-1.5">
              Visible to commissioners when distributing prizes. Shown next to your team name on league pages.
            </p>
          </Field>
          <div className="flex justify-end">
            <SaveButton loading={venmoSaving} saved={venmoSaved} onClick={saveVenmo} />
          </div>
        </div>
      </Card>

      {/* ── 5. Email Notifications ── */}
      <Card title="Email Notifications" subtitle={`Sent to ${profile?.email}`}>
        <div className="space-y-4">
          <Toggle
            checked={notifDraftStart}
            onChange={setNotifDraftStart}
            label="When the draft starts in your league"
          />
          <div className="border-t border-gray-800" />
          <Toggle
            checked={notifTurn}
            onChange={setNotifTurn}
            label="When it's your turn to pick during a draft"
          />
          <div className="border-t border-gray-800" />
          <Toggle
            checked={notifStandings}
            onChange={setNotifStandings}
            label="Standings recap after each tournament round (R64, R32, Round of 16, Top 8, Semifinals, Championship)"
          />
          <div className="flex justify-end pt-2">
            <SaveButton loading={notifSaving} saved={notifSaved} onClick={saveNotifs} label="Save Preferences" />
          </div>
        </div>
      </Card>

      {/* ── 6. Stats ── */}
      <Card title="Your Stats">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Leagues Joined',  value: stats?.total_leagues ?? '—',                  color: 'text-brand-400' },
            { label: 'Best Finish',     value: ordinal(stats?.best_finish),                    color: 'text-amber-400' },
            { label: 'Championships',   value: stats?.wins ?? 0,                               color: 'text-yellow-400' },
            { label: 'Podium Finishes', value: stats?.podiums ?? 0,                            color: 'text-purple-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-xl px-4 py-4 text-center">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-gray-500 text-xs mt-1 leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 7. Referral ── */}
      <Card title="Refer a Friend" subtitle="Invite friends to TourneyRun">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-gray-800/60 rounded-xl px-4 py-4 text-center">
              <div className="text-2xl font-black text-brand-400">{profile?.referral_count ?? 0}</div>
              <div className="text-gray-500 text-xs mt-1">People referred</div>
            </div>
            <div className="bg-gray-800/60 rounded-xl px-4 py-4 text-center">
              <div className="text-lg font-black text-white font-mono tracking-widest">{profile?.referral_code || '—'}</div>
              <div className="text-gray-500 text-xs mt-1">Your referral code</div>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-400 text-sm font-mono truncate select-all">
              {referralUrl}
            </div>
            <button
              type="button"
              onClick={copyReferral}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                refCopied
                  ? 'bg-green-600 text-white'
                  : 'bg-brand-500 hover:bg-brand-400 text-white'
              }`}
            >
              {refCopied ? '✓ Copied' : 'Copy Link'}
            </button>
          </div>
        </div>
      </Card>

      {/* ── 8. Danger Zone ── */}
      <div className="bg-gray-900 border border-red-900/50 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-red-900/30 flex items-center gap-2">
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-base font-bold text-red-400">Danger Zone</h2>
        </div>
        <div className="p-6">
          {deleteStep === 0 && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-white font-semibold text-sm">Delete Account</p>
                <p className="text-gray-500 text-sm mt-0.5">Permanently delete your account and all data. This cannot be undone.</p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteStep(1)}
                className="shrink-0 px-4 py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-800 text-red-400 hover:text-red-300 rounded-lg text-sm font-semibold transition-all"
              >
                Delete Account
              </button>
            </div>
          )}

          {deleteStep === 1 && (
            <div className="space-y-4">
              <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4">
                <p className="text-red-300 font-bold text-sm mb-1">Are you absolutely sure?</p>
                <p className="text-gray-400 text-sm">This will permanently delete your account, remove you from all leagues, and erase all your data. You cannot undo this.</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteStep(0)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteStep(2)}
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  Yes, delete my account
                </button>
              </div>
            </div>
          )}

          {deleteStep === 2 && (
            <div className="space-y-4">
              <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4">
                <p className="text-red-300 font-bold text-sm">Final confirmation</p>
                <p className="text-gray-400 text-sm mt-1">Enter your password to permanently delete your account.</p>
              </div>
              {deleteError && (
                <p className="text-red-400 text-sm">{deleteError}</p>
              )}
              <Field label="Your Password">
                <input
                  type="password"
                  value={deletePw}
                  onChange={e => setDeletePw(e.target.value)}
                  className="input w-full border-red-900/50 focus:border-red-600"
                  placeholder="Enter your password"
                  onKeyDown={e => e.key === 'Enter' && deleteAccount()}
                />
              </Field>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setDeleteStep(0); setDeletePw(''); setDeleteError(''); }}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {deleting ? (
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : null}
                  Delete My Account Forever
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
