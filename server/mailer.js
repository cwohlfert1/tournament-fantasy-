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
  const baseUrl = (process.env.CLIENT_URL || 'https://tourneyrun.app').replace(/\/$/, '');

  await sendEmail({
    to: toEmail,
    subject: 'Welcome to TourneyRun ⛳',
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Getting Started</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">Welcome, ${username}!</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">You're in. Draft real college basketball players, score points every time they score, and win your league's prize pool.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr>
            <td style="padding-right:6px;">
              <a href="${baseUrl}/basketball/create-league" style="display:block;background-color:#22c55e;color:#0a1a10;padding-top:13px;padding-right:0;padding-bottom:13px;padding-left:0;border-radius:8px;font-weight:700;font-size:14px;text-align:center;text-decoration:none;">Create a League &rarr;</a>
            </td>
            <td style="padding-left:6px;">
              <a href="${baseUrl}/basketball/join-league" style="display:block;background-color:#1a2733;color:#ffffff;padding-top:12px;padding-right:0;padding-bottom:12px;padding-left:0;border-radius:8px;font-weight:600;font-size:14px;text-align:center;text-decoration:none;border-top-width:1px;border-top-style:solid;border-top-color:#374151;border-right-width:1px;border-right-style:solid;border-right-color:#374151;border-bottom-width:1px;border-bottom-style:solid;border-bottom-color:#374151;border-left-width:1px;border-left-style:solid;border-left-color:#374151;">Join a League</a>
            </td>
          </tr>
        </table>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">How it works</div>
        ${card('Step 1', '&#127919; Draft real college basketball players')}
        ${card('Step 2', '&#128202; Score points every time they score')}
        ${card('Step 3', '&#128181; Win your league\'s prize pool')}
      </td></tr>
${emailFooter('tourneyrun.app &middot; Skill-based fantasy &middot; Payments powered by Stripe')}
`),
  });
}

// ── League standings (after each basketball round) ────────────────────────────
// standings: array of { username, team_name, total_points, aliveCount, totalPlayers }
// sorted descending by total_points
async function sendLeagueStandingsEmail(toEmail, { username, leagueName, roundName, standings, leagueId }) {
  const baseUrl   = (process.env.CLIENT_URL || 'https://tourneyrun.app').replace(/\/$/, '');
  const leagueUrl = `${baseUrl}/basketball/leaderboard/${leagueId}`;

  const rows = standings.map((s, i) => {
    const rank  = i + 1;
    const medal = rank === 1 ? '&#129351;' : rank === 2 ? '&#129352;' : rank === 3 ? '&#129353;' : `${rank}.`;
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
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">${roundName} complete &#127936;</h1>
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
  const baseUrl = (process.env.CLIENT_URL || 'https://tourneyrun.app').replace(/\/$/, '');

  const subjects = {
    golf_season_pass: '&#9971; Your 2026 Golf Season Pass is active',
    golf_pool_entry:  '&#9971; Office Pool entry confirmed',
    golf_comm_pro:    '&#9971; Commissioner Pro unlocked',
  };

  const bodies = {
    golf_season_pass: `You're in for the full 2026 PGA Tour season. Draft your roster, set your lineup every week, and make your run at the leaderboard.`,
    golf_pool_entry:  `Your picks for ${meta.tournament_name || 'the tournament'} are locked in. Good luck this week${meta.is_major ? ' — it\'s a Major, points &times; 1.5!' : '.'}`,
    golf_comm_pro:    `Commissioner Pro is active for your league. You now have access to auto-emails, payment tracking, FAAB results, CSV export, and more.`,
  };

  const subject  = subjects[type] || '&#9971; TourneyRun Golf — Payment confirmed';
  const bodyText = bodies[type]   || 'Your payment was successful.';

  await sendEmail({
    from: FROM_GOLF,
    to:   toEmail,
    subject,
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Fantasy Golf</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">Payment confirmed &#10003;</h1>
        <p style="font-size:15px;color:#9ca3af;line-height:1.6;margin-top:0;margin-right:0;margin-bottom:24px;margin-left:0;">Hey ${username} &mdash; ${bodyText}</p>
        ${card('Status', '<span style="color:#22c55e;font-weight:600;">&#10003; Active</span>')}
        ${meta.tournament_name ? card('Tournament', meta.tournament_name) : ''}
        ${ctaButton(`${baseUrl}/golf/dashboard`, 'Go to Golf Dashboard &rarr;')}
      </td></tr>
${emailFooter('tourneyrun.app &middot; Skill-based golf fantasy &middot; Payments by Square')}
`),
  });
}

// ── Golf: Commissioner Pro unlocked ──────────────────────────────────────────
async function sendCommProUnlocked(toEmail, username, leagueName) {
  const baseUrl = (process.env.CLIENT_URL || 'https://tourneyrun.app').replace(/\/$/, '');

  await sendEmail({
    from: FROM_GOLF,
    to:   toEmail,
    subject: '&#127942; You unlocked Commissioner Pro — free for 2026!',
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">Commissioner</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">Commissioner Pro unlocked! &#127942;</h1>
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
    subject: 'Your TourneyRun pool is live! &#127952;',
    html: emailShell(`
${emailHeader()}
      <tr><td style="padding-top:28px;padding-right:32px;padding-bottom:28px;padding-left:32px;background-color:#0f1923;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:16px;">${leagueName}</div>
        <h1 style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-size:26px;font-weight:700;color:#ffffff;">Your pool is live! &#9989;</h1>
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
  const baseUrl   = (process.env.CLIENT_URL || 'https://tourneyrun.app').replace(/\/$/, '');
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
    subject: `&#9971; Welcome to ${leagueName} — you're in!`,
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
  const baseUrl   = (process.env.CLIENT_URL || 'https://tourneyrun.app').replace(/\/$/, '');
  const leagueUrl = `${baseUrl}/golf/league/${leagueId}`;

  await sendEmail({
    from: FROM_GOLF,
    to:   toEmail,
    subject: `&#128227; Message from your ${leagueName} commissioner`,
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
  const baseUrl   = (process.env.CLIENT_URL || 'https://tourneyrun.app').replace(/\/$/, '');
  const leagueUrl = `${baseUrl}/golf/league/${leagueId}?tab=standings`;

  function fmtScore(s) {
    if (s == null) return '&mdash;';
    return s <= 0 ? String(s) : `+${s}`;
  }

  await sendEmail({
    from: FROM_GOLF,
    to:   toEmail,
    subject: `&#128202; Round ${roundNumber} complete &mdash; ${leagueName}`,
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
  const baseUrl = (process.env.CLIENT_URL || 'https://tourneyrun.app').replace(/\/$/, '');
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
};
