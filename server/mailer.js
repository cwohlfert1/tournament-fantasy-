const { Resend } = require('resend');

// ── Init ─────────────────────────────────────────────────────────────────────
let _resend;
if (process.env.RESEND_API_KEY) {
  _resend = new Resend(process.env.RESEND_API_KEY);
  console.log('[email] Resend configured ✓');
} else {
  console.warn('[email] WARNING: RESEND_API_KEY not set — emails will not be sent');
}

const FROM      = 'TourneyRun <noreply@tourneyrun.app>';
const FROM_GOLF = 'TourneyRun Golf <noreply@tourneyrun.app>';

// ── Core send ─────────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, from = FROM }) {
  if (!_resend) {
    console.warn('[email] Skipping email — RESEND_API_KEY not configured');
    return;
  }
  const { data, error } = await _resend.emails.send({ from, to, subject, html });
  if (error) throw new Error(error.message);
  return data;
}

// ── Batch send (up to 100 emails per call) ────────────────────────────────────
// emails: array of { to, subject, html, from? }
async function sendEmailBatch(emails) {
  if (!_resend) {
    console.warn('[email] Skipping batch — RESEND_API_KEY not configured');
    return;
  }
  const payload = emails.map(e => ({
    from:    e.from || FROM,
    to:      e.to,
    subject: e.subject,
    html:    e.html,
  }));
  const { data, error } = await _resend.batch.send(payload);
  if (error) throw new Error(error.message);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared HTML builder helpers (dark brand system — inline CSS only, no shorthand)
// bg #0f1923 · cards #1a2733 · green #22c55e · CTA text #0a1a10
// ─────────────────────────────────────────────────────────────────────────────

function emailShell(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0;background-color:#0f1923;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f1923;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
${content}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function emailHeader() {
  return `      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:20px;padding-left:32px;border-bottom-width:2px;border-bottom-style:solid;border-bottom-color:#22c55e;background-color:#0f1923;">
        <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;font-family:-apple-system,sans-serif;">tourney<span style="color:#22c55e;">run</span></span>
      </td></tr>`;
}

function emailFooter(note) {
  const text = note || 'tourneyrun.app &middot; Sent by your commissioner &middot; Unsubscribe';
  return `      <tr><td style="padding-top:16px;padding-right:32px;padding-bottom:16px;padding-left:32px;border-top-width:1px;border-top-style:solid;border-top-color:#1a2733;font-size:12px;color:#6b7280;text-align:center;background-color:#0f1923;">
        ${text}
      </td></tr>`;
}

// Single data card — no padding shorthand
function card(label, value) {
  return `<div style="background-color:#1a2733;border-radius:8px;padding-top:16px;padding-right:20px;padding-bottom:16px;padding-left:20px;margin-bottom:12px;">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${label}</div>
          <div style="font-size:15px;color:#ffffff;font-weight:500;">${value}</div>
        </div>`;
}

// Primary CTA button — full-width block, no padding shorthand
function ctaButton(href, label) {
  return `<a href="${href}" style="display:block;background-color:#22c55e;color:#0a1a10;padding-top:14px;padding-right:28px;padding-bottom:14px;padding-left:28px;border-radius:8px;font-weight:700;font-size:15px;text-align:center;text-decoration:none;margin-bottom:20px;">${label}</a>`;
}

// ── Password reset ────────────────────────────────────────────────────────────
async function sendPasswordReset(toEmail, resetUrl) {
  await sendEmail({
    to: toEmail,
    subject: 'Reset your TourneyRun password',
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Account Security</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:16px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">Reset your password</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">You requested a password reset for your TourneyRun account. Click the button below to set a new password. This link expires in <span style="color:#ffffff;font-weight:600;">1 hour</span>.</p>
        ${ctaButton(resetUrl, 'Reset Password &rarr;')}
        <p style="font-size:13px;color:#6b7280;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
      </td></tr>
${emailFooter('tourneyrun.app &middot; Security notice &middot; Do not share this link')}
`),
  });
}

// ── Welcome (new account) ─────────────────────────────────────────────────────
async function sendWelcome(toEmail, username) {
  const baseUrl = 'https://www.tourneyrun.app';

  await sendEmail({
    to: toEmail,
    subject: 'Welcome to TourneyRun 🏆',
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Getting Started</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">Welcome, ${username}!</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">You're in. Run fantasy pools for golf, basketball, and more &mdash; draft players, score points, and win your league's prize pool.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td style="padding-right:6px;">
              <a href="${baseUrl}/golf/create" style="display:block;background-color:#22c55e;color:#0a1a10;padding-top:13px;padding-right:0;padding-bottom:13px;padding-left:0;border-radius:8px;font-weight:700;font-size:14px;text-align:center;text-decoration:none;">Create a League &rarr;</a>
            </td>
            <td style="padding-left:6px;">
              <a href="${baseUrl}/golf/join" style="display:block;background-color:#1a2733;color:#ffffff;padding-top:12px;padding-right:0;padding-bottom:12px;padding-left:0;border-radius:8px;font-weight:600;font-size:14px;text-align:center;text-decoration:none;border-top-width:1px;border-top-style:solid;border-top-color:#374151;border-right-width:1px;border-right-style:solid;border-right-color:#374151;border-bottom-width:1px;border-bottom-style:solid;border-bottom-color:#374151;border-left-width:1px;border-left-style:solid;border-left-color:#374151;">Join a League</a>
            </td>
          </tr>
        </table>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">How it works</div>
        ${card('Step 1', '🏆 Create or join a pool for your favorite sport')}
        ${card('Step 2', '📊 Pick your players and track live scores')}
        ${card('Step 3', '💵 Win your league\'s prize pool')}
      </td></tr>
${emailFooter('tourneyrun.app &middot; Fantasy pools for every sport &middot; Payments powered by Square')}
`),
  });
}

// ── League standings (after each basketball round) ────────────────────────────
// standings: array of { username, team_name, total_points, aliveCount, totalPlayers }
// sorted descending by total_points
async function sendLeagueStandingsEmail(toEmail, { username, leagueName, roundName, standings, leagueId }) {
  const baseUrl   = 'https://www.tourneyrun.app';
  const leagueUrl = `${baseUrl}/basketball/leaderboard/${leagueId}`;

  const rows = standings.map((s, i) => {
    const rank  = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    const isYou = s.username === username;
    return `<tr style="background-color:${isYou ? '#162a1a' : 'transparent'};">
      <td style="padding-top:9px;padding-right:12px;padding-bottom:9px;padding-left:12px;font-size:14px;color:${isYou ? '#22c55e' : '#6b7280'};font-weight:${isYou ? '700' : '400'};">${medal}</td>
      <td style="padding-top:9px;padding-right:12px;padding-bottom:9px;padding-left:12px;font-size:14px;color:${isYou ? '#ffffff' : '#d1d5db'};font-weight:${isYou ? '700' : '400'};">${s.team_name || s.username}${isYou ? ' <span style="font-size:11px;color:#22c55e;">(you)</span>' : ''}</td>
      <td style="padding-top:9px;padding-right:12px;padding-bottom:9px;padding-left:12px;font-size:14px;color:${isYou ? '#22c55e' : '#9ca3af'};font-weight:600;text-align:right;">${s.total_points} pts</td>
      <td style="padding-top:9px;padding-right:12px;padding-bottom:9px;padding-left:12px;font-size:12px;color:#6b7280;text-align:right;">${s.aliveCount}/${s.totalPlayers}</td>
    </tr>`;
  }).join('');

  await sendEmail({
    to: toEmail,
    subject: `${roundName} complete — ${leagueName} standings`,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">${leagueName}</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">${roundName} complete 🏀</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">Here are the updated standings for your league.</p>
        <div style="background-color:#1a2733;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <thead>
              <tr style="border-bottom-width:1px;border-bottom-style:solid;border-bottom-color:#0f1923;">
                <th style="padding-top:10px;padding-right:12px;padding-bottom:10px;padding-left:12px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;text-align:left;font-weight:600;">#</th>
                <th style="padding-top:10px;padding-right:12px;padding-bottom:10px;padding-left:12px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;text-align:left;font-weight:600;">Team</th>
                <th style="padding-top:10px;padding-right:12px;padding-bottom:10px;padding-left:12px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;text-align:right;font-weight:600;">Points</th>
                <th style="padding-top:10px;padding-right:12px;padding-bottom:10px;padding-left:12px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;text-align:right;font-weight:600;">Alive</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${ctaButton(leagueUrl, 'View Full Leaderboard &rarr;')}
      </td></tr>
${emailFooter()}
`),
  });
}

// ── Golf: payment confirmation ────────────────────────────────────────────────
async function sendGolfPaymentConfirmation(toEmail, username, type, meta) {
  const baseUrl = 'https://www.tourneyrun.app';

  const subjects = {
    golf_season_pass: '⛳ Your 2026 Golf Season Pass is active',
    golf_pool_entry:  '⛳ Office Pool entry confirmed',
    golf_comm_pro:    '⛳ Commissioner Pro unlocked',
  };

  const bodies = {
    golf_season_pass: `You're in for the full 2026 PGA Tour season. Draft your roster, set your lineup every week, and make your run at the leaderboard.`,
    golf_pool_entry:  `Your picks for ${meta.tournament_name || 'the tournament'} are locked in. Good luck this week${meta.is_major ? ' — it\'s a Major, points &times; 1.5!' : '.'}`,
    golf_comm_pro:    `Commissioner Pro is active for your league. You now have access to auto-emails, payment tracking, FAAB results, CSV export, and more.`,
  };

  const subject  = subjects[type] || '⛳ TourneyRun Golf — Payment confirmed';
  const bodyText = bodies[type]   || 'Your payment was successful.';

  await sendEmail({
    from: FROM_GOLF,
    to:   toEmail,
    subject,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Fantasy Golf</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">Payment confirmed ✓</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">Hey ${username} &mdash; ${bodyText}</p>
        ${card('Status', '<span style="color:#22c55e;font-weight:600;">✓ Active</span>')}
        ${meta.tournament_name ? card('Tournament', meta.tournament_name) : ''}
        ${ctaButton(`${baseUrl}/golf/dashboard`, 'Go to Golf Dashboard &rarr;')}
      </td></tr>
${emailFooter('tourneyrun.app &middot; Skill-based golf fantasy &middot; Payments by Square')}
`),
  });
}

// ── Golf: Commissioner Pro unlocked ──────────────────────────────────────────
async function sendCommProUnlocked(toEmail, username, leagueName) {
  const baseUrl = 'https://www.tourneyrun.app';

  await sendEmail({
    from: FROM_GOLF,
    to:   toEmail,
    subject: '🏆 You unlocked Commissioner Pro — free for 2026!',
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Commissioner</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">Commissioner Pro unlocked! 🏆</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">Hey ${username}, your league <span style="color:#ffffff;font-weight:600;">${leagueName}</span> hit 6 members &mdash; so we unlocked Commissioner Pro for the 2026 season at no charge.</p>
        ${card('League', leagueName)}
        ${card('Unlocked Features', 'Auto-emails &middot; Payment tracker &middot; FAAB results &middot; CSV export &middot; Member roster &middot; Mass blast')}
        ${ctaButton(`${baseUrl}/golf/dashboard`, 'Open Commissioner Hub &rarr;')}
      </td></tr>
${emailFooter()}
`),
  });
}

// ── Golf: pool live ───────────────────────────────────────────────────────────
async function sendGolfPoolLive(toEmail, { username, leagueName, leagueId, spotsOpen, tournamentName }) {
  const leagueUrl = `https://www.tourneyrun.app/golf/league/${leagueId}`;

  await sendEmail({
    from: FROM_GOLF,
    to:   toEmail,
    subject: 'Your TourneyRun pool is live! ⛳',
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">${leagueName}</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">Your pool is live! ✅</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">Hey ${username} &mdash; <span style="color:#ffffff;font-weight:600;">${leagueName}</span> is open and ready for picks. Share the link below to get your group in before Thursday.</p>
        ${tournamentName ? card('Tournament', tournamentName) : ''}
        ${card('Open Spots', String(spotsOpen))}
        ${card('Invite Link', '<a href="' + leagueUrl + '" style="color:#22c55e;text-decoration:none;word-break:break-all;">' + leagueUrl + '</a>')}
        ${ctaButton(leagueUrl, 'Open Your Pool &rarr;')}
      </td></tr>
${emailFooter('tourneyrun.app &middot; Golf Pool Fantasy')}
`),
  });
}

// ── Golf: league welcome (new member added to pool) ───────────────────────────
// params: username, leagueName, leagueId, tournamentName, tournamentDates?,
//         picksDue?, golferCount?, tierCount?, prizeTotal?, prizePercent1st?
async function sendGolfLeagueWelcome(toEmail, { username, leagueName, leagueId, tournamentName, tournamentDates, picksDue, golferCount, tierCount, prizeTotal, prizePercent1st }) {
  const baseUrl   = 'https://www.tourneyrun.app';
  const leagueUrl = `${baseUrl}/golf/league/${leagueId}`;

  const tournamentValue = tournamentDates
    ? `${tournamentName} &middot; ${tournamentDates}`
    : tournamentName;

  const prizeLine = prizeTotal
    ? `$${prizeTotal}${prizePercent1st ? ` &mdash; ${prizePercent1st}% to 1st` : ''}`
    : null;

  const picksLabel = golferCount && tierCount
    ? `${golferCount} golfers across ${tierCount} tiers`
    : golferCount ? `${golferCount} golfers` : null;

  await sendEmail({
    from: FROM_GOLF,
    to:   toEmail,
    subject: `⛳ Welcome to ${leagueName} — you're in!`,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">${leagueName}</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">You're in!</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">Welcome, ${username}! You've been added to <span style="color:#ffffff;font-weight:600;">${leagueName}</span>. Here's everything you need to get started.</p>
        ${card('Tournament', tournamentValue)}
        ${picksDue ? card('Picks Due', picksDue) : ''}
        ${picksLabel ? card('Picks Per Team', picksLabel) : ''}
        ${prizeLine ? card('Prize Pool', prizeLine) : ''}
        ${ctaButton(`${leagueUrl}?tab=roster`, 'Make My Picks &rarr;')}
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">How it works</div>
        ${card('Pick ' + (golferCount || 'your') + ' golfers', 'Choose across tiers by odds. Higher tiers = longer odds, higher upside.')}
        ${card('Auto scoring', 'ESPN sync every 10 min. Watch your leaderboard update in real time.')}
        ${card('Lowest score wins', 'Combined strokes across all your golfers. Best card takes the pot.')}
      </td></tr>
${emailFooter()}
`),
  });
}

// ── Golf: commissioner mass blast ─────────────────────────────────────────────
// params: leagueName, leagueId, message (plain text — newlines become <br>)
async function sendGolfMassBlast(toEmail, { leagueName, leagueId, message }) {
  const baseUrl   = 'https://www.tourneyrun.app';
  const leagueUrl = `${baseUrl}/golf/league/${leagueId}`;

  await sendEmail({
    from: FROM_GOLF,
    to:   toEmail,
    subject: `📣 Message from your ${leagueName} commissioner`,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">${leagueName}</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:16px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">A message from your commissioner</h1>
        <div style="background-color:#1a2733;border-radius:8px;padding-top:20px;padding-right:24px;padding-bottom:20px;padding-left:24px;margin-bottom:24px;">
          <p style="font-size:15px;color:#ffffff;line-height:1.7;margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;">${message.replace(/\n/g, '<br>')}</p>
        </div>
        ${ctaButton(leagueUrl, 'View Your League &rarr;')}
      </td></tr>
${emailFooter()}
`),
  });
}

// ── Golf: round complete / score update ───────────────────────────────────────
// params: username, leagueName, leagueId, roundNumber,
//         myRank?, totalPlayers?, myScore? (integer, par-relative),
//         leaderName?, leaderScore?
async function sendGolfRoundComplete(toEmail, { username, leagueName, leagueId, roundNumber, myRank, totalPlayers, myScore, leaderName, leaderScore }) {
  const baseUrl   = 'https://www.tourneyrun.app';
  const leagueUrl = `${baseUrl}/golf/league/${leagueId}?tab=standings`;

  function fmtScore(s) {
    if (s == null) return '&mdash;';
    return s <= 0 ? String(s) : `+${s}`;
  }

  await sendEmail({
    from: FROM_GOLF,
    to:   toEmail,
    subject: `📊 Round ${roundNumber} complete — ${leagueName}`,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">${leagueName}</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">Round ${roundNumber} complete</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">Scores are in for ${leagueName}. Here's where you stand, ${username}.</p>
        ${myRank != null ? card('Your Rank', `#${myRank}${totalPlayers ? ' of ' + totalPlayers : ''}`) : ''}
        ${myScore != null ? card('Your Score', fmtScore(myScore)) : ''}
        ${leaderName ? card('Current Leader', `${leaderName} &mdash; ${fmtScore(leaderScore)}`) : ''}
        ${ctaButton(leagueUrl, 'View Standings &rarr;')}
      </td></tr>
${emailFooter()}
`),
  });
}

// ── Golf league invite ────────────────────────────────────────────────────────
// Sent when a commissioner imports members — invitee may not have an account yet.
async function sendGolfInviteEmail(toEmail, { leagueName, commissionerName, inviteToken, tournamentName }) {
  const baseUrl = 'https://www.tourneyrun.app';
  const signupUrl = `${baseUrl}/signup?token=${inviteToken}`;

  await sendEmail({
    from: FROM_GOLF,
    to: toEmail,
    subject: `You've been invited to join ${leagueName} on TourneyRun`,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">League Invite</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">You're invited!</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;"><span style="color:#ffffff;font-weight:600;">${commissionerName}</span> has added you to <span style="color:#22c55e;font-weight:600;">${leagueName}</span>${tournamentName ? ` for the <span style="color:#ffffff;">${tournamentName}</span>` : ''} on TourneyRun Fantasy Golf.</p>
        ${ctaButton(signupUrl, 'Accept Invite &amp; Create Account &rarr;')}
        <p style="font-size:13px;color:#6b7280;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:16px;margin-left:0;">This invite link is unique to you. Once you create your account, you'll be automatically added to the league and can submit your picks.</p>
        ${card('Your League', leagueName)}
        ${card('Invited By', commissionerName)}
        <p style="font-size:12px;color:#4b5563;line-height:1.6;margin-top:16px;margin-right:0;margin-bottom:0;margin-left:0;">If you weren't expecting this invitation, you can safely ignore this email.</p>
      </td></tr>
${emailFooter('tourneyrun.app &middot; Fantasy Golf &middot; Invite-only')}
`),
  });
}

// ── Super-admin mass blast (platform-wide) ────────────────────────────────────
// bodyText: plain text — double newlines become paragraph breaks,
//           single newlines become <br>, bare URLs become clickable links.
// firstName: display name used in greeting (from username).
function _plainToHtml(text) {
  // Auto-link bare URLs
  const linked = text.replace(
    /(https?:\/\/[^\s<>"]+)/g,
    '<a href="$1" style="color:#22c55e;text-decoration:none;word-break:break-all;">$1</a>'
  );
  // Paragraphs on double newline, breaks on single newline
  const paras = linked.split(/\n{2,}/).map(p =>
    `<p style="font-size:15px;color:#d1d5db;line-height:1.75;margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;">${p.replace(/\n/g, '<br>')}</p>`
  ).join('');
  return paras;
}

async function sendSuperAdminBlast(toEmail, firstName, subject, bodyText) {
  const displayName = firstName
    ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
    : 'there';

  // Personalize: replace [First Name] placeholder with actual name
  const personalizedBody = bodyText.replace(/\[First Name\]/gi, displayName);
  const bodyHtml = _plainToHtml(personalizedBody);

  await sendEmail({
    from: 'Collin @ TourneyRun <noreply@tourneyrun.app>',
    to:   toEmail,
    subject,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:32px;padding-right:36px;padding-bottom:8px;padding-left:36px;background-color:#0f1923;">
        ${bodyHtml}
        <div style="margin-top:24px;padding-top:20px;border-top-width:1px;border-top-style:solid;border-top-color:#1a2733;">
          <p style="font-size:13px;color:#6b7280;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;">
            Collin @ TourneyRun &mdash; <a href="https://www.tourneyrun.app" style="color:#4b5563;text-decoration:none;">tourneyrun.app</a>
          </p>
        </div>
      </td></tr>
${emailFooter('tourneyrun.app &middot; You\'re receiving this because you have a TourneyRun account')}
`),
  });
}

// ── Picks Lock Confirmation ───────────────────────────────────────────────────
// Sends one email per user with ALL their entries listed.
// entries: [{ entryNumber, teamName, tiebreaker, picks: [{ playerName, tierName, odds }] }]
async function sendPicksLockConfirmation(toEmail, { username, leagueName, tournamentName, entries, leagueUrl }) {
  const TIER_NAMES = { 1: 'Elite', 2: 'Premium', 3: 'Contenders', 4: 'Mid-Field', 5: 'Long Shots', 6: 'Deep Field', 7: 'Longshots' };

  const entrySections = entries.map(entry => {
    const entryLabel = entries.length > 1
      ? `<div style="font-size:12px;color:#22c55e;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;margin-top:${entries.indexOf(entry) > 0 ? '24px' : '0'};">Entry ${entry.entryNumber}${entry.teamName ? ` — ${entry.teamName}` : ''}</div>`
      : '';

    const pickRows = (entry.picks || []).map(p =>
      `<tr>
        <td style="padding-top:8px;padding-right:8px;padding-bottom:8px;padding-left:12px;font-size:11px;color:#6b7280;font-weight:600;white-space:nowrap;">T${p.tierNumber} · ${TIER_NAMES[p.tierNumber] || 'Tier ' + p.tierNumber}</td>
        <td style="padding-top:8px;padding-right:12px;padding-bottom:8px;padding-left:8px;font-size:14px;color:#ffffff;font-weight:600;">${p.playerName}</td>
        <td style="padding-top:8px;padding-right:12px;padding-bottom:8px;padding-left:8px;font-size:12px;color:#4b5563;text-align:right;">${p.odds || ''}</td>
      </tr>`
    ).join('');

    const tbLine = entry.tiebreaker != null
      ? `<div style="margin-top:10px;padding-top:8px;border-top-width:1px;border-top-style:solid;border-top-color:#1e293b;font-size:12px;color:#6b7280;">Tiebreaker: <span style="color:#a5b4fc;font-weight:700;">${entry.tiebreaker > 0 ? '+' : ''}${entry.tiebreaker}</span></div>`
      : '';

    return `${entryLabel}
      <div style="background-color:#1a2733;border-radius:8px;overflow:hidden;margin-bottom:8px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tbody>${pickRows}</tbody>
        </table>
        ${tbLine ? `<div style="padding-right:12px;padding-bottom:10px;padding-left:12px;">${tbLine}</div>` : ''}
      </div>`;
  }).join('');

  await sendEmail({
    from: FROM_GOLF,
    to: toEmail,
    subject: `Your picks are locked in — ${leagueName}`,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="display:inline-block;background-color:rgba(34,197,94,0.15);border-radius:6px;padding-top:4px;padding-right:10px;padding-bottom:4px;padding-left:10px;font-size:11px;color:#22c55e;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Picks Confirmed</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:24px;font-weight:700;color:#ffffff;">Your picks are locked in</h1>
        <p style="font-size:14px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">
          <strong style="color:#ffffff;">${leagueName}</strong> &middot; ${tournamentName}
        </p>
        ${entrySections}
        <div style="margin-top:20px;">
          ${ctaButton(leagueUrl, 'View Standings &rarr;')}
        </div>
        <p style="font-size:12px;color:#4b5563;text-align:center;margin-top:0;margin-bottom:0;">Good luck, ${username}!</p>
      </td></tr>
${emailFooter(`tourneyrun.app &middot; You're in ${leagueName} &middot; <a href="mailto:support@tourneyrun.app" style="color:#6b7280;">Unsubscribe</a>`)}
`),
  });
}

// ── Round End Standings Update ────────────────────────────────────────────────
// standings: [{ rank, teamName, score, isUser, entries: [{ entryNumber, teamName, rank, score }] }]
async function sendRoundStandings(toEmail, { username, leagueName, tournamentName, roundNumber, isFinal, winnerName, totalEntries, top5, userEntries, leagueUrl, scoringStyle }) {
  const isStroke = ['stroke_play', 'total_score', 'total_strokes'].includes(scoringStyle);
  const fmtScore = s => isStroke ? (s === 0 ? 'E' : (s > 0 ? '+' : '') + s) : s + ' pts';
  const ROUND_DAYS = { 1: 'Thursday', 2: 'Friday', 3: 'Saturday', 4: 'Sunday' };

  const subject = isFinal
    ? `${winnerName} wins ${leagueName}!`
    : `Round ${roundNumber} complete — ${tournamentName} standings`;

  const headingBadge = isFinal
    ? `<div style="display:inline-block;background-color:rgba(251,191,36,0.15);border-radius:6px;padding-top:4px;padding-right:10px;padding-bottom:4px;padding-left:10px;font-size:11px;color:#fbbf24;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Final Results</div>`
    : `<div style="display:inline-block;background-color:rgba(0,180,216,0.15);border-radius:6px;padding-top:4px;padding-right:10px;padding-bottom:4px;padding-left:10px;font-size:11px;color:#00b4d8;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Round ${roundNumber} Complete</div>`;

  const heading = isFinal
    ? `<h1 style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:24px;font-weight:700;color:#ffffff;">🏆 ${winnerName} wins!</h1>`
    : `<h1 style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-size:24px;font-weight:700;color:#ffffff;">Round ${roundNumber} complete</h1>`;

  const top5Rows = top5.map((s, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${s.rank}.`;
    return `<tr>
      <td style="padding-top:9px;padding-right:8px;padding-bottom:9px;padding-left:12px;font-size:14px;color:#6b7280;font-weight:600;">${medal}</td>
      <td style="padding-top:9px;padding-right:8px;padding-bottom:9px;padding-left:8px;font-size:14px;color:#ffffff;font-weight:600;">${s.teamName}</td>
      <td style="padding-top:9px;padding-right:12px;padding-bottom:9px;padding-left:8px;font-size:14px;color:${isStroke ? (s.score < 0 ? '#22c55e' : '#ef4444') : '#22c55e'};font-weight:700;text-align:right;">${fmtScore(s.score)}</td>
    </tr>`;
  }).join('');

  const userSection = userEntries.map(e =>
    `<div style="background-color:#1a2733;border-radius:8px;padding-top:12px;padding-right:16px;padding-bottom:12px;padding-left:16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:14px;color:#ffffff;font-weight:600;">${e.teamName}${userEntries.length > 1 ? ` <span style="color:#6b7280;font-size:11px;">Entry ${e.entryNumber}</span>` : ''}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">${ordinal(e.rank)} of ${totalEntries}</div>
      </div>
      <div style="font-size:18px;font-weight:800;color:${isStroke ? (e.score < 0 ? '#22c55e' : '#ef4444') : '#22c55e'};">${fmtScore(e.score)}</div>
    </div>`
  ).join('');

  const nextRound = !isFinal && roundNumber < 4
    ? `<p style="font-size:13px;color:#6b7280;text-align:center;margin-top:16px;margin-bottom:0;">Round ${roundNumber + 1} begins ${ROUND_DAYS[roundNumber + 1] || 'tomorrow'} at ~8am ET</p>`
    : isFinal
      ? `<p style="font-size:14px;color:#9ca3af;text-align:center;margin-top:16px;margin-bottom:0;">Thanks for playing! 🏌️</p>`
      : '';

  await sendEmail({
    from: FROM_GOLF,
    to: toEmail,
    subject,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        ${headingBadge}
        ${heading}
        <p style="font-size:14px;color:#9ca3af;margin-top:0;margin-bottom:24px;">
          <strong style="color:#ffffff;">${leagueName}</strong> &middot; ${tournamentName} &middot; ${totalEntries} entries
        </p>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Leaderboard</div>
        <div style="background-color:#1a2733;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tbody>${top5Rows}</tbody>
          </table>
        </div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">${isFinal ? 'Your final position' : 'Your entry'}</div>
        ${userSection}
        <div style="margin-top:20px;">
          ${ctaButton(leagueUrl, 'View Full Standings &rarr;')}
        </div>
        ${nextRound}
      </td></tr>
${emailFooter(`tourneyrun.app &middot; You're in ${leagueName} &middot; <a href="mailto:support@tourneyrun.app" style="color:#6b7280;">Unsubscribe</a>`)}
`),
  });
}

// Ordinal helper: 1→1st, 2→2nd, 3→3rd, etc.
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

module.exports = {
  sendEmail,
  sendEmailBatch,
  sendPasswordReset,
  sendWelcome,
  sendLeagueStandingsEmail,
  sendGolfPaymentConfirmation,
  sendCommProUnlocked,
  sendGolfPoolLive,
  sendGolfLeagueWelcome,
  sendGolfMassBlast,
  sendGolfRoundComplete,
  sendGolfInviteEmail,
  sendSuperAdminBlast,
  sendPicksLockConfirmation,
  sendRoundStandings,
  sendPayReminder,
  sendCommUnpaidNotice,
  sendUnpaidReminder,
  sendCommissionerBlast,
};

// ── Pay reminder to unpaid member ────────────────────────────────────────────
async function sendPayReminder(toEmail, { username, leagueName, buyIn, commissionerName, paymentMethods, lockTime }) {
  const fmtLock = lockTime ? new Date(lockTime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET' : 'soon';
  let methodsLine = '';
  try {
    const methods = typeof paymentMethods === 'string' ? JSON.parse(paymentMethods) : (paymentMethods || []);
    if (methods.length) methodsLine = `Payment methods: ${methods.join(', ')}`;
  } catch {}

  await sendEmail({
    from: FROM_GOLF,
    to: toEmail,
    subject: `Don't forget — pay your buy-in for ${leagueName}`,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="display:inline-block;background-color:rgba(251,191,36,0.15);border-radius:6px;padding-top:4px;padding-right:10px;padding-bottom:4px;padding-left:10px;font-size:11px;color:#fbbf24;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Payment Reminder</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:22px;font-weight:700;color:#ffffff;">Hey ${username}, your buy-in is due</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:20px;margin-left:0;">
          Your <strong style="color:#ffffff;">$${buyIn}</strong> buy-in for <strong style="color:#ffffff;">${leagueName}</strong> hasn't been paid yet. Picks lock <strong style="color:#fbbf24;">${fmtLock}</strong>.
        </p>
        ${methodsLine ? card('Payment Methods', methodsLine) : ''}
        ${commissionerName ? `<p style="font-size:13px;color:#6b7280;margin-top:12px;margin-bottom:0;">Sent by ${commissionerName}, your pool commissioner.</p>` : ''}
      </td></tr>
${emailFooter(`tourneyrun.app &middot; ${leagueName} &middot; <a href="mailto:support@tourneyrun.app" style="color:#6b7280;">Unsubscribe</a>`)}
`),
  });
}

// ── Commissioner notification: unpaid entries at lock time ────────────────────
async function sendCommUnpaidNotice(toEmail, { commName, leagueName, unpaidMembers, paidCount, totalEntries, paidPrizePool, expectedPrizePool, leagueUrl }) {
  const rows = unpaidMembers.map(m =>
    `<tr>
      <td style="padding-top:6px;padding-bottom:6px;padding-left:12px;font-size:14px;color:#ffffff;">${m.teamName}</td>
      <td style="padding-top:6px;padding-bottom:6px;padding-left:8px;font-size:13px;color:#6b7280;">${m.username}</td>
      <td style="padding-top:6px;padding-bottom:6px;padding-right:12px;font-size:12px;color:#f87171;text-align:right;">Unpaid</td>
    </tr>`
  ).join('');

  await sendEmail({
    from: FROM_GOLF,
    to: toEmail,
    subject: `Picks locked — ${unpaidMembers.length} entr${unpaidMembers.length === 1 ? 'y' : 'ies'} still unpaid in ${leagueName}`,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="display:inline-block;background-color:rgba(239,68,68,0.15);border-radius:6px;padding-top:4px;padding-right:10px;padding-bottom:4px;padding-left:10px;font-size:11px;color:#f87171;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Attention Required</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:22px;font-weight:700;color:#ffffff;">Picks locked — unpaid entries</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:20px;margin-left:0;">
          ${unpaidMembers.length} entr${unpaidMembers.length === 1 ? 'y' : 'ies'} in <strong style="color:#fff;">${leagueName}</strong> locked in without paying.
        </p>
        ${card('Prize Pool', `$${paidPrizePool} from ${paidCount} paid entries (of ${totalEntries} total)`)}
        ${expectedPrizePool > paidPrizePool ? card('Expected if all paid', `$${expectedPrizePool}`) : ''}
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Unpaid Entries</div>
        <div style="background-color:#1a2733;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${ctaButton(leagueUrl, 'Mark as Paid in Commissioner Hub &rarr;')}
      </td></tr>
${emailFooter('tourneyrun.app &middot; Commissioner notification')}
`),
  });
}

// ── Commissioner-triggered payment reminder (unpaid-entry-guard feature) ─────
// Sent once per unpaid entrant when the commissioner clicks "Send Payment
// Reminder" in the Unpaid Entries panel. Separate from sendPayReminder — this
// one is worded for the post-picks-in phase (scores won't count until paid).
async function sendUnpaidReminder(toEmail, { firstName, poolName, tournamentName, amount, commissionerName }) {
  const name = firstName || 'there';
  const comm = commissionerName || 'your commissioner';
  const amt = (typeof amount === 'number' ? amount : parseFloat(amount) || 0).toFixed(2);
  await sendEmail({
    from: FROM_GOLF,
    to: toEmail,
    subject: `Payment reminder: ${poolName} — ${tournamentName}`,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:22px;font-weight:700;color:#ffffff;">Hi ${name},</h1>
        <p style="font-size:15px;color:#d1d5db;line-height:1.7;margin-top:0;margin-right:0;margin-bottom:14px;margin-left:0;">
          You're entered in <strong style="color:#ffffff;">${poolName}</strong> for <strong style="color:#ffffff;">${tournamentName}</strong> but your entry fee of <strong style="color:#ffffff;">$${amt}</strong> hasn't been marked as paid yet.
        </p>
        <p style="font-size:15px;color:#d1d5db;line-height:1.7;margin-top:0;margin-right:0;margin-bottom:14px;margin-left:0;">
          Your picks are in but your score won't count until payment is confirmed. Please send payment to <strong style="color:#ffffff;">${comm}</strong> to get on the board.
        </p>
        <p style="font-size:15px;color:#d1d5db;line-height:1.7;margin-top:0;margin-right:0;margin-bottom:14px;margin-left:0;">
          Once paid, <strong style="color:#ffffff;">${comm}</strong> will mark you as paid and your score will go live.
        </p>
        <p style="font-size:15px;color:#9ca3af;line-height:1.7;margin-top:0;margin-right:0;margin-bottom:6px;margin-left:0;">Good luck!</p>
        <p style="font-size:13px;color:#6b7280;margin-top:0;margin-bottom:0;">&mdash; The TourneyRun Team</p>
      </td></tr>
${emailFooter(`tourneyrun.app &middot; ${poolName}`)}
`),
  });
}

// ── Commissioner-authored blast ──────────────────────────────────────────────
// Generic message-from-commissioner template. Subject/body are user input,
// so we HTML-escape both to prevent injection. Body line-breaks are preserved
// via <br> so plain-text input from a textarea renders the way it was typed.
function _esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
async function sendCommissionerBlast(toEmail, { firstName, poolName, tournamentName, subject, body, commissionerName }) {
  const name = firstName || 'there';
  const comm = commissionerName || 'your commissioner';
  const safeBody = _esc(body).replace(/\r?\n/g, '<br>');
  const safeSubj = _esc(subject);
  const safePool = _esc(poolName || '');
  const safeTourn = _esc(tournamentName || '');
  await sendEmail({
    from: FROM_GOLF,
    to: toEmail,
    subject: safeSubj,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="display:inline-block;background-color:rgba(34,197,94,0.12);border-radius:6px;padding-top:4px;padding-right:10px;padding-bottom:4px;padding-left:10px;font-size:11px;color:#4ade80;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Commissioner Update</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:6px;margin-left:0;font-size:22px;font-weight:700;color:#ffffff;">${safeSubj}</h1>
        <p style="font-size:13px;color:#6b7280;margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;">From <strong style="color:#9ca3af;">${_esc(comm)}</strong> &middot; ${safePool}${safeTourn ? ' &middot; ' + safeTourn : ''}</p>
        <p style="font-size:14px;color:#9ca3af;line-height:1.5;margin-top:0;margin-right:0;margin-bottom:14px;margin-left:0;">Hi ${_esc(name)},</p>
        <div style="font-size:15px;color:#d1d5db;line-height:1.7;margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;">${safeBody}</div>
        <p style="font-size:13px;color:#6b7280;margin-top:0;margin-bottom:0;border-top:1px solid #1f2937;padding-top:12px;">Sent via TourneyRun on behalf of ${_esc(comm)}.</p>
      </td></tr>
${emailFooter(`tourneyrun.app &middot; ${safePool}`)}
`),
  });
}
