import { useState } from 'react';
import api from '../../api';
import Select from '../ui/Select';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const DAYS   = Array.from({ length: 31 }, (_, i) => i + 1);
const YEARS  = Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - 17 - i);

export default function GolfProfileOnboarding({ onComplete, onSkip }) {
  const [gender, setGender] = useState('');
  const [month,  setMonth]  = useState('');
  const [day,    setDay]    = useState('');
  const [year,   setYear]   = useState('');
  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = gender && month && day && year;

  async function handleContinue() {
    setError('');
    const dob = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    setSaving(true);
    try {
      await api.post('/golf/profile/complete', { gender, dob });
      onComplete();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    }
    setSaving(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{
        background: '#0a1a0f',
        border: '1px solid #14532d55',
        borderRadius: 20,
        padding: '32px 28px',
        width: '100%',
        maxWidth: 420,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
            One more thing before you tee off
          </h2>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
            This helps us improve your experience.
          </p>
        </div>

        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Gender */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 10 }}>
            Gender <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { value: 'male',              label: 'Male'              },
              { value: 'female',            label: 'Female'            },
              { value: 'prefer_not_to_say', label: 'Prefer not to say' },
            ].map(opt => (
              <label key={opt.value} style={{
                flex: opt.value === 'prefer_not_to_say' ? 2 : 1,
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px',
                background: gender === opt.value ? '#14532d55' : '#111',
                border: gender === opt.value ? '1px solid #22c55e' : '1px solid #1f2937',
                borderRadius: 10, cursor: 'pointer',
              }}>
                <input
                  type="radio" name="gender" value={opt.value}
                  checked={gender === opt.value}
                  onChange={() => setGender(opt.value)}
                  style={{ accentColor: '#22c55e' }}
                />
                <span style={{ color: gender === opt.value ? '#4ade80' : '#9ca3af', fontSize: 13 }}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Date of Birth */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 10 }}>
            Date of Birth <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr', gap: 8 }}>
            <Select
              value={month}
              onChange={setMonth}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
              placeholder="Month"
              size="sm"
              fullWidth
            />
            <Select
              value={day}
              onChange={setDay}
              options={DAYS.map(d => ({ value: String(d), label: String(d) }))}
              placeholder="Day"
              size="sm"
              fullWidth
            />
            <Select
              value={year}
              onChange={setYear}
              options={YEARS.map(y => ({ value: String(y), label: String(y) }))}
              placeholder="Year"
              size="sm"
              fullWidth
            />
          </div>
          <p style={{ color: '#4b5563', fontSize: 11, marginTop: 6 }}>Must be 18 or older to participate.</p>
        </div>

        <button
          onClick={handleContinue}
          disabled={!canSubmit || saving}
          style={{
            width: '100%', padding: '13px 0',
            background: canSubmit ? '#16a34a' : '#166534',
            color: '#fff', fontWeight: 800, fontSize: 15,
            border: 'none', borderRadius: 12, cursor: canSubmit ? 'pointer' : 'not-allowed',
            marginBottom: 10, opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {saving ? 'Saving…' : 'Continue →'}
        </button>

        <button onClick={onSkip} style={{ width: '100%', padding: '10px 0', background: 'transparent', color: '#4b5563', fontSize: 13, border: 'none', cursor: 'pointer' }}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

