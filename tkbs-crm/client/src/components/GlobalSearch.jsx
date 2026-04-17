import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const TYPE_LABELS = {
  deal: 'Deal',
  company: 'Company',
  contact: 'Contact',
  call: 'Call',
};

const TYPE_COLORS = {
  deal: '#00D4AA',
  company: '#1B2838',
  contact: '#64748B',
  call: '#E6A817',
};

const TYPE_ORDER = ['deal', 'company', 'contact', 'call'];

export default function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setLoading(false);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
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
        const data = await api.request('/search?q=' + encodeURIComponent(query.trim()));
        setResults(data.results || []);
      } catch (err) {
        console.error('[GlobalSearch] fetch error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Build grouped flat list for keyboard nav
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }
  const flatResults = [];
  for (const type of TYPE_ORDER) {
    if (grouped[type]) {
      for (const item of grouped[type]) {
        flatResults.push(item);
      }
    }
  }

  // Keep selectedIndex in bounds
  useEffect(() => {
    if (selectedIndex >= flatResults.length) {
      setSelectedIndex(Math.max(0, flatResults.length - 1));
    }
  }, [flatResults.length]);

  const handleNavigate = (item) => {
    onClose();
    navigate(item.url);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults[selectedIndex]) {
        handleNavigate(flatResults[selectedIndex]);
      }
      return;
    }
  };

  if (!open) return null;

  // Track which section headers have been rendered
  let currentFlatIndex = 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 120,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 560,
          maxHeight: 'calc(100vh - 200px)',
          background: '#fff',
          borderRadius: 8,
          border: '1px solid #E2E6EB',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E6EB',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search deals, companies, contacts, calls..."
            style={{
              width: '100%',
              fontSize: 18,
              border: 'none',
              outline: 'none',
              padding: '4px 0',
              background: 'transparent',
              color: '#1B2838',
            }}
          />
        </div>

        {/* Results area */}
        <div
          style={{
            overflowY: 'auto',
            padding: '8px 0',
            flex: 1,
          }}
        >
          {/* Helper text for short query */}
          {query.trim().length > 0 && query.trim().length < 2 && (
            <div style={{ padding: '24px 20px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
              Type at least 2 characters
            </div>
          )}

          {/* Loading state */}
          {loading && query.trim().length >= 2 && (
            <div style={{ padding: '24px 20px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
              Searching...
            </div>
          )}

          {/* No results */}
          {!loading && query.trim().length >= 2 && flatResults.length === 0 && (
            <div style={{ padding: '24px 20px', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
              No results
            </div>
          )}

          {/* Grouped results */}
          {!loading && flatResults.length > 0 && TYPE_ORDER.map((type) => {
            const items = grouped[type];
            if (!items || items.length === 0) return null;

            const sectionStartIndex = currentFlatIndex;

            return (
              <div key={type}>
                {/* Section header */}
                <div
                  style={{
                    padding: '8px 20px 4px',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#94a3b8',
                  }}
                >
                  {TYPE_LABELS[type]}s
                </div>

                {/* Result rows */}
                {items.map((item, i) => {
                  const flatIdx = sectionStartIndex + i;
                  const isSelected = flatIdx === selectedIndex;
                  // Increment the outer counter after last item
                  if (i === items.length - 1) {
                    currentFlatIndex = sectionStartIndex + items.length;
                  }

                  return (
                    <div
                      key={item.type + '-' + item.id}
                      onClick={() => handleNavigate(item)}
                      style={{
                        padding: '8px 20px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: isSelected ? '#F7F8FA' : 'transparent',
                      }}
                      onMouseEnter={() => setSelectedIndex(flatIdx)}
                    >
                      {/* Type badge */}
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '2px 6px',
                          borderRadius: 3,
                          color: '#fff',
                          background: TYPE_COLORS[item.type] || '#64748B',
                          flexShrink: 0,
                        }}
                      >
                        {TYPE_LABELS[item.type]}
                      </span>

                      {/* Title + subtitle */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            color: '#1B2838',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div
                            style={{
                              fontSize: 12,
                              color: '#64748B',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              marginTop: 1,
                            }}
                          >
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        {flatResults.length > 0 && (
          <div
            style={{
              padding: '8px 20px',
              borderTop: '1px solid #E2E6EB',
              fontSize: 11,
              color: '#94a3b8',
              display: 'flex',
              gap: 12,
            }}
          >
            <span><b style={{ color: '#64748B' }}>\u2191\u2193</b> navigate</span>
            <span><b style={{ color: '#64748B' }}>\u21B5</b> open</span>
            <span><b style={{ color: '#64748B' }}>esc</b> close</span>
          </div>
        )}
      </div>
    </div>
  );
}
