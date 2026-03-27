const {
  detectEmailColumn,
  detectNameColumn,
  validateEmail,
  deduplicateMembers,
  parseSheetRows,
} = require('../utils/importHelpers');
const crypto = require('crypto');

// ── detectEmailColumn ────────────────────────────────────────────────────────

describe('detectEmailColumn', () => {
  it('finds "Email" header (case-insensitive)', () => {
    expect(detectEmailColumn(['Name', 'Email', 'Phone'])).toBe(1);
    expect(detectEmailColumn(['EMAIL', 'name'])).toBe(0);
    expect(detectEmailColumn(['email', 'other'])).toBe(0);
  });

  it('finds "Email Address" variants', () => {
    expect(detectEmailColumn(['Email Address', 'Name'])).toBe(0);
    expect(detectEmailColumn(['Name', 'E-Mail Address'])).toBe(1);
    expect(detectEmailColumn(['name', 'email addr'])).toBe(1);
  });

  it('finds "Contact Email", "Member Email", "Player Email"', () => {
    expect(detectEmailColumn(['Contact Email'])).toBe(0);
    expect(detectEmailColumn(['foo', 'Member Email', 'bar'])).toBe(1);
    expect(detectEmailColumn(['Player Email', 'Name'])).toBe(0);
  });

  it('falls back to column that IS an email address', () => {
    expect(detectEmailColumn(['alice@example.com', 'Name'])).toBe(0);
  });

  it('returns -1 when no email column found', () => {
    expect(detectEmailColumn(['First', 'Last', 'Phone'])).toBe(-1);
    expect(detectEmailColumn([])).toBe(-1);
  });
});

// ── detectNameColumn ─────────────────────────────────────────────────────────

describe('detectNameColumn', () => {
  it('finds "Name" and "Full Name"', () => {
    expect(detectNameColumn(['Full Name', 'Email'])).toBe(0);
    expect(detectNameColumn(['Email', 'name'])).toBe(1);
  });

  it('finds "Team Name", "Display Name", "Username"', () => {
    expect(detectNameColumn(['email', 'Team Name'])).toBe(1);
    expect(detectNameColumn(['display name', 'email'])).toBe(0);
    expect(detectNameColumn(['username', 'email'])).toBe(0);
  });

  it('returns -1 when no name column found', () => {
    expect(detectNameColumn(['Email', 'Phone', 'City'])).toBe(-1);
  });
});

// ── validateEmail ─────────────────────────────────────────────────────────────

describe('validateEmail', () => {
  it('accepts valid emails', () => {
    expect(validateEmail('alice@example.com')).toBe(true);
    expect(validateEmail('user+tag@sub.domain.org')).toBe(true);
    expect(validateEmail('a@b.co')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('notanemail')).toBe(false);
    expect(validateEmail('@nodomain.com')).toBe(false);
    expect(validateEmail('missing@')).toBe(false);
    expect(validateEmail('')).toBe(false);
    expect(validateEmail(null)).toBe(false);
    expect(validateEmail(undefined)).toBe(false);
  });
});

// ── deduplicateMembers ────────────────────────────────────────────────────────

describe('deduplicateMembers', () => {
  it('removes duplicate emails (case-insensitive, keeps first)', () => {
    const input = [
      { email: 'Alice@Example.com', name: 'Alice' },
      { email: 'alice@example.com', name: 'Alice Dup' },
      { email: 'bob@example.com', name: 'Bob' },
    ];
    const { unique, duplicates } = deduplicateMembers(input);
    expect(unique).toHaveLength(2);
    expect(unique[0].email).toBe('alice@example.com');
    expect(unique[0].name).toBe('Alice');
    expect(duplicates).toContain('alice@example.com');
  });

  it('filters out invalid emails', () => {
    const input = [
      { email: 'good@test.com', name: 'Good' },
      { email: 'bademail', name: 'Bad' },
    ];
    const { unique } = deduplicateMembers(input);
    expect(unique).toHaveLength(1);
    expect(unique[0].email).toBe('good@test.com');
  });

  it('returns empty arrays for empty input', () => {
    const { unique, duplicates } = deduplicateMembers([]);
    expect(unique).toHaveLength(0);
    expect(duplicates).toHaveLength(0);
  });
});

// ── parseSheetRows ────────────────────────────────────────────────────────────

describe('parseSheetRows', () => {
  it('parses a well-formed sheet', () => {
    const rows = [
      ['Name', 'Email'],
      ['Alice', 'alice@test.com'],
      ['Bob',   'bob@test.com'],
    ];
    const { members, errors } = parseSheetRows(rows);
    expect(members).toHaveLength(2);
    expect(members[0]).toEqual({ email: 'alice@test.com', name: 'Alice' });
    expect(errors).toHaveLength(0);
  });

  it('reports error when no email column found', () => {
    const rows = [['First', 'Last'], ['Alice', 'Smith']];
    const { members, errors } = parseSheetRows(rows);
    expect(members).toHaveLength(0);
    expect(errors[0]).toMatch(/email column/i);
  });

  it('skips empty rows silently', () => {
    const rows = [
      ['Email', 'Name'],
      ['alice@test.com', 'Alice'],
      ['', ''],
      ['bob@test.com', 'Bob'],
    ];
    const { members } = parseSheetRows(rows);
    expect(members).toHaveLength(2);
  });

  it('reports invalid emails as errors and excludes them', () => {
    const rows = [
      ['Email'],
      ['good@test.com'],
      ['notvalid'],
    ];
    const { members, errors } = parseSheetRows(rows);
    expect(members).toHaveLength(1);
    expect(errors.some(e => /notvalid/.test(e))).toBe(true);
  });

  it('handles duplicate emails with an error message', () => {
    const rows = [
      ['Email', 'Name'],
      ['dup@test.com', 'Alice'],
      ['dup@test.com', 'Alice Again'],
      ['unique@test.com', 'Bob'],
    ];
    const { members, errors } = parseSheetRows(rows);
    expect(members).toHaveLength(2);
    expect(errors.some(e => /dup@test.com/.test(e))).toBe(true);
  });

  it('returns error for empty/null input', () => {
    expect(parseSheetRows(null).errors[0]).toMatch(/empty/i);
    expect(parseSheetRows([]).errors[0]).toMatch(/empty/i);
    expect(parseSheetRows([['Email']]).errors[0]).toMatch(/empty/i);
  });
});

// ── Invite token uniqueness ───────────────────────────────────────────────────

describe('invite token generation', () => {
  it('generates 32-byte hex tokens (64 chars)', () => {
    const token = crypto.randomBytes(32).toString('hex');
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('generates statistically unique tokens', () => {
    const tokens = Array.from({ length: 1000 }, () =>
      crypto.randomBytes(32).toString('hex')
    );
    const unique = new Set(tokens);
    expect(unique.size).toBe(1000);
  });
});
