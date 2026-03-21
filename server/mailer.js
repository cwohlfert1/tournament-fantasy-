const nodemailer = require('nodemailer');

// Warn on startup if SMTP is not configured — emails will fail silently otherwise
if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) {
  console.warn('[mailer] WARNING: MAIL_HOST, MAIL_USER, or MAIL_PASS is not set — password reset emails will fail');
}

function getTransport() {
  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS } = process.env;
  if (!MAIL_HOST || !MAIL_USER || !MAIL_PASS) {
    throw new Error('Email is not configured on this server (MAIL_HOST, MAIL_USER, MAIL_PASS required)');
  }
  return nodemailer.createTransport({
    host: MAIL_HOST,
    port: parseInt(MAIL_PORT || '587', 10),
    secure: parseInt(MAIL_PORT || '587', 10) === 465,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
    connectionTimeout: 8000,  // abort if SMTP server doesn't respond in 8s
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
}

async function sendPasswordReset(toEmail, resetUrl) {
  const transport = getTransport();
  const from = process.env.MAIL_FROM || process.env.MAIL_USER;
  await transport.sendMail({
    from: `"TourneyRun" <${from}>`,
    to: toEmail,
    subject: 'Reset your TourneyRun password',
    text: `You requested a password reset.\n\nClick the link below to set a new password (expires in 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#378ADD;">Reset your password</h2>
        <p>You requested a password reset for your TourneyRun account.</p>
        <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
        <p style="margin:24px 0;">
          <a href="${resetUrl}" style="background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
            Reset Password
          </a>
        </p>
        <p style="color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #333;margin-top:32px;" />
        <p style="color:#555;font-size:12px;">TourneyRun — Player Pool Fantasy</p>
      </div>
    `,
  });
}

async function sendWelcome(toEmail, username) {
  const transport = getTransport();
  const from = process.env.MAIL_FROM || process.env.MAIL_USER;
  const baseUrl = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.replace(/\/$/, '')
    : 'https://tourneyrun.com';

  await transport.sendMail({
    from: `"TourneyRun" <${from}>`,
    to: toEmail,
    subject: 'Welcome to TourneyRun 🏀',
    text: `Hey ${username},\n\nYou're in. Now create a league, draft your players, and win some money. The 2026 Tournament starts March 20th — don't sleep on it.\n\nCreate a League: ${baseUrl}/create-league\nJoin a League: ${baseUrl}/join-league\n\nHow it works:\n• Draft real college basketball players\n• Score points every time they score\n• Win your league's prize pool\n\nGood luck out there. May your players stay healthy and your seeds hold.\n— The TourneyRun Team`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Top accent line -->
        <tr><td style="background:linear-gradient(90deg,transparent,#378ADD,transparent);height:2px;border-radius:2px;"></td></tr>

        <!-- Card -->
        <tr><td style="background:#111113;border:1px solid #1f2937;border-top:none;border-radius:0 0 16px 16px;padding:36px 36px 32px;">

          <!-- Logo -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td align="center">
                <span style="font-size:40px;line-height:1;">🏀</span>
                <div style="margin-top:8px;">
                  <span style="font-size:22px;font-weight:300;color:#B5D4F4;letter-spacing:-0.02em;">tourney</span><span style="font-size:22px;font-weight:800;color:#378ADD;letter-spacing:-0.02em;">run</span>
                </div>
                <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#555;margin-top:3px;">Player Pool Fantasy</div>
              </td>
            </tr>
          </table>

          <!-- Headline -->
          <h1 style="margin:0 0 12px;font-size:26px;font-weight:900;color:#ffffff;text-align:center;line-height:1.2;">
            Welcome to TourneyRun, ${username}!
          </h1>

          <!-- Subhead -->
          <p style="margin:0 0 28px;font-size:15px;color:#9ca3af;text-align:center;line-height:1.6;">
            You're in. Now create a league, draft your players, and win some money.<br>
            <span style="color:#ffffff;font-weight:600;">The 2026 Tournament starts March 20th</span> — don't sleep on it.
          </p>

          <!-- CTA buttons -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
            <tr>
              <td align="center" style="padding:0 4px;">
                <a href="${baseUrl}/create-league"
                  style="display:inline-block;background:linear-gradient(135deg,#378ADD,#2563EB);color:#ffffff;font-weight:800;font-size:14px;text-decoration:none;padding:13px 28px;border-radius:10px;letter-spacing:0.01em;">
                  Create a League →
                </a>
              </td>
              <td align="center" style="padding:0 4px;">
                <a href="${baseUrl}/join-league"
                  style="display:inline-block;background:transparent;border:1.5px solid #374151;color:#d1d5db;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:10px;">
                  Join a League
                </a>
              </td>
            </tr>
          </table>

          <!-- Divider -->
          <div style="border-top:1px solid #1f2937;margin-bottom:24px;"></div>

          <!-- How it works -->
          <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;color:#378ADD;">How it works</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:28px;">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #1a1f2a;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:18px;padding-right:12px;vertical-align:middle;">🎯</td>
                  <td style="font-size:14px;color:#d1d5db;vertical-align:middle;">Draft real college basketball players</td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #1a1f2a;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:18px;padding-right:12px;vertical-align:middle;">📊</td>
                  <td style="font-size:14px;color:#d1d5db;vertical-align:middle;">Score points every time they score</td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:18px;padding-right:12px;vertical-align:middle;">💵</td>
                  <td style="font-size:14px;color:#d1d5db;vertical-align:middle;">Win your league's prize pool</td>
                </tr></table>
              </td>
            </tr>
          </table>

          <!-- Footer message -->
          <div style="background:#0d1117;border:1px solid #1f2937;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;font-style:italic;">
              Good luck out there. May your players stay healthy and your seeds hold.
            </p>
            <p style="margin:6px 0 0;font-size:13px;color:#378ADD;font-weight:600;">— The TourneyRun Team</p>
          </div>

          <!-- Legal footer -->
          <p style="margin:0;font-size:11px;color:#374151;text-align:center;line-height:1.6;">
            TourneyRun · Skill-based fantasy game · Payments powered by Stripe<br>
            Not available in WA, ID, MT, NV, LA
          </p>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `,
  });
}

async function sendGolfPaymentConfirmation(toEmail, username, type, meta) {
  const transport = getTransport();
  const from = process.env.MAIL_FROM || process.env.MAIL_USER;
  const baseUrl = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.replace(/\/$/, '')
    : 'https://tourneyrun.app';

  const subjects = {
    golf_season_pass: '⛳ Your 2026 Golf Season Pass is active',
    golf_pool_entry:  '⛳ Office Pool entry confirmed',
    golf_comm_pro:    '⛳ Commissioner Pro unlocked',
  };

  const bodies = {
    golf_season_pass: `You're in for the full 2026 PGA Tour season. Draft your roster, set your lineup every week, and make your run at the leaderboard.`,
    golf_pool_entry:  `Your picks for ${meta.tournament_name || 'the tournament'} are locked in. Good luck this week${meta.is_major ? ' — it\'s a Major, points × 1.5!' : '.'}`,
    golf_comm_pro:    `Commissioner Pro is active for your league. You now have access to auto-emails, payment tracking, FAAB results, CSV export, and more.`,
  };

  const subject = subjects[type] || '⛳ TourneyRun Golf — Payment confirmed';
  const body    = bodies[type]   || 'Your payment was successful.';

  await transport.sendMail({
    from: `"TourneyRun Golf" <${from}>`,
    to: toEmail,
    subject,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#050f08;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050f08;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="background:linear-gradient(90deg,transparent,#22c55e,transparent);height:2px;border-radius:2px;"></td></tr>
        <tr><td style="background:#0a1a0f;border:1px solid #14532d55;border-top:none;border-radius:0 0 16px 16px;padding:36px 36px 32px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="font-size:36px;">⛳</div>
            <div style="margin-top:8px;">
              <span style="font-size:20px;font-weight:300;color:#86efac;">tourney</span><span style="font-size:20px;font-weight:800;color:#22c55e;">run</span>
            </div>
            <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#166534;margin-top:3px;">Golf Fantasy</div>
          </div>
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#ffffff;text-align:center;">
            Payment confirmed ✓
          </h1>
          <p style="margin:0 0 24px;font-size:15px;color:#86efac;text-align:center;line-height:1.6;">
            Hey ${username} — ${body}
          </p>
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${baseUrl}/golf/dashboard" style="display:inline-block;background:#16a34a;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:10px;">
              Go to Golf Dashboard →
            </a>
          </div>
          <p style="margin:0;font-size:11px;color:#166534;text-align:center;">
            TourneyRun · Skill-based golf fantasy · Payments by Stripe<br>
            Not available in WA, ID, MT, NV, LA
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

async function sendCommProUnlocked(toEmail, username, leagueName) {
  const transport = getTransport();
  const from = process.env.MAIL_FROM || process.env.MAIL_USER;
  const baseUrl = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.replace(/\/$/, '')
    : 'https://tourneyrun.app';

  await transport.sendMail({
    from: `"TourneyRun Golf" <${from}>`,
    to: toEmail,
    subject: '🏆 You unlocked Commissioner Pro — free for 2026!',
    html: `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#050f08;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050f08;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="background:linear-gradient(90deg,transparent,#22c55e,transparent);height:2px;border-radius:2px;"></td></tr>
        <tr><td style="background:#0a1a0f;border:1px solid #14532d55;border-top:none;border-radius:0 0 16px 16px;padding:36px 36px 32px;">
          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:40px;">🏆</div>
          </div>
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#ffffff;text-align:center;">
            Commissioner Pro — unlocked free!
          </h1>
          <p style="margin:0 0 20px;font-size:15px;color:#86efac;text-align:center;line-height:1.6;">
            Hey ${username}, your league <strong style="color:#ffffff;">${leagueName}</strong> hit 6 members — so we unlocked Commissioner Pro for the 2026 season at no charge.
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#4ade80;text-align:center;line-height:1.6;">
            Auto-emails · Payment tracker · FAAB results · CSV export · Member roster · Mass blast
          </p>
          <div style="text-align:center;">
            <a href="${baseUrl}/golf/dashboard" style="display:inline-block;background:#16a34a;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:10px;">
              Open Commissioner Hub →
            </a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

async function sendGolfPoolLive(toEmail, { username, leagueName, leagueId, spotsOpen, tournamentName }) {
  const transport = getTransport();
  const from = process.env.MAIL_FROM || process.env.MAIL_USER;
  const leagueUrl = `https://www.tourneyrun.app/golf/league/${leagueId}`;

  const tournamentLine = tournamentName
    ? `<tr><td style="padding:10px 0;border-bottom:1px solid #0d2016;">
         <table cellpadding="0" cellspacing="0"><tr>
           <td style="font-size:16px;padding-right:12px;vertical-align:middle;">🏆</td>
           <td style="font-size:14px;color:#d1d5db;vertical-align:middle;">Tournament: <strong style="color:#fff;">${tournamentName}</strong></td>
         </tr></table>
       </td></tr>`
    : '';

  await transport.sendMail({
    from: `"TourneyRun Golf" <${from}>`,
    to: toEmail,
    subject: `Your TourneyRun pool is live! 🏌️`,
    text: `Hey ${username},\n\nYour pool "${leagueName}" is live and ready for players.\n\nInvite link: ${leagueUrl}\nOpen spots: ${spotsOpen}${tournamentName ? `\nTournament: ${tournamentName}` : ''}\n\nShare the invite link with your group and get picks in before Thursday.\n\n— The TourneyRun Team`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#050f08;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050f08;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="background:linear-gradient(90deg,transparent,#22c55e,transparent);height:2px;border-radius:2px;"></td></tr>
        <tr><td style="background:#0a1a0f;border:1px solid #14532d55;border-top:none;border-radius:0 0 16px 16px;padding:36px 36px 32px;">

          <div style="text-align:center;margin-bottom:24px;">
            <div style="font-size:40px;">🏌️</div>
            <div style="margin-top:8px;">
              <span style="font-size:20px;font-weight:300;color:#86efac;">tourney</span><span style="font-size:20px;font-weight:800;color:#22c55e;">run</span>
            </div>
          </div>

          <h1 style="margin:0 0 8px;font-size:24px;font-weight:900;color:#ffffff;text-align:center;">
            Your pool is live! ✅
          </h1>
          <p style="margin:0 0 28px;font-size:15px;color:#86efac;text-align:center;line-height:1.6;">
            Hey ${username} — <strong style="color:#fff;">${leagueName}</strong> is open and ready for picks.
          </p>

          <!-- Pool details -->
          <div style="background:#071510;border:1px solid #14532d55;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
            <table cellpadding="0" cellspacing="0" style="width:100%;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #0d2016;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:16px;padding-right:12px;vertical-align:middle;">🔗</td>
                  <td style="font-size:13px;color:#6b7280;vertical-align:middle;">Invite link</td>
                </tr></table>
                <div style="margin-top:6px;padding-left:28px;">
                  <a href="${leagueUrl}" style="color:#4ade80;font-size:13px;word-break:break-all;">${leagueUrl}</a>
                </div>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #0d2016;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:16px;padding-right:12px;vertical-align:middle;">👥</td>
                  <td style="font-size:14px;color:#d1d5db;vertical-align:middle;">Open spots: <strong style="color:#fff;">${spotsOpen}</strong></td>
                </tr></table>
              </td></tr>
              ${tournamentLine}
            </table>
          </div>

          <!-- CTA -->
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${leagueUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:10px;">
              Open Your Pool →
            </a>
          </div>

          <p style="margin:0 0 4px;font-size:13px;color:#4b5563;text-align:center;">
            Share the invite link with your group and get picks in before Thursday.
          </p>
          <p style="margin:0;font-size:11px;color:#166534;text-align:center;margin-top:20px;">
            TourneyRun · Golf Pool Fantasy · tourneyrun.app
          </p>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

module.exports = { sendPasswordReset, sendWelcome, sendGolfPaymentConfirmation, sendCommProUnlocked, sendGolfPoolLive };
