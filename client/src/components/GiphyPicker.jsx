import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';

export default function GiphyPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const fetchGifs = useCallback(async (q) => {
    setLoading(true);
    try {
      const endpoint = q.trim() ? `/giphy/search?q=${encodeURIComponent(q)}&limit=18` : '/giphy/trending?limit=18';
      const res = await api.get(endpoint);
      setGifs(res.data.results || []);
    } catch (err) {
      console.error('GIPHY error', err);
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    fetchGifs('');
  }, [fetchGifs]);

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGifs(val), 400);
  };

  return (
    <div
      ref={containerRef}
      className="absolute z-50 bottom-full mb-2 left-0 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Search bar */}
      <div className="p-2 border-b border-gray-800">
        <input
          ref={inputRef}
          value={query}
          onChange={handleQueryChange}
          placeholder="Search GIFs..."
          className="w-full bg-gray-800 text-white text-sm px-3 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-brand-500 placeholder-gray-500"
        />
      </div>

      {/* GIF grid */}
      <div className="h-52 overflow-y-auto p-1.5">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading...</div>
        ) : gifs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">No results</div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {gifs.map(gif => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.media_formats?.gif?.url || gif.media_formats?.tinygif?.url)}
                className="aspect-square overflow-hidden rounded-lg hover:ring-2 hover:ring-brand-500 transition-all bg-gray-800"
                title={gif.title}
              >
                <img
                  src={gif.media_formats?.tinygif?.url}
                  alt={gif.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Powered by GIPHY */}
      <div className="px-2 py-1 border-t border-gray-800 text-center">
        <span className="text-gray-600 text-[10px]">Powered by GIPHY</span>
      </div>
    </div>
  );
}
