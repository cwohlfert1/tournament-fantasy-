/**
 * ImportSection — xlsx/csv bulk import of pool members with preview
 * table + error reporting. Uses parseSheetRows from importHelpers to
 * normalize various column layouts into a { email, name } shape.
 */
import { useState } from 'react';
import api from '../../../../api';
import { parseSheetRows } from '../../../../utils/importHelpers';

function downloadCsvTemplate() {
  const csv = 'Name,Email\nAlice Smith,alice@example.com\nBob Jones,bob@example.com\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'league-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportSection({ leagueId }) {
  const [preview, setPreview]         = useState(null);  // Array<{email,name}> | null
  const [parseErrors, setParseErrors] = useState([]);
  const [importing, setImporting]     = useState(false);
  const [result, setResult]           = useState(null); // { imported, existing, skipped, errors }
  const [importError, setImportError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setImportError('');

    try {
      const { read, utils } = await import('xlsx');
      const buf  = await file.arrayBuffer();
      const wb   = read(buf);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json(ws, { header: 1, defval: '' });

      const { members, errors } = parseSheetRows(rows);
      setPreview(members);
      setParseErrors(errors);
    } catch (err) {
      setImportError('Could not parse file: ' + err.message);
      setPreview(null);
      setParseErrors([]);
    }
    // Reset so the same file can be re-selected after cancel.
    e.target.value = '';
  }

  async function confirmImport() {
    if (!preview?.length) return;
    setImporting(true);
    setImportError('');
    try {
      const r = await api.post(`/golf/leagues/${leagueId}/import-members`, { members: preview });
      setResult(r.data);
      setPreview(null);
      setParseErrors([]);
    } catch (err) {
      setImportError(err.response?.data?.error || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  const sectionStyle = { background: '#080f0c', border: '1px solid #1a2e1f', borderRadius: 10, padding: '14px 16px', marginBottom: 0 };
  const labelStyle   = { color: '#4b5563', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' };

  return (
    <div style={sectionStyle}>
      <p style={labelStyle}>Import Members</p>

      {result && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ color: '#4ade80', fontWeight: 700, fontSize: 13, margin: '0 0 4px' }}>Import complete</p>
          <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>
            {result.imported} added &nbsp;·&nbsp; {result.existing} already in league &nbsp;·&nbsp; {result.skipped} skipped
          </p>
          {result.errors?.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
              {result.errors.map((e, i) => (
                <li key={i} style={{ color: '#f87171', fontSize: 12 }}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!preview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
            color: '#4ade80', borderRadius: 8, padding: '6px 14px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            <span>📂</span> Choose File (.xlsx, .xls, .csv)
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
          </label>
          <button
            onClick={downloadCsvTemplate}
            style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Download template
          </button>
        </div>
      )}

      {parseErrors.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
          {parseErrors.map((e, i) => <li key={i} style={{ color: '#fbbf24', fontSize: 12 }}>{e}</li>)}
        </ul>
      )}

      {preview && preview.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 8px' }}>
            <strong style={{ color: '#ffffff' }}>{preview.length}</strong> member{preview.length !== 1 ? 's' : ''} detected — confirm to send invites.
          </p>
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #1f2937', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0d1117' }}>
                  <th style={{ color: '#6b7280', fontWeight: 600, padding: '6px 12px', textAlign: 'left' }}>Email</th>
                  <th style={{ color: '#6b7280', fontWeight: 600, padding: '6px 12px', textAlign: 'left' }}>Name</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #1f2937' }}>
                    <td style={{ color: '#d1d5db', padding: '5px 12px' }}>{row.email}</td>
                    <td style={{ color: '#9ca3af', padding: '5px 12px' }}>{row.name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={confirmImport}
              disabled={importing}
              style={{
                background: importing ? 'rgba(34,197,94,0.3)' : '#22c55e',
                color: '#0a1a10', border: 'none', borderRadius: 8,
                padding: '7px 18px', fontSize: 13, fontWeight: 700,
                cursor: importing ? 'not-allowed' : 'pointer',
              }}
            >
              {importing ? 'Importing…' : `Import ${preview.length} member${preview.length !== 1 ? 's' : ''}`}
            </button>
            <button
              onClick={() => { setPreview(null); setParseErrors([]); }}
              disabled={importing}
              style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {importError && (
        <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{importError}</p>
      )}
    </div>
  );
}
