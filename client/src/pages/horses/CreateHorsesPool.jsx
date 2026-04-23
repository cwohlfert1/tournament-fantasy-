import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const FORMATS = [
  { value: 'random_draw', label: 'Random Draw', desc: 'System randomly assigns one horse to each entrant at lock time.' },
  { value: 'pick_wps', label: 'Pick W/P/S', desc: 'Each entrant picks one horse for Win, Place, and Show.' },
  { value: 'squares', label: 'Squares', desc: '10x10 grid. Winning squares determined by post positions of finishers.' },
];

const PAYOUT_PRESETS = {
  top3: [{ place: 1, pct: 50 }, { place: 2, pct: 30 }, { place: 3, pct: 20 }],
  top3_squares: [{ place: 1, pct: 60 }, { place: 2, pct: 25 }, { place: 3, pct: 15 }],
  top2: [{ place: 1, pct: 70 }, { place: 2, pct: 30 }],
  winner: [{ place: 1, pct: 100 }],
};

export default function CreateHorsesPool() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    event_id: '', name: '', format_type: '', entry_fee: 5,
    lock_time: '', payout_preset: 'top3',
    payout_structure: PAYOUT_PRESETS.top3,
    admin_fee_type: '', admin_fee_value: 0,
    venmo: '', paypal: '', zelle: '',
    squares_per_person_cap: 10,
    scoring_config: { win: 5, place: 3, show: 2 },
  });

  useEffect(() => {
    api.get('/horses/events').then(r => {
      const list = r.data.events || [];
      setEvents(list);
      if (list.length === 1) {
        const ev = list[0];
        setForm(f => ({ ...f, event_id: ev.id, lock_time: ev.default_lock_time || '' }));
      }
    }).catch(() => {});
  }, []);

  function setField(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function selectFormat(fmt) {
    const preset = fmt === 'squares' ? 'top3_squares' : 'top3';
    setForm(f => ({ ...f, format_type: fmt, payout_preset: preset, payout_structure: PAYOUT_PRESETS[preset] }));
  }

  function setPayoutPreset(preset) {
    setForm(f => ({ ...f, payout_preset: preset, payout_structure: PAYOUT_PRESETS[preset] }));
  }

  async function handleSubmit() {
    setError('');
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload.admin_fee_type) { delete payload.admin_fee_type; delete payload.admin_fee_value; }
      const r = await api.post('/horses/pools', payload);
      navigate(`/horses/pool/${r.data.pool.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create pool');
    } finally { setSubmitting(false); }
  }

  const selectedEvent = events.find(e => e.id === form.event_id);
  const canNext = () => {
    if (step === 1) return !!form.event_id;
    if (step === 2) return !!form.format_type;
    if (step === 3) return !!form.name;
    return true;
  };

  const input = 'bg-gray-800 border border-gray-800 rounded-2xl px-3 py-2 text-white text-sm w-full';
  const labelCls = 'text-sm text-gray-400 mb-1 block';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl sm:text-3xl font-black text-white mb-6">Create Horse Racing Pool</h1>
      {error && <div className="text-red-400 text-sm border border-red-500/30 rounded-2xl px-3 py-2 mb-4">{error}</div>}

      {/* Step 1: Event */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg text-white font-semibold">Select Event</h2>
          {events.length === 0 ? (
            <p className="text-gray-500">No events available. Ask the admin to create one.</p>
          ) : (
            <div className="space-y-2">
              {events.map(ev => (
                <button key={ev.id} onClick={() => { setField('event_id', ev.id); setField('lock_time', ev.default_lock_time || ''); }}
                  className={`w-full text-left border rounded-2xl p-4 transition-colors ${form.event_id === ev.id ? 'border-horses-500 bg-horses-500/10' : 'border-gray-800 hover:border-horses-500/40'}`}>
                  <div className="text-white font-medium">{ev.name}</div>
                  <div className="text-gray-400 text-sm">{ev.venue} &mdash; {ev.race_date ? new Date(ev.race_date).toLocaleDateString() : 'TBD'}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Format */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg text-white font-semibold">Choose Format</h2>
          <div className="space-y-2">
            {FORMATS.map(f => (
              <button key={f.value} onClick={() => selectFormat(f.value)}
                className={`w-full text-left border rounded-2xl p-4 transition-colors ${form.format_type === f.value ? 'border-horses-500 bg-horses-500/10' : 'border-gray-800 hover:border-horses-500/40'}`}>
                <div className="text-white font-medium">{f.label}</div>
                <div className="text-gray-400 text-sm">{f.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Settings */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg text-white font-semibold">Pool Settings</h2>
          <div>
            <label className={labelCls}>Pool Name</label>
            <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Derby Watch Party" className={input} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Entry Fee ($)</label>
              <input type="number" value={form.entry_fee} onChange={e => setField('entry_fee', Number(e.target.value))} min="0" step="1" className={input} />
            </div>
            <div>
              <label className={labelCls}>Lock Time</label>
              <input type="datetime-local" value={form.lock_time?.slice(0, 16) || ''} onChange={e => setField('lock_time', e.target.value)} className={input} />
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Payouts */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-lg text-white font-semibold">Payout Structure</h2>
          <div className="space-y-2">
            {[
              { key: form.format_type === 'squares' ? 'top3_squares' : 'top3', label: 'Top 3', desc: form.format_type === 'squares' ? '60% / 25% / 15%' : '50% / 30% / 20%' },
              { key: 'top2', label: 'Top 2', desc: '70% / 30%' },
              { key: 'winner', label: 'Winner Only', desc: '100%' },
            ].map(p => (
              <button key={p.key} onClick={() => setPayoutPreset(p.key)}
                className={`w-full text-left border rounded-2xl p-3 ${form.payout_preset === p.key ? 'border-horses-500 bg-horses-500/10' : 'border-gray-800 hover:border-horses-500/40'}`}>
                <span className="text-white">{p.label}</span>
                <span className="text-gray-400 text-sm ml-2">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Admin fee, payment handles, format-specific */}
      {step === 5 && (
        <div className="space-y-4">
          <h2 className="text-lg text-white font-semibold">Admin Fee & Payment</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Admin Fee Type</label>
              <select value={form.admin_fee_type} onChange={e => setField('admin_fee_type', e.target.value)} className={input}>
                <option value="">None</option>
                <option value="flat">Flat ($)</option>
                <option value="percent">Percent (%)</option>
              </select>
            </div>
            {form.admin_fee_type && (
              <div>
                <label className={labelCls}>Fee Amount</label>
                <input type="number" value={form.admin_fee_value} onChange={e => setField('admin_fee_value', Number(e.target.value))} min="0" className={input} />
              </div>
            )}
          </div>
          <div className="space-y-3 mt-4">
            <div><label className={labelCls}>Venmo Handle</label><input value={form.venmo} onChange={e => setField('venmo', e.target.value)} placeholder="@your-venmo" className={input} /></div>
            <div><label className={labelCls}>PayPal</label><input value={form.paypal} onChange={e => setField('paypal', e.target.value)} placeholder="email@example.com" className={input} /></div>
            <div><label className={labelCls}>Zelle</label><input value={form.zelle} onChange={e => setField('zelle', e.target.value)} placeholder="Phone or email" className={input} /></div>
          </div>
          {form.format_type === 'squares' && (
            <div className="mt-4">
              <label className={labelCls}>Max Squares Per Person (1-100)</label>
              <input type="number" value={form.squares_per_person_cap} onChange={e => setField('squares_per_person_cap', Number(e.target.value))} min="1" max="100" className={input} />
            </div>
          )}
          {form.format_type === 'pick_wps' && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div><label className={labelCls}>Win pts</label><input type="number" value={form.scoring_config.win} onChange={e => setField('scoring_config', { ...form.scoring_config, win: Number(e.target.value) })} className={input} /></div>
              <div><label className={labelCls}>Place pts</label><input type="number" value={form.scoring_config.place} onChange={e => setField('scoring_config', { ...form.scoring_config, place: Number(e.target.value) })} className={input} /></div>
              <div><label className={labelCls}>Show pts</label><input type="number" value={form.scoring_config.show} onChange={e => setField('scoring_config', { ...form.scoring_config, show: Number(e.target.value) })} className={input} /></div>
            </div>
          )}
        </div>
      )}

      {/* Step 6: Confirm */}
      {step === 6 && (
        <div className="space-y-4">
          <h2 className="text-lg text-white font-semibold">Confirm & Create</h2>
          <div className="border border-gray-800 rounded-2xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Event</span><span className="text-white">{selectedEvent?.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Format</span><span className="text-white">{FORMATS.find(f => f.value === form.format_type)?.label}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Pool Name</span><span className="text-white">{form.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Entry Fee</span><span className="text-white">${form.entry_fee}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Payout</span><span className="text-white">{form.payout_structure.map(p => `${p.pct}%`).join(' / ')}</span></div>
            {form.admin_fee_type && <div className="flex justify-between"><span className="text-gray-400">Admin Fee</span><span className="text-white">{form.admin_fee_type === 'flat' ? `$${form.admin_fee_value}` : `${form.admin_fee_value}%`}</span></div>}
          </div>
          <button onClick={handleSubmit} disabled={submitting}
            className="w-full bg-horses-500 hover:bg-horses-600 text-white py-3 rounded-2xl font-medium disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Pool'}
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        {step > 1 ? <button onClick={() => setStep(s => s - 1)} className="text-gray-400 hover:text-white text-sm">Back</button> : <div />}
        {step < 6 && (
          <button onClick={() => setStep(s => s + 1)} disabled={!canNext()}
            className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-6 py-2 rounded-2xl disabled:opacity-30">
            Next
          </button>
        )}
      </div>
    </div>
  );
}
