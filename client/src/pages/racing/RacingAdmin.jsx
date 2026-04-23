import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';

const EMPTY_EVENT = { name: '', venue: '', race_date: '', post_time: '', default_lock_time: '', field_size: 20 };
const EMPTY_HORSE = { horse_name: '', post_position: '', jockey_name: '', trainer_name: '', morning_line_odds: '', silk_colors: '' };

export default function RacingAdmin() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [horses, setHorses] = useState([]);
  const [eventForm, setEventForm] = useState(EMPTY_EVENT);
  const [editingEventId, setEditingEventId] = useState(null);
  const [horseForm, setHorseForm] = useState(EMPTY_HORSE);
  const [editingHorseId, setEditingHorseId] = useState(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showHorseForm, setShowHorseForm] = useState(false);
  const [error, setError] = useState('');

  if (user?.role !== 'superadmin') {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-500">Access denied. Superadmin only.</div>;
  }

  useEffect(() => { loadEvents(); }, []);
  useEffect(() => { if (selectedEventId) loadHorses(selectedEventId); }, [selectedEventId]);

  async function loadEvents() {
    try {
      const r = await api.get('/racing/events');
      const list = r.data.events || [];
      setEvents(list);
      if (list.length && !selectedEventId) setSelectedEventId(list[0].id);
    } catch { setError('Failed to load events'); }
  }

  async function loadHorses(eventId) {
    try {
      const r = await api.get(`/racing/events/${eventId}/horses`);
      setHorses(r.data.horses || []);
    } catch { setError('Failed to load horses'); }
  }

  async function saveEvent(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingEventId) {
        await api.put(`/racing/events/${editingEventId}`, eventForm);
      } else {
        await api.post('/racing/events', eventForm);
      }
      setShowEventForm(false);
      setEditingEventId(null);
      setEventForm(EMPTY_EVENT);
      loadEvents();
    } catch (err) { setError(err.response?.data?.error || 'Failed to save event'); }
  }

  async function saveHorse(e) {
    e.preventDefault();
    setError('');
    const payload = { ...horseForm, post_position: horseForm.post_position ? Number(horseForm.post_position) : null };
    try {
      if (editingHorseId) {
        await api.put(`/racing/horses/${editingHorseId}`, payload);
      } else {
        await api.post(`/racing/events/${selectedEventId}/horses`, payload);
      }
      setShowHorseForm(false);
      setEditingHorseId(null);
      setHorseForm(EMPTY_HORSE);
      loadHorses(selectedEventId);
    } catch (err) { setError(err.response?.data?.error || 'Failed to save horse'); }
  }

  async function toggleScratch(horse) {
    try {
      await api.put(`/racing/horses/${horse.id}`, { status: horse.status === 'active' ? 'scratched' : 'active' });
      loadHorses(selectedEventId);
    } catch { setError('Failed to update horse status'); }
  }

  async function deleteHorse(horse) {
    if (!confirm(`Delete ${horse.horse_name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/racing/horses/${horse.id}`);
      loadHorses(selectedEventId);
    } catch { setError('Failed to delete horse'); }
  }

  function editEvent(ev) {
    setEditingEventId(ev.id);
    setEventForm({ name: ev.name, venue: ev.venue || '', race_date: ev.race_date || '', post_time: ev.post_time || '', default_lock_time: ev.default_lock_time || '', field_size: ev.field_size || 20 });
    setShowEventForm(true);
  }

  function editHorse(h) {
    setEditingHorseId(h.id);
    setHorseForm({ horse_name: h.horse_name, post_position: h.post_position || '', jockey_name: h.jockey_name || '', trainer_name: h.trainer_name || '', morning_line_odds: h.morning_line_odds || '', silk_colors: h.silk_colors || '' });
    setShowHorseForm(true);
  }

  function fmtDate(d) { return d ? new Date(d).toLocaleString() : '--'; }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <h1 className="text-2xl font-bold text-white">Racing Admin</h1>
      {error && <div className="text-red-400 text-sm border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

      {/* ── Events ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Events</h2>
          <button onClick={() => { setShowEventForm(true); setEditingEventId(null); setEventForm(EMPTY_EVENT); }} className="text-sm text-racing-400 hover:text-racing-300 underline">+ Create Event</button>
        </div>

        {showEventForm && (
          <form onSubmit={saveEvent} className="border border-gray-700 rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Event name *" value={eventForm.name} onChange={e => setEventForm(p => ({ ...p, name: e.target.value }))} required className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm col-span-2" />
              <input placeholder="Venue" value={eventForm.venue} onChange={e => setEventForm(p => ({ ...p, venue: e.target.value }))} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
              <input type="number" placeholder="Field size" value={eventForm.field_size} onChange={e => setEventForm(p => ({ ...p, field_size: e.target.value }))} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
              <input type="datetime-local" placeholder="Race date" value={eventForm.race_date?.slice(0, 16) || ''} onChange={e => setEventForm(p => ({ ...p, race_date: e.target.value }))} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
              <input type="datetime-local" placeholder="Post time" value={eventForm.post_time?.slice(0, 16) || ''} onChange={e => setEventForm(p => ({ ...p, post_time: e.target.value }))} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
              <input type="datetime-local" placeholder="Lock time" value={eventForm.default_lock_time?.slice(0, 16) || ''} onChange={e => setEventForm(p => ({ ...p, default_lock_time: e.target.value }))} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm col-span-2" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-racing-500 hover:bg-racing-600 text-white text-sm px-4 py-2 rounded">{editingEventId ? 'Update' : 'Create'}</button>
              <button type="button" onClick={() => { setShowEventForm(false); setEditingEventId(null); }} className="text-gray-400 text-sm px-4 py-2">Cancel</button>
            </div>
          </form>
        )}

        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-700 text-gray-400 text-left">
              <th className="px-4 py-2">Name</th><th className="px-4 py-2">Venue</th><th className="px-4 py-2">Race Date</th><th className="px-4 py-2">Post Time</th><th className="px-4 py-2">Status</th><th className="px-4 py-2"></th>
            </tr></thead>
            <tbody>
              {events.map(ev => (
                <tr key={ev.id} className={`border-b border-gray-800 ${selectedEventId === ev.id ? 'bg-gray-800/50' : ''}`} onClick={() => setSelectedEventId(ev.id)} style={{ cursor: 'pointer' }}>
                  <td className="px-4 py-2 text-white font-medium">{ev.name}</td>
                  <td className="px-4 py-2 text-gray-400">{ev.venue || '--'}</td>
                  <td className="px-4 py-2 text-gray-400">{fmtDate(ev.race_date)}</td>
                  <td className="px-4 py-2 text-gray-400">{fmtDate(ev.post_time)}</td>
                  <td className="px-4 py-2 text-gray-400 uppercase text-xs tracking-wide">{ev.status}</td>
                  <td className="px-4 py-2"><button onClick={(e) => { e.stopPropagation(); editEvent(ev); }} className="text-racing-400 hover:text-racing-300 text-xs underline">Edit</button></td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-500">No events yet</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Horse Field ── */}
      {selectedEventId && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Horse Field
              <span className="text-gray-500 text-sm font-normal ml-2">
                {events.find(e => e.id === selectedEventId)?.name}
              </span>
            </h2>
            <button onClick={() => { setShowHorseForm(true); setEditingHorseId(null); setHorseForm(EMPTY_HORSE); }} className="text-sm text-racing-400 hover:text-racing-300 underline">+ Add Horse</button>
          </div>

          {showHorseForm && (
            <form onSubmit={saveHorse} className="border border-gray-700 rounded-lg p-4 mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Horse name *" value={horseForm.horse_name} onChange={e => setHorseForm(p => ({ ...p, horse_name: e.target.value }))} required className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
                <input type="number" placeholder="Post position" value={horseForm.post_position} onChange={e => setHorseForm(p => ({ ...p, post_position: e.target.value }))} min="1" max="20" className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
                <input placeholder="Jockey" value={horseForm.jockey_name} onChange={e => setHorseForm(p => ({ ...p, jockey_name: e.target.value }))} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
                <input placeholder="Trainer" value={horseForm.trainer_name} onChange={e => setHorseForm(p => ({ ...p, trainer_name: e.target.value }))} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
                <input placeholder="Morning line odds (e.g. 5-1)" value={horseForm.morning_line_odds} onChange={e => setHorseForm(p => ({ ...p, morning_line_odds: e.target.value }))} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
                <input placeholder="Silk colors" value={horseForm.silk_colors} onChange={e => setHorseForm(p => ({ ...p, silk_colors: e.target.value }))} className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-racing-500 hover:bg-racing-600 text-white text-sm px-4 py-2 rounded">{editingHorseId ? 'Update' : 'Add'}</button>
                <button type="button" onClick={() => { setShowHorseForm(false); setEditingHorseId(null); }} className="text-gray-400 text-sm px-4 py-2">Cancel</button>
              </div>
            </form>
          )}

          <div className="border border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-700 text-gray-400 text-left">
                <th className="px-3 py-2">PP</th><th className="px-3 py-2">Horse</th><th className="px-3 py-2">Jockey</th><th className="px-3 py-2">Trainer</th><th className="px-3 py-2">ML Odds</th><th className="px-3 py-2">Status</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {horses.map(h => (
                  <tr key={h.id} className={`border-b border-gray-800 ${h.status === 'scratched' ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 text-gray-300 font-mono">{h.post_position || '--'}</td>
                    <td className={`px-3 py-2 text-white font-medium ${h.status === 'scratched' ? 'line-through' : ''}`}>{h.horse_name}</td>
                    <td className="px-3 py-2 text-gray-400">{h.jockey_name || '--'}</td>
                    <td className="px-3 py-2 text-gray-400">{h.trainer_name || '--'}</td>
                    <td className="px-3 py-2 text-gray-400">{h.morning_line_odds || '--'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleScratch(h)} className={`text-xs underline ${h.status === 'scratched' ? 'text-red-400' : 'text-green-400'}`}>
                        {h.status === 'scratched' ? 'SCRATCHED' : 'active'}
                      </button>
                    </td>
                    <td className="px-3 py-2 flex gap-2">
                      <button onClick={() => editHorse(h)} className="text-racing-400 hover:text-racing-300 text-xs underline">Edit</button>
                      <button onClick={() => deleteHorse(h)} className="text-red-400 hover:text-red-300 text-xs underline">Del</button>
                    </td>
                  </tr>
                ))}
                {horses.length === 0 && <tr><td colSpan="7" className="px-3 py-6 text-center text-gray-500">No horses added yet</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
