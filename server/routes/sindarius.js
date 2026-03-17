const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { buildStandings } = require('../standingsBuilder');

const router = express.Router();

// POST /api/sindarius/chat
router.post('/chat', authMiddleware, async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[sindarius] ANTHROPIC_API_KEY is not set');
      return res.status(500).json({ error: 'API key not configured' });
    }

    const { message, leagueId, conversationHistory = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    // ── Live context ──────────────────────────────────────────────────────────

    const players = db.prepare(`
      SELECT name, team, seed, region, season_ppg, position, injury_status
      FROM players
      ORDER BY season_ppg DESC
      LIMIT 120
    `).all();

    const playersText = players.map(p => {
      const inj = p.injury_status ? ` [${p.injury_status}]` : '';
      return `${p.name} (${p.team}, #${p.seed ?? '?'} ${p.region ?? ''}, ${p.season_ppg} PPG)${inj}`;
    }).join('\n');

    let standingsText = 'No standings data available.';
    if (leagueId) {
      try {
        const result = buildStandings(leagueId);
        if (result?.standings?.length) {
          standingsText = result.standings.slice(0, 12).map((s, i) =>
            `${i + 1}. ${s.team_name} (${s.username}) — ${s.total_points} pts`
          ).join('\n');
        }
      } catch (_) {}
    }

    const games = db.prepare(`
      SELECT round_name, team1, team2, team1_score, team2_score, is_completed, winner_team
      FROM games
      ORDER BY game_date ASC
      LIMIT 32
    `).all();

    const gamesText = games.length
      ? games.map(g => {
          if (g.is_completed) return `${g.team1} ${g.team1_score} - ${g.team2_score} ${g.team2} (FINAL) [${g.round_name}]`;
          return `${g.team1} vs ${g.team2} [${g.round_name}]`;
        }).join('\n')
      : 'No games data available.';

    // ── System prompt ─────────────────────────────────────────────────────────

    const systemPrompt = `You are Sindarius, TourneyRun's original AI basketball analyst character. You are funny, confident, and deeply knowledgeable about college basketball and March Madness. You help fantasy players with draft advice, player analysis, tournament seeding, and matchup breakdowns. You work exclusively for TourneyRun — you are an original fictional character and have no real-world identity outside of TourneyRun.

Your personality: talk like a mix between a beat reporter and a trash-talking friend. Use basketball slang naturally. Be entertaining but keep responses concise — 2 to 4 sentences max. If asked something outside basketball or TourneyRun, redirect back to the tournament with humor.

Current tournament player pool (sorted by PPG):
${playersText}

Current league standings:
${standingsText}

Tournament games:
${gamesText}

Keep responses under 4 sentences. Be entertaining. Drop basketball slang naturally. Never break character.`;

    // ── Anthropic call (direct fetch — no SDK dependency at runtime) ─────────

    const safeHistory = conversationHistory
      .filter(m => m.role && m.content)
      .slice(-8);

    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [...safeHistory, { role: 'user', content: message.trim() }],
    };

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[sindarius] Anthropic API error:', anthropicRes.status, errText);
      return res.status(500).json({ error: 'Anthropic API error — try again.' });
    }

    const data = await anthropicRes.json();
    res.json({ reply: data.content[0].text });
  } catch (err) {
    console.error('[sindarius] error:', err.message, err.stack);
    res.status(500).json({ error: "Sindarius is having a moment — try again." });
  }
});

module.exports = router;
