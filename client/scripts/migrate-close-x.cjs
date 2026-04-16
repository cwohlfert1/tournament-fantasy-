/**
 * Replace text × / &times; close buttons with lucide <X /> icons.
 * Adds X to lucide-react import, normalizes style to remove fontSize.
 */
const fs = require('fs');
const path = require('path');

const FILES = [
  'pages/golf/CreateGolfLeague.jsx',
  'pages/golf/GolfDashboard.jsx',
  'pages/golf/GolfSuperAdmin.jsx',
  'pages/golf/tabs/CommissionerTab.jsx',
  'pages/golf/tabs/PickSheetTab.jsx',
];

let totalReplaced = 0;

for (const rel of FILES) {
  const file = path.join(__dirname, '..', 'src', rel);
  let src = fs.readFileSync(file, 'utf8');
  const before = src;

  // 1) Replace >×</button>, >&times;</button>, or > × </button> with <X size={14} /></button>
  src = src.replace(/>\s*(?:×|&times;)\s*<\/button>/g, () => { totalReplaced++; return `><X size={14} /></button>`; });

  if (src === before) { console.log(`  (no change)  ${rel}`); continue; }

  // 2) Ensure X imported from lucide-react
  if (!/from\s+['"]lucide-react['"]/.test(src)) {
    // no lucide import — add one at top
    const firstImport = src.match(/^import .+?;$/m);
    if (firstImport) {
      const idx = firstImport.index + firstImport[0].length;
      src = src.slice(0, idx) + "\nimport { X } from 'lucide-react';" + src.slice(idx);
    }
  } else if (!/import\s*\{[^}]*\bX\b[^}]*\}\s*from\s*['"]lucide-react['"]/.test(src)) {
    // has lucide import — add X to the existing list
    src = src.replace(/import\s*\{([^}]+)\}\s*from\s*(['"]lucide-react['"])/, (m, imps, mod) => {
      const list = imps.split(',').map(s => s.trim()).filter(Boolean);
      if (!list.includes('X')) list.push('X');
      return `import { ${list.join(', ')} } from ${mod}`;
    });
  }

  fs.writeFileSync(file, src);
  console.log(`  ✓ ${rel}`);
}
console.log(`\nTotal replacements: ${totalReplaced}`);
