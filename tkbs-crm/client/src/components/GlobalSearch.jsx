import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

// Client search via the server-side /api/clients?search filter. Engagements
// and calls aren't indexed here yet — add a dedicated /api/search that joins
// those if we need cross-entity hits later.

export default function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setLoading(false);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api.getClients({ search: query.trim() });
        setResults((data.clients || []).slice(0, 10));
      } catch (err) {
        console.error('[GlobalSearch] fetch error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(Math.max(0, results.length - 1));
    }
  }, [results.length, selectedIndex]);

  const openResult = (client) => {
    onClose();
    navigate(`/clients/${client.id}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((prev) => Math.max(prev - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) openResult(results[selectedIndex]);
      return;
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 120,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 560, maxHeight: 'calc(100vh - 200px)', background: '#fff',
          borderRadius: 8, border: '1px solid #E2E6EB',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onKeyDown={handleKeyDown}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E6EB' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Search clients — name, email, contact, website…"
            style={{
              width: '100%', fontSize: 18, border: 'none', outline: 'none',
              padding: '4px 0', background: 'transparent', color: '#1B2838',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 0', flex: 1 }}>
          {query.trim().length > 0 && query.trim().length < 2 && (
            <div style={{ padding: '24px 20px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
              Type at least 2 characters
            </div>
          )}
          {loading && query.trim().length >= 2 && (
            <div style={{ padding: '24px 20px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
              Searching…
            </div>
          )}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div style={{ padding: '24px 20px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
              No clients match.
            </div>
          )}
          {!loading && results.map((c, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={c.id}
                onClick={() => openResult(c)}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  padding: '10px 20px', cursor: 'pointer',
                  background: isSelected ? '#F7F8FA' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.04em', padding: '2px 6px', borderRadius: 3,
                  color: '#fff', background: '#1B2838', flexShrink: 0,
                }}>
                  Client
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1B2838' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[c.industry, c.primary_contact_name, c.email, c.website].filter(Boolean).join(' · ') || 'No profile yet'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {results.length > 0 && (
          <div style={{
            padding: '8px 20px', borderTop: '1px solid #E2E6EB',
            fontSize: 11, color: '#94a3b8', display: 'flex', gap: 12,
          }}>
            <span><b style={{ color: '#64748B' }}>↑↓</b> navigate</span>
            <span><b style={{ color: '#64748B' }}>↵</b> open</span>
            <span><b style={{ color: '#64748B' }}>esc</b> close</span>
          </div>
        )}
      </div>
    </div>
  );
}
