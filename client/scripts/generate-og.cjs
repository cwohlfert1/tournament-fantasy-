#!/usr/bin/env node
// Generates public/golf-og-image.png from an embedded SVG using sharp.
// Run: node scripts/generate-og.js

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const OUT = path.resolve(__dirname, '../public/golf-og-image.png');

const svg = `<svg width="1200" height="630" viewBox="0 0 680 357"
     xmlns="http://www.w3.org/2000/svg">

  <!-- Background -->
  <rect width="680" height="357" fill="#0a0f1a"/>
  <!-- Green bottom bar -->
  <rect x="0" y="348" width="680" height="9" fill="#22c55e"/>

  <!-- Golf ball logo -->
  <circle cx="54" cy="54" r="26" fill="white" stroke="#d1d5db" stroke-width="1.5"/>
  <circle cx="46" cy="43" r="4" fill="#9ca3af"/>
  <circle cx="57" cy="40" r="4" fill="#9ca3af"/>
  <circle cx="66" cy="50" r="4" fill="#9ca3af"/>
  <circle cx="43" cy="54" r="4" fill="#9ca3af"/>
  <circle cx="55" cy="54" r="4" fill="#9ca3af"/>
  <circle cx="64" cy="62" r="4" fill="#9ca3af"/>
  <circle cx="48" cy="64" r="4" fill="#9ca3af"/>
  <circle cx="58" cy="66" r="3.5" fill="#9ca3af"/>

  <!-- Wordmark -->
  <text x="90" y="47" font-family="system-ui,sans-serif" font-size="17"
        font-weight="700" fill="#ffffff" letter-spacing="1.5">TOURNEYRUN</text>
  <text x="90" y="67" font-family="system-ui,sans-serif" font-size="10"
        font-weight="500" fill="#22c55e" letter-spacing="3.5">GOLF FANTASY</text>

  <!-- Divider -->
  <line x1="40" y1="95" x2="640" y2="95" stroke="#1e293b" stroke-width="0.75"/>

  <!-- Main headline -->
  <text x="340" y="168" font-family="system-ui,sans-serif" font-size="54"
        font-weight="800" fill="#ffffff" text-anchor="middle"
        letter-spacing="-1.5">Your League.</text>
  <text x="340" y="228" font-family="system-ui,sans-serif" font-size="54"
        font-weight="800" fill="#22c55e" text-anchor="middle"
        letter-spacing="-1.5">Your Rules.</text>

  <!-- Golf Fantasy card (green border) -->
  <rect x="60" y="258" width="268" height="72" rx="10"
        fill="#111827" stroke="#22c55e" stroke-width="1.5"/>
  <circle cx="73" cy="279" r="7" fill="#22c55e"/>
  <text x="90" y="282" font-family="system-ui,sans-serif" font-size="11"
        font-weight="600" fill="#22c55e" letter-spacing="2">GOLF FANTASY</text>
  <text x="90" y="302" font-family="system-ui,sans-serif" font-size="14"
        font-weight="700" fill="#ffffff">Season-long PGA Tour</text>
  <text x="90" y="320" font-family="system-ui,sans-serif" font-size="12"
        font-weight="400" fill="#64748b">Draft once · Play all season · Majors 1.5×</text>

  <!-- Office Pool card (blue border) -->
  <rect x="352" y="258" width="268" height="72" rx="10"
        fill="#111827" stroke="#3b82f6" stroke-width="1.5"/>
  <circle cx="365" cy="279" r="7" fill="#3b82f6"/>
  <text x="382" y="282" font-family="system-ui,sans-serif" font-size="11"
        font-weight="600" fill="#3b82f6" letter-spacing="2">OFFICE POOL</text>
  <text x="382" y="302" font-family="system-ui,sans-serif" font-size="14"
        font-weight="700" fill="#ffffff">Pick-em tournament pools</text>
  <text x="382" y="320" font-family="system-ui,sans-serif" font-size="12"
        font-weight="400" fill="#64748b">Weekly picks · No draft needed · Easy setup</text>

  <!-- URL footer -->
  <text x="340" y="348" font-family="system-ui,sans-serif" font-size="11"
        font-weight="400" fill="#334155" text-anchor="middle"
        letter-spacing="1.5">TOURNEYRUN.APP</text>

</svg>`;

sharp(Buffer.from(svg))
  .resize(1200, 630)
  .png()
  .toFile(OUT)
  .then(() => console.log(`✓ Generated ${OUT}`))
  .catch(err => { console.error('Failed to generate OG image:', err.message); process.exit(1); });
