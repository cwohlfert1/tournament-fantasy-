const fs = require('fs'); const path = require('path');
const FILES = [
  'pages/golf/tabs/PoolRosterTab.jsx',
  'pages/golf/tabs/SalaryCapPicksTab.jsx',
  'pages/LeagueHome.jsx',
];
let total = 0;
for (const rel of FILES) {
  const f = path.join(__dirname, '..', 'src', rel);
  let src = fs.readFileSync(f, 'utf8');
  const before = src;
  src = src.replace(/>\s*(?:×|&times;)\s*<\/button>/g, () => { total++; return `><X size={14} /></button>`; });
  if (src === before) { console.log(`  no change ${rel}`); continue; }
  if (!/from\s+['"]lucide-react['"]/.test(src)) {
    const m = src.match(/^import .+?;$/m);
    if (m) src = src.slice(0, m.index + m[0].length) + "\nimport { X } from 'lucide-react';" + src.slice(m.index + m[0].length);
  } else if (!/import\s*\{[^}]*\bX\b[^}]*\}\s*from\s*['"]lucide-react['"]/.test(src)) {
    src = src.replace(/import\s*\{([^}]+)\}\s*from\s*(['"]lucide-react['"])/, (m, imps, mod) => {
      const list = imps.split(',').map(s => s.trim()).filter(Boolean);
      if (!list.includes('X')) list.push('X');
      return `import { ${list.join(', ')} } from ${mod}`;
    });
  }
  fs.writeFileSync(f, src);
  console.log(`  ✓ ${rel}`);
}
console.log(`total: ${total}`);
