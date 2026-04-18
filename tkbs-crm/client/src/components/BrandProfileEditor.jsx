import React, { useState } from 'react';

// ============================================================================
// Helpers
// ============================================================================

// Walk sidecar using dotted path to find { confidence, source_quote }
function getSidecarEntry(sidecar, path) {
  if (!sidecar) return null;
  const parts = path.split('.');
  let node = sidecar;
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return null;
    node = node[p];
  }
  if (!node || typeof node !== 'object') return null;
  if (node.confidence == null && !node.source_quote) return null;
  return node;
}

function confidenceColor(conf) {
  if (conf == null) return { bg: '#F7F8FA', text: '#94a3b8', border: '#E2E6EB' };
  if (conf >= 0.8) return { bg: '#E6FAF5', text: '#00D4AA', border: '#00D4AA' };
  if (conf >= 0.5) return { bg: '#FFF3E0', text: '#E6A817', border: '#E6A817' };
  return { bg: '#FEE2E2', text: '#dc2626', border: '#dc2626' };
}

// Fields we treat as "required" to consider the Brand Profile complete.
const REQUIRED = new Set([
  'business_name', 'industry',
  'customer_avatar.name', 'customer_avatar.pain_points',
  'brand_personality.traits',
  'visual_identity.primary_color',
  'brand_voice.tone',
]);

// ============================================================================
// Field primitives
// ============================================================================

function SourceQuotePopover({ entry }) {
  const [open, setOpen] = useState(false);
  if (!entry) return null;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          width: 16, height: 16, borderRadius: 8, border: '1px solid #E2E6EB',
          background: '#fff', color: '#64748B', fontSize: 10, fontWeight: 600,
          cursor: 'pointer', padding: 0, lineHeight: '14px',
        }}
        title="Source quote from transcript"
      >?</button>
      {open && entry.source_quote && (
        <div
          style={{
            position: 'absolute', top: 22, left: 0, zIndex: 20,
            background: '#1B2838', color: '#fff', padding: '8px 10px',
            borderRadius: 4, fontSize: 12, lineHeight: 1.4, width: 320,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ fontSize: 10, color: '#00D4AA', fontWeight: 600, marginBottom: 4 }}>
            FROM TRANSCRIPT {entry.confidence != null && `· ${Math.round(entry.confidence * 100)}%`}
          </div>
          <div style={{ fontStyle: 'italic' }}>&ldquo;{entry.source_quote}&rdquo;</div>
        </div>
      )}
    </span>
  );
}

function FieldRow({ label, path, sidecar, excluded, onToggleExclude, required, children }) {
  const entry = getSidecarEntry(sidecar, path);
  const colors = confidenceColor(entry?.confidence);
  return (
    <div style={{ marginBottom: 14, opacity: excluded ? 0.5 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <label style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
          {label}
          {required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
        </label>
        {entry && (
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600,
            background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
          }}>
            {Math.round(entry.confidence * 100)}%
          </span>
        )}
        <SourceQuotePopover entry={entry} />
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => onToggleExclude(path)}
          style={{
            background: 'none', border: 'none', fontSize: 11,
            color: excluded ? '#00D4AA' : '#94a3b8', cursor: 'pointer', padding: 0,
            fontWeight: 600,
          }}
          title={excluded ? 'Include this field when feeding it to automations' : 'Exclude this field from automation generation'}
        >
          {excluded ? '+ Include' : '× Reject'}
        </button>
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
  borderRadius: 4, fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

function TextInput({ value, onChange, disabled, placeholder }) {
  return (
    <input
      type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      disabled={disabled} placeholder={placeholder || ''} style={inputStyle}
    />
  );
}

function Textarea({ value, onChange, disabled, rows = 3 }) {
  return (
    <textarea
      value={value ?? ''} onChange={(e) => onChange(e.target.value)}
      disabled={disabled} rows={rows}
      style={{ ...inputStyle, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
    />
  );
}

function NumberInput({ value, onChange, disabled }) {
  return (
    <input
      type="number" min="0" value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : parseInt(e.target.value))}
      disabled={disabled} style={inputStyle}
    />
  );
}

function EnumSelect({ value, onChange, disabled, options }) {
  return (
    <select
      value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      style={{ ...inputStyle, background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <option value="">—</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function TagInput({ value, onChange, disabled, placeholder }) {
  const items = Array.isArray(value) ? value : [];
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft('');
  };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6,
        minHeight: items.length ? 0 : 0,
      }}>
        {items.map((item, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, padding: '3px 8px', borderRadius: 12,
            background: '#F7F8FA', color: '#1B2838', border: '1px solid #E2E6EB',
          }}>
            {item}
            {!disabled && (
              <button
                type="button" onClick={() => remove(i)}
                style={{
                  background: 'none', border: 'none', color: '#94a3b8',
                  cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1,
                }}
              >×</button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
            }}
            placeholder={placeholder || 'Type and press Enter'}
            style={{ ...inputStyle, padding: '6px 10px', fontSize: 13, flex: 1 }}
          />
          <button
            type="button" onClick={add} disabled={!draft.trim()}
            style={{
              padding: '6px 12px', background: '#fff', color: '#1B2838',
              border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13,
              fontWeight: 600, cursor: draft.trim() ? 'pointer' : 'not-allowed',
              opacity: draft.trim() ? 1 : 0.6,
            }}
          >Add</button>
        </div>
      )}
    </div>
  );
}

function ColorInput({ value, onChange, disabled }) {
  const isHex = typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 4, border: '1px solid #E2E6EB',
        background: isHex ? value : '#fff',
        backgroundImage: isHex ? 'none' : 'repeating-linear-gradient(45deg, #F7F8FA, #F7F8FA 4px, #fff 4px, #fff 8px)',
        flexShrink: 0,
      }} />
      <input
        type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled} placeholder="#000000"
        style={{ ...inputStyle, fontFamily: 'monospace' }}
      />
    </div>
  );
}

// ============================================================================
// Section wrapper
// ============================================================================

function Section({ title, requiredFilled, totalRequired, children }) {
  const [open, setOpen] = useState(true);
  const isComplete = requiredFilled === totalRequired && totalRequired > 0;
  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
      marginBottom: 12, overflow: 'hidden',
    }}>
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', padding: '14px 20px', background: '#F7F8FA',
          border: 'none', borderBottom: open ? '1px solid #E2E6EB' : 'none',
          display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: 4,
          background: isComplete ? '#00D4AA' : '#E2E6EB', flexShrink: 0,
        }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1B2838', flex: 1 }}>
          {title}
        </span>
        {totalRequired > 0 && (
          <span style={{ fontSize: 11, color: '#64748B' }}>
            {requiredFilled}/{totalRequired} required
          </span>
        )}
        <span style={{ fontSize: 14, color: '#64748B' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ padding: 20 }}>{children}</div>}
    </div>
  );
}

// ============================================================================
// Main editor
// ============================================================================

export default function BrandProfileEditor({
  profile, sidecar, excludedFields, onChange, disabled,
}) {
  // Update nested scalar via dotted path
  const setField = (path, value) => {
    const parts = path.split('.');
    const next = JSON.parse(JSON.stringify(profile || {}));
    let node = next;
    for (let i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] == null || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
    onChange(next, path);
  };

  const toggleExclude = (path) => {
    const next = excludedFields.includes(path)
      ? excludedFields.filter((p) => p !== path)
      : [...excludedFields, path];
    onChange(profile, null, next);
  };

  const isExcluded = (path) => excludedFields.includes(path);

  // Per-section completion counts
  const isFilled = (value) => {
    if (value == null || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  };

  const sectionStats = {
    business: {
      required: ['business_name', 'industry'],
      filled: [profile?.business_name, profile?.industry].filter(isFilled).length,
    },
    avatar: {
      required: ['customer_avatar.name', 'customer_avatar.pain_points'],
      filled: [profile?.customer_avatar?.name, profile?.customer_avatar?.pain_points].filter(isFilled).length,
    },
    personality: {
      required: ['brand_personality.traits'],
      filled: [profile?.brand_personality?.traits].filter(isFilled).length,
    },
    visual: {
      required: ['visual_identity.primary_color'],
      filled: [profile?.visual_identity?.primary_color].filter(isFilled).length,
    },
    voice: {
      required: ['brand_voice.tone'],
      filled: [profile?.brand_voice?.tone].filter(isFilled).length,
    },
  };

  if (!profile) {
    return (
      <div style={{
        background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
        padding: 40, textAlign: 'center', fontSize: 13, color: '#64748B',
      }}>
        No extraction yet. Paste a transcript above and click <strong>✨ Extract Brand Profile</strong>.
      </div>
    );
  }

  const req = (path) => REQUIRED.has(path);

  return (
    <div>
      <Section
        title="Business Identity"
        requiredFilled={sectionStats.business.filled}
        totalRequired={sectionStats.business.required.length}
      >
        <FieldRow label="Business name" path="business_name" sidecar={sidecar} required={req('business_name')}
          excluded={isExcluded('business_name')} onToggleExclude={toggleExclude}>
          <TextInput value={profile.business_name} onChange={(v) => setField('business_name', v)}
            disabled={disabled || isExcluded('business_name')} />
        </FieldRow>
        <FieldRow label="Industry" path="industry" sidecar={sidecar} required={req('industry')}
          excluded={isExcluded('industry')} onToggleExclude={toggleExclude}>
          <TextInput value={profile.industry} onChange={(v) => setField('industry', v)}
            disabled={disabled || isExcluded('industry')} />
        </FieldRow>
        <FieldRow label="Description" path="business_description" sidecar={sidecar}
          excluded={isExcluded('business_description')} onToggleExclude={toggleExclude}>
          <Textarea value={profile.business_description} onChange={(v) => setField('business_description', v)}
            disabled={disabled || isExcluded('business_description')} rows={3} />
        </FieldRow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FieldRow label="Website" path="website_url" sidecar={sidecar}
            excluded={isExcluded('website_url')} onToggleExclude={toggleExclude}>
            <TextInput value={profile.website_url} onChange={(v) => setField('website_url', v)}
              disabled={disabled || isExcluded('website_url')} placeholder="https://..." />
          </FieldRow>
          <FieldRow label="Phone" path="phone" sidecar={sidecar}
            excluded={isExcluded('phone')} onToggleExclude={toggleExclude}>
            <TextInput value={profile.phone} onChange={(v) => setField('phone', v)}
              disabled={disabled || isExcluded('phone')} />
          </FieldRow>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
          <FieldRow label="City" path="location_city" sidecar={sidecar}
            excluded={isExcluded('location_city')} onToggleExclude={toggleExclude}>
            <TextInput value={profile.location_city} onChange={(v) => setField('location_city', v)}
              disabled={disabled || isExcluded('location_city')} />
          </FieldRow>
          <FieldRow label="State" path="location_state" sidecar={sidecar}
            excluded={isExcluded('location_state')} onToggleExclude={toggleExclude}>
            <TextInput value={profile.location_state} onChange={(v) => setField('location_state', v)}
              disabled={disabled || isExcluded('location_state')} placeholder="MI" />
          </FieldRow>
          <FieldRow label="Years in business" path="years_in_business" sidecar={sidecar}
            excluded={isExcluded('years_in_business')} onToggleExclude={toggleExclude}>
            <NumberInput value={profile.years_in_business} onChange={(v) => setField('years_in_business', v)}
              disabled={disabled || isExcluded('years_in_business')} />
          </FieldRow>
        </div>
        <FieldRow label="Revenue streams" path="revenue_streams" sidecar={sidecar}
          excluded={isExcluded('revenue_streams')} onToggleExclude={toggleExclude}>
          <Textarea value={profile.revenue_streams} onChange={(v) => setField('revenue_streams', v)}
            disabled={disabled || isExcluded('revenue_streams')} rows={2} />
        </FieldRow>
      </Section>

      <Section
        title="Customer Avatar"
        requiredFilled={sectionStats.avatar.filled}
        totalRequired={sectionStats.avatar.required.length}
      >
        <FieldRow label="Name" path="customer_avatar.name" sidecar={sidecar} required={req('customer_avatar.name')}
          excluded={isExcluded('customer_avatar.name')} onToggleExclude={toggleExclude}>
          <TextInput value={profile.customer_avatar?.name} onChange={(v) => setField('customer_avatar.name', v)}
            disabled={disabled || isExcluded('customer_avatar.name')} placeholder="e.g. Styled Sarah" />
        </FieldRow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <FieldRow label="Age range" path="customer_avatar.age_range" sidecar={sidecar}
            excluded={isExcluded('customer_avatar.age_range')} onToggleExclude={toggleExclude}>
            <TextInput value={profile.customer_avatar?.age_range}
              onChange={(v) => setField('customer_avatar.age_range', v)}
              disabled={disabled || isExcluded('customer_avatar.age_range')} placeholder="30-45" />
          </FieldRow>
          <FieldRow label="Gender" path="customer_avatar.gender" sidecar={sidecar}
            excluded={isExcluded('customer_avatar.gender')} onToggleExclude={toggleExclude}>
            <TextInput value={profile.customer_avatar?.gender}
              onChange={(v) => setField('customer_avatar.gender', v)}
              disabled={disabled || isExcluded('customer_avatar.gender')} />
          </FieldRow>
          <FieldRow label="Occupation" path="customer_avatar.occupation" sidecar={sidecar}
            excluded={isExcluded('customer_avatar.occupation')} onToggleExclude={toggleExclude}>
            <TextInput value={profile.customer_avatar?.occupation}
              onChange={(v) => setField('customer_avatar.occupation', v)}
              disabled={disabled || isExcluded('customer_avatar.occupation')} />
          </FieldRow>
        </div>
        <FieldRow label="Pain points" path="customer_avatar.pain_points" sidecar={sidecar} required={req('customer_avatar.pain_points')}
          excluded={isExcluded('customer_avatar.pain_points')} onToggleExclude={toggleExclude}>
          <TagInput value={profile.customer_avatar?.pain_points}
            onChange={(v) => setField('customer_avatar.pain_points', v)}
            disabled={disabled || isExcluded('customer_avatar.pain_points')} />
        </FieldRow>
        <FieldRow label="Goals" path="customer_avatar.goals" sidecar={sidecar}
          excluded={isExcluded('customer_avatar.goals')} onToggleExclude={toggleExclude}>
          <TagInput value={profile.customer_avatar?.goals}
            onChange={(v) => setField('customer_avatar.goals', v)}
            disabled={disabled || isExcluded('customer_avatar.goals')} />
        </FieldRow>
        <FieldRow label="Objections" path="customer_avatar.objections" sidecar={sidecar}
          excluded={isExcluded('customer_avatar.objections')} onToggleExclude={toggleExclude}>
          <TagInput value={profile.customer_avatar?.objections}
            onChange={(v) => setField('customer_avatar.objections', v)}
            disabled={disabled || isExcluded('customer_avatar.objections')} />
        </FieldRow>
        <FieldRow label="Where they are online" path="customer_avatar.where_online" sidecar={sidecar}
          excluded={isExcluded('customer_avatar.where_online')} onToggleExclude={toggleExclude}>
          <TagInput value={profile.customer_avatar?.where_online}
            onChange={(v) => setField('customer_avatar.where_online', v)}
            disabled={disabled || isExcluded('customer_avatar.where_online')}
            placeholder="Instagram, LinkedIn..." />
        </FieldRow>
      </Section>

      <Section
        title="Brand Personality"
        requiredFilled={sectionStats.personality.filled}
        totalRequired={sectionStats.personality.required.length}
      >
        <FieldRow label="Traits" path="brand_personality.traits" sidecar={sidecar} required={req('brand_personality.traits')}
          excluded={isExcluded('brand_personality.traits')} onToggleExclude={toggleExclude}>
          <TagInput value={profile.brand_personality?.traits}
            onChange={(v) => setField('brand_personality.traits', v)}
            disabled={disabled || isExcluded('brand_personality.traits')}
            placeholder="bold, warm, expert..." />
        </FieldRow>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <FieldRow label="Mood" path="brand_personality.mood" sidecar={sidecar}
            excluded={isExcluded('brand_personality.mood')} onToggleExclude={toggleExclude}>
            <TextInput value={profile.brand_personality?.mood}
              onChange={(v) => setField('brand_personality.mood', v)}
              disabled={disabled || isExcluded('brand_personality.mood')} />
          </FieldRow>
          <FieldRow label="Formality" path="brand_personality.formality_level" sidecar={sidecar}
            excluded={isExcluded('brand_personality.formality_level')} onToggleExclude={toggleExclude}>
            <EnumSelect value={profile.brand_personality?.formality_level}
              onChange={(v) => setField('brand_personality.formality_level', v)}
              disabled={disabled || isExcluded('brand_personality.formality_level')}
              options={['casual', 'neutral', 'formal']} />
          </FieldRow>
        </div>
        <FieldRow label="Keywords" path="brand_personality.keywords" sidecar={sidecar}
          excluded={isExcluded('brand_personality.keywords')} onToggleExclude={toggleExclude}>
          <TagInput value={profile.brand_personality?.keywords}
            onChange={(v) => setField('brand_personality.keywords', v)}
            disabled={disabled || isExcluded('brand_personality.keywords')} />
        </FieldRow>
      </Section>

      <Section
        title="Visual Identity"
        requiredFilled={sectionStats.visual.filled}
        totalRequired={sectionStats.visual.required.length}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FieldRow label="Primary color" path="visual_identity.primary_color" sidecar={sidecar} required={req('visual_identity.primary_color')}
            excluded={isExcluded('visual_identity.primary_color')} onToggleExclude={toggleExclude}>
            <ColorInput value={profile.visual_identity?.primary_color}
              onChange={(v) => setField('visual_identity.primary_color', v)}
              disabled={disabled || isExcluded('visual_identity.primary_color')} />
          </FieldRow>
          <FieldRow label="Secondary color" path="visual_identity.secondary_color" sidecar={sidecar}
            excluded={isExcluded('visual_identity.secondary_color')} onToggleExclude={toggleExclude}>
            <ColorInput value={profile.visual_identity?.secondary_color}
              onChange={(v) => setField('visual_identity.secondary_color', v)}
              disabled={disabled || isExcluded('visual_identity.secondary_color')} />
          </FieldRow>
          <FieldRow label="Accent color" path="visual_identity.accent_color" sidecar={sidecar}
            excluded={isExcluded('visual_identity.accent_color')} onToggleExclude={toggleExclude}>
            <ColorInput value={profile.visual_identity?.accent_color}
              onChange={(v) => setField('visual_identity.accent_color', v)}
              disabled={disabled || isExcluded('visual_identity.accent_color')} />
          </FieldRow>
          <FieldRow label="Neutral color" path="visual_identity.neutral_color" sidecar={sidecar}
            excluded={isExcluded('visual_identity.neutral_color')} onToggleExclude={toggleExclude}>
            <ColorInput value={profile.visual_identity?.neutral_color}
              onChange={(v) => setField('visual_identity.neutral_color', v)}
              disabled={disabled || isExcluded('visual_identity.neutral_color')} />
          </FieldRow>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FieldRow label="Heading font" path="visual_identity.heading_font" sidecar={sidecar}
            excluded={isExcluded('visual_identity.heading_font')} onToggleExclude={toggleExclude}>
            <TextInput value={profile.visual_identity?.heading_font}
              onChange={(v) => setField('visual_identity.heading_font', v)}
              disabled={disabled || isExcluded('visual_identity.heading_font')}
              placeholder="Inter, Montserrat..." />
          </FieldRow>
          <FieldRow label="Body font" path="visual_identity.body_font" sidecar={sidecar}
            excluded={isExcluded('visual_identity.body_font')} onToggleExclude={toggleExclude}>
            <TextInput value={profile.visual_identity?.body_font}
              onChange={(v) => setField('visual_identity.body_font', v)}
              disabled={disabled || isExcluded('visual_identity.body_font')} />
          </FieldRow>
        </div>
        <FieldRow label="Style keywords" path="visual_identity.style_keywords" sidecar={sidecar}
          excluded={isExcluded('visual_identity.style_keywords')} onToggleExclude={toggleExclude}>
          <TagInput value={profile.visual_identity?.style_keywords}
            onChange={(v) => setField('visual_identity.style_keywords', v)}
            disabled={disabled || isExcluded('visual_identity.style_keywords')}
            placeholder="minimalist, warm, clean..." />
        </FieldRow>
      </Section>

      <Section
        title="Brand Voice"
        requiredFilled={sectionStats.voice.filled}
        totalRequired={sectionStats.voice.required.length}
      >
        <FieldRow label="Tone" path="brand_voice.tone" sidecar={sidecar} required={req('brand_voice.tone')}
          excluded={isExcluded('brand_voice.tone')} onToggleExclude={toggleExclude}>
          <TagInput value={profile.brand_voice?.tone}
            onChange={(v) => setField('brand_voice.tone', v)}
            disabled={disabled || isExcluded('brand_voice.tone')}
            placeholder="warm, direct, authoritative..." />
        </FieldRow>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FieldRow label="Do's" path="brand_voice.dos" sidecar={sidecar}
            excluded={isExcluded('brand_voice.dos')} onToggleExclude={toggleExclude}>
            <TagInput value={profile.brand_voice?.dos}
              onChange={(v) => setField('brand_voice.dos', v)}
              disabled={disabled || isExcluded('brand_voice.dos')}
              placeholder='Use "you"' />
          </FieldRow>
          <FieldRow label="Don'ts" path="brand_voice.donts" sidecar={sidecar}
            excluded={isExcluded('brand_voice.donts')} onToggleExclude={toggleExclude}>
            <TagInput value={profile.brand_voice?.donts}
              onChange={(v) => setField('brand_voice.donts', v)}
              disabled={disabled || isExcluded('brand_voice.donts')}
              placeholder="Corporate jargon" />
          </FieldRow>
        </div>
        <FieldRow label="Sample phrases" path="brand_voice.sample_phrases" sidecar={sidecar}
          excluded={isExcluded('brand_voice.sample_phrases')} onToggleExclude={toggleExclude}>
          <TagInput value={profile.brand_voice?.sample_phrases}
            onChange={(v) => setField('brand_voice.sample_phrases', v)}
            disabled={disabled || isExcluded('brand_voice.sample_phrases')} />
        </FieldRow>
        <FieldRow label="Tagline" path="brand_voice.tagline" sidecar={sidecar}
          excluded={isExcluded('brand_voice.tagline')} onToggleExclude={toggleExclude}>
          <TextInput value={profile.brand_voice?.tagline}
            onChange={(v) => setField('brand_voice.tagline', v)}
            disabled={disabled || isExcluded('brand_voice.tagline')} />
        </FieldRow>
      </Section>
    </div>
  );
}
