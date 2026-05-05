'use client';

// Generic modal — backdrop click + × button close, body scroll lock.
// Pass `onClose={undefined}` (or omit it) to suppress the close handlers
// while a long operation is running.

import { useEffect } from 'react';

export default function Modal({
  open, onClose, title, width = 480, children,
}: {
  open: boolean;
  onClose?: () => void;
  title?: string;
  width?: number;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 8, padding: 24, width,
          maxHeight: '85vh', overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{title}</h2>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', fontSize: 20,
                cursor: 'pointer', color: '#64748B', lineHeight: 1,
              }}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
