#!/usr/bin/env node
/**
 * One-shot migration: native alert() → showToast.*
 * Heuristic: error-ish string → showToast.error; validation/warning → showToast.warning;
 * else showToast.success. Adds the Toast import once per file.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'src');

const FILES = [
  'pages/AdminScores.jsx',
  'pages/Dashboard.jsx',
  'pages/DraftRoom.jsx',
  'pages/golf/tabs/CommissionerTab.jsx',
  'pages/golf/tabs/PoolRosterTab.jsx',
  'pages/TrashTalkTab.jsx',
  'pages/LeagueHome.jsx',
  'pages/SuperAdmin.jsx',
];

function pathToToast(fileRel) {
  const depth = fileRel.split('/').length - 1;
  return '../'.repeat(depth) + 'components/ui/Toast';
}

function classify(text) {
  const t = text.toLowerCase();
  if (/failed|error|could not|delete failed|swap failed/.test(t)) return 'error';
  if (/please\s+select|must be at least|required|invalid|not found/.test(t)) return 'warning';
  return 'success';
}

let totalReplaced = 0;
for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  const before = src;

  // Replace alert( ... ) where the call is not wrapped by data-/aria- attrs.
  // Match: whitespace + "alert(" + balanced args + ")"
  // Capture the argument expression and rewrite.
  src = src.replace(
    /(^|[^\w.])alert\(([^;]*?)\);/gm,
    (m, lead, arg) => {
      // Skip if arg is obviously not a user-message (best-effort)
      const trimmed = arg.trim();
      if (!trimmed) return m;
      const kind = classify(trimmed);
      totalReplaced++;
      return `${lead}showToast.${kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : 'success'}(${trimmed});`;
    }
  );

  // Also handle: "return alert('...')" — same text rewrite works
  src = src.replace(
    /return\s+alert\(([^;]*?)\);/gm,
    (m, arg) => {
      const trimmed = arg.trim();
      if (!trimmed) return m;
      const kind = classify(trimmed);
      totalReplaced++;
      return `return showToast.${kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : 'success'}(${trimmed});`;
    }
  );

  if (src === before) {
    console.log(`  (no alerts)  ${rel}`);
    continue;
  }

  // Add import if missing
  if (!/from\s+['"][^'"]*components\/ui\/Toast['"]/.test(src)) {
    const importLine = `import { showToast } from '${pathToToast(rel)}';\n`;
    // Insert after the last existing import at top-of-file
    const importMatches = [...src.matchAll(/^import .+?;$/gm)];
    if (importMatches.length) {
      const last = importMatches[importMatches.length - 1];
      const insertAt = last.index + last[0].length;
      src = src.slice(0, insertAt) + '\n' + importLine.trimEnd() + src.slice(insertAt);
    } else {
      src = importLine + src;
    }
  }

  fs.writeFileSync(file, src);
  const count = (before.match(/(^|[^\w.])alert\(/gm) || []).length;
  console.log(`  ✓ ${rel}  (${count} alert${count !== 1 ? 's' : ''})`);
}

console.log(`\nTotal replacements: ${totalReplaced}`);
