const { sendEmail, sendEmailBatch } = require('./mailer');

const FROM = 'TourneyRun <noreply@tourneyrun.app>';

function shell(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0f1923;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f1923;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td style="padding:28px 32px 20px;border-bottom:2px solid #8B1E3F;background-color:#0f1923;">
        <span style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">tourney<span style="color:#8B1E3F;">run</span> racing</span>
      </td></tr>
      <tr><td style="padding:24px 32px;background-color:#0f1923;color:#e5e7eb;font-size:15px;line-height:1.6;">
${content}
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #1a2733;font-size:12px;color:#6b7280;text-align:center;background-color:#0f1923;">
        tourneyrun.app &middot; Horse Racing Pools &middot; Derby 2026
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// Email 1: Join confirmation
async function sendHorsesJoinEmail(entry, pool, event) {
  const html = shell(`
        <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">You're in!</h2>
        <p>You've joined <strong style="color:#fff;">${pool.name}</strong>.</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;font-size:14px;">
          <tr><td style="color:#9ca3af;padding:4px 0;">Event</td><td style="color:#fff;text-align:right;">${event.name}</td></tr>
          <tr><td style="color:#9ca3af;padding:4px 0;">Format</td><td style="color:#fff;text-align:right;">${pool.format_type.replace('_', ' ')}</td></tr>
          <tr><td style="color:#9ca3af;padding:4px 0;">Entry Fee</td><td style="color:#fff;text-align:right;">$${pool.entry_fee}</td></tr>
          <tr><td style="color:#9ca3af;padding:4px 0;">Lock Time</td><td style="color:#fff;text-align:right;">${pool.lock_time ? new Date(pool.lock_time).toLocaleString() : 'TBD'}</td></tr>
        </table>
        <p style="font-size:13px;color:#9ca3af;">Share the invite link with friends to grow your pool.</p>
  `);

  await sendEmail({
    from: FROM,
    to: entry.email,
    subject: `You've joined ${pool.name}!`,
    html,
  });
}

// Email 2: Lock/draw notification
async function sendHorsesLockEmail(entries, pool, event, assignments) {
  const emails = entries.map(entry => {
    let formatContent = '';
    if (pool.format_type === 'random_draw' && assignments) {
      const a = assignments.find(a => a.user_id === entry.user_id);
      if (a) {
        formatContent = `
          <h3 style="color:#fff;font-size:16px;margin:16px 0 8px;">Your Horse</h3>
          <div style="background:#1a2733;padding:12px 16px;border-radius:8px;border-left:3px solid #8B1E3F;">
            <strong style="color:#fff;">#${a.post_position || '?'} ${a.horse_name}</strong><br>
            <span style="color:#9ca3af;font-size:13px;">Jockey: ${a.jockey_name || 'TBD'} &middot; ML: ${a.morning_line_odds || 'N/A'}</span>
          </div>`;
      }
    } else if (pool.format_type === 'pick_wps') {
      formatContent = '<p>Your picks are locked. Good luck!</p>';
    } else if (pool.format_type === 'squares') {
      formatContent = '<p>Numbers have been assigned to the grid. Check your squares!</p>';
    }

    const html = shell(`
          <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">${pool.name} is locked!</h2>
          <p>Entries are now frozen for <strong style="color:#fff;">${event.name}</strong>.</p>
          ${formatContent}
          <p style="font-size:13px;color:#9ca3af;margin-top:16px;">Results will be entered by the commissioner after the race.</p>
    `);

    return { from: FROM, to: entry.email, subject: `${pool.name} is locked!`, html };
  }).filter(e => e.to);

  if (emails.length) await sendEmailBatch(emails);
}

// Email 3: Results + payouts
async function sendHorsesResultsEmail(entries, pool, payouts) {
  const resultLines = payouts.map(p =>
    `<tr><td style="color:#9ca3af;padding:4px 0;text-transform:uppercase;font-size:12px;">${p.payout_type}</td><td style="color:#fff;text-align:right;">${p.display_name}</td><td style="color:#fff;text-align:right;font-family:monospace;">$${Number(p.amount).toFixed(2)}</td></tr>`
  ).join('');

  const emails = entries.map(entry => {
    const html = shell(`
          <h2 style="color:#fff;font-size:20px;margin:0 0 12px;">Results are in!</h2>
          <p>Payouts for <strong style="color:#fff;">${pool.name}</strong> have been finalized.</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;font-size:14px;">
            <tr style="border-bottom:1px solid #1a2733;"><th style="color:#6b7280;padding:4px 0;text-align:left;font-weight:normal;">Position</th><th style="color:#6b7280;text-align:right;font-weight:normal;">Winner</th><th style="color:#6b7280;text-align:right;font-weight:normal;">Amount</th></tr>
            ${resultLines}
          </table>
          ${pool.venmo ? `<p style="font-size:13px;color:#9ca3af;">Venmo: <strong style="color:#fff;">${pool.venmo}</strong></p>` : ''}
          ${pool.paypal ? `<p style="font-size:13px;color:#9ca3af;">PayPal: <strong style="color:#fff;">${pool.paypal}</strong></p>` : ''}
          ${pool.zelle ? `<p style="font-size:13px;color:#9ca3af;">Zelle: <strong style="color:#fff;">${pool.zelle}</strong></p>` : ''}
          <p style="font-size:13px;color:#8B1E3F;margin-top:20px;">How did your pool run? Reply to this email with feedback.</p>
    `);

    return { from: FROM, to: entry.email, subject: `Results are in for ${pool.name}!`, html };
  }).filter(e => e.to);

  if (emails.length) await sendEmailBatch(emails);
}

module.exports = { sendHorsesJoinEmail, sendHorsesLockEmail, sendHorsesResultsEmail };
