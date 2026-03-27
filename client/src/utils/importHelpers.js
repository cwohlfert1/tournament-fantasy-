/**
 * Pure utility functions for the League Import feature (client-side copy).
 * Mirrors server/utils/importHelpers.js — no Node.js-specific imports.
 */

const EMAIL_HEADER_PATTERNS = [
  /^email$/i,
  /^e-?mail\s*address$/i,
  /^email\s*addr(ess)?$/i,
  /^e_mail$/i,
  /^contact\s*email$/i,
  /^member\s*email$/i,
  /^player\s*email$/i,
];

export function detectEmailColumn(headers) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i]).trim();
    if (EMAIL_HEADER_PATTERNS.some(p => p.test(h))) return i;
  }
  for (let i = 0; i < headers.length; i++) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(headers[i]).trim())) return i;
  }
  return -1;
}

const NAME_HEADER_PATTERNS = [
  /^(full\s*)?name$/i,
  /^display\s*name$/i,
  /^team\s*name$/i,
  /^username$/i,
  /^player\s*name$/i,
  /^member\s*name$/i,
  /^first\s*name$/i,
  /^last\s*name$/i,
];

export function detectNameColumn(headers) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i]).trim();
    if (NAME_HEADER_PATTERNS.some(p => p.test(h))) return i;
  }
  return -1;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email) {
  return EMAIL_RE.test(String(email || '').trim());
}

export function deduplicateMembers(members) {
  const seen = new Set();
  const unique = [];
  const duplicates = [];
  for (const row of members) {
    const email = String(row.email || '').trim().toLowerCase();
    if (!validateEmail(email)) continue;
    if (seen.has(email)) {
      duplicates.push(email);
    } else {
      seen.add(email);
      unique.push({ email, name: String(row.name || '').trim() });
    }
  }
  return { unique, duplicates };
}

export function parseSheetRows(rows) {
  if (!rows || rows.length < 2) {
    return { members: [], errors: ['File is empty or has no data rows.'] };
  }

  const headers  = rows[0].map(c => String(c ?? '').trim());
  const emailIdx = detectEmailColumn(headers);
  const nameIdx  = detectNameColumn(headers);

  if (emailIdx === -1) {
    return {
      members: [],
      errors: ['Could not find an email column. Add a header named "Email" or "Email Address".'],
    };
  }

  const raw    = [];
  const errors = [];

  for (let i = 1; i < rows.length; i++) {
    const row   = rows[i];
    const email = String(row[emailIdx] ?? '').trim();
    if (!email) continue;
    if (!validateEmail(email)) {
      errors.push(`Row ${i + 1}: "${email}" is not a valid email`);
      continue;
    }
    const name = nameIdx >= 0 ? String(row[nameIdx] ?? '').trim() : '';
    raw.push({ email, name });
  }

  const { unique, duplicates } = deduplicateMembers(raw);
  duplicates.forEach(e => errors.push(`Duplicate email skipped: ${e}`));

  return { members: unique, errors };
}
