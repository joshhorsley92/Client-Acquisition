'use client';

// Streamlined Brand Profile editor for v1.0. Structured fields for the
// major sections (business, customer avatar, brand personality, visual
// identity, brand voice). Save writes back via PATCH /api/clients/[id],
// which auto-tags every changed leaf as 'manual' in brand_profile_sources.
//
// What's deferred to v1.x: sidecar confidence/source-quote pills, per-field
// "exclude from extraction" tagging. The backend supports both already.

import { useState, useEffect } from 'react';

export interface BrandProfile {
  business_name?: string | null;
  industry?: string | null;
  business_description?: string | null;
  website_url?: string | null;
  phone?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  years_in_business?: number | null;
  revenue_streams?: string | null;
  customer_avatar?: {
    name?: string | null;
    age_range?: string | null;
    gender?: string | null;
    occupation?: string | null;
    pain_points?: string[];
    goals?: string[];
    objections?: string[];
    where_online?: string[];
  };
  brand_personality?: {
    traits?: string[];
    mood?: string | null;
    formality_level?: 'casual' | 'neutral' | 'formal' | null;
    keywords?: string[];
  };
  visual_identity?: {
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
    neutral_color?: string | null;
    heading_font?: string | null;
    body_font?: string | null;
    style_keywords?: string[];
  };
  brand_voice?: {
    tone?: string[];
    dos?: string[];
    donts?: string[];
    sample_phrases?: string[];
    tagline?: string | null;
  };
}

export default function BrandProfileEditor({
  value, onChange, disabled,
}: {
  value: BrandProfile;
  onChange: (next: BrandProfile) => void;
  disabled?: boolean;
}) {
  // Local working copy so typing doesn't fire onChange on every keystroke;
  // we sync to parent via a useEffect after the render commits.
  const [local, setLocal] = useState<BrandProfile>(value);
  useEffect(() => { setLocal(value); }, [value]);

  function set(path: string[], v: any) {
    const next = JSON.parse(JSON.stringify(local));
    let node = next;
    for (let i = 0; i < path.length - 1; i++) {
      if (!node[path[i]] || typeof node[path[i]] !== 'object') node[path[i]] = {};
      node = node[path[i]];
    }
    node[path[path.length - 1]] = v;
    setLocal(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Business">
        <Row>
          <Field label="Business name">
            <Input value={local.business_name || ''} onChange={(v) => set(['business_name'], v)} disabled={disabled} />
          </Field>
          <Field label="Industry">
            <Input value={local.industry || ''} onChange={(v) => set(['industry'], v)} disabled={disabled} />
          </Field>
        </Row>
        <Field label="Business description">
          <Textarea value={local.business_description || ''} onChange={(v) => set(['business_description'], v)} disabled={disabled} rows={2} />
        </Field>
        <Row>
          <Field label="Website">
            <Input value={local.website_url || ''} onChange={(v) => set(['website_url'], v)} disabled={disabled} />
          </Field>
          <Field label="Phone">
            <Input value={local.phone || ''} onChange={(v) => set(['phone'], v)} disabled={disabled} />
          </Field>
        </Row>
        <Row>
          <Field label="City">
            <Input value={local.location_city || ''} onChange={(v) => set(['location_city'], v)} disabled={disabled} />
          </Field>
          <Field label="State">
            <Input value={local.location_state || ''} onChange={(v) => set(['location_state'], v)} disabled={disabled} />
          </Field>
        </Row>
        <Row>
          <Field label="Years in business">
            <Input
              type="number"
              value={local.years_in_business ?? ''}
              onChange={(v) => set(['years_in_business'], v ? Number(v) : null)}
              disabled={disabled}
            />
          </Field>
          <Field label="Revenue streams">
            <Input value={local.revenue_streams || ''} onChange={(v) => set(['revenue_streams'], v)} disabled={disabled} />
          </Field>
        </Row>
      </Section>

      <Section title="Customer avatar">
        <Row>
          <Field label="Avatar name">
            <Input value={local.customer_avatar?.name || ''} onChange={(v) => set(['customer_avatar', 'name'], v)} disabled={disabled} />
          </Field>
          <Field label="Age range">
            <Input value={local.customer_avatar?.age_range || ''} onChange={(v) => set(['customer_avatar', 'age_range'], v)} disabled={disabled} />
          </Field>
        </Row>
        <Row>
          <Field label="Gender">
            <Input value={local.customer_avatar?.gender || ''} onChange={(v) => set(['customer_avatar', 'gender'], v)} disabled={disabled} />
          </Field>
          <Field label="Occupation">
            <Input value={local.customer_avatar?.occupation || ''} onChange={(v) => set(['customer_avatar', 'occupation'], v)} disabled={disabled} />
          </Field>
        </Row>
        <Field label="Pain points (one per line)">
          <ListEditor value={local.customer_avatar?.pain_points || []} onChange={(v) => set(['customer_avatar', 'pain_points'], v)} disabled={disabled} />
        </Field>
        <Field label="Goals (one per line)">
          <ListEditor value={local.customer_avatar?.goals || []} onChange={(v) => set(['customer_avatar', 'goals'], v)} disabled={disabled} />
        </Field>
        <Field label="Objections (one per line)">
          <ListEditor value={local.customer_avatar?.objections || []} onChange={(v) => set(['customer_avatar', 'objections'], v)} disabled={disabled} />
        </Field>
        <Field label="Where they spend time online">
          <ListEditor value={local.customer_avatar?.where_online || []} onChange={(v) => set(['customer_avatar', 'where_online'], v)} disabled={disabled} />
        </Field>
      </Section>

      <Section title="Brand personality">
        <Field label="Traits">
          <ListEditor value={local.brand_personality?.traits || []} onChange={(v) => set(['brand_personality', 'traits'], v)} disabled={disabled} />
        </Field>
        <Row>
          <Field label="Mood">
            <Input value={local.brand_personality?.mood || ''} onChange={(v) => set(['brand_personality', 'mood'], v)} disabled={disabled} />
          </Field>
          <Field label="Formality">
            <select
              value={local.brand_personality?.formality_level || ''}
              onChange={(e) => set(['brand_personality', 'formality_level'], e.target.value || null)}
              disabled={disabled}
              className={inputClass}
            >
              <option value="">—</option>
              <option value="casual">Casual</option>
              <option value="neutral">Neutral</option>
              <option value="formal">Formal</option>
            </select>
          </Field>
        </Row>
        <Field label="Keywords">
          <ListEditor value={local.brand_personality?.keywords || []} onChange={(v) => set(['brand_personality', 'keywords'], v)} disabled={disabled} />
        </Field>
      </Section>

      <Section title="Visual identity">
        <Row>
          <ColorField label="Primary" value={local.visual_identity?.primary_color || ''} onChange={(v) => set(['visual_identity', 'primary_color'], v)} disabled={disabled} />
          <ColorField label="Secondary" value={local.visual_identity?.secondary_color || ''} onChange={(v) => set(['visual_identity', 'secondary_color'], v)} disabled={disabled} />
        </Row>
        <Row>
          <ColorField label="Accent" value={local.visual_identity?.accent_color || ''} onChange={(v) => set(['visual_identity', 'accent_color'], v)} disabled={disabled} />
          <ColorField label="Neutral" value={local.visual_identity?.neutral_color || ''} onChange={(v) => set(['visual_identity', 'neutral_color'], v)} disabled={disabled} />
        </Row>
        <Row>
          <Field label="Heading font">
            <Input value={local.visual_identity?.heading_font || ''} onChange={(v) => set(['visual_identity', 'heading_font'], v)} disabled={disabled} />
          </Field>
          <Field label="Body font">
            <Input value={local.visual_identity?.body_font || ''} onChange={(v) => set(['visual_identity', 'body_font'], v)} disabled={disabled} />
          </Field>
        </Row>
        <Field label="Style keywords">
          <ListEditor value={local.visual_identity?.style_keywords || []} onChange={(v) => set(['visual_identity', 'style_keywords'], v)} disabled={disabled} />
        </Field>
      </Section>

      <Section title="Brand voice">
        <Field label="Tone">
          <ListEditor value={local.brand_voice?.tone || []} onChange={(v) => set(['brand_voice', 'tone'], v)} disabled={disabled} />
        </Field>
        <Field label="Do's">
          <ListEditor value={local.brand_voice?.dos || []} onChange={(v) => set(['brand_voice', 'dos'], v)} disabled={disabled} />
        </Field>
        <Field label="Don'ts">
          <ListEditor value={local.brand_voice?.donts || []} onChange={(v) => set(['brand_voice', 'donts'], v)} disabled={disabled} />
        </Field>
        <Field label="Sample phrases">
          <ListEditor value={local.brand_voice?.sample_phrases || []} onChange={(v) => set(['brand_voice', 'sample_phrases'], v)} disabled={disabled} />
        </Field>
        <Field label="Tagline">
          <Input value={local.brand_voice?.tagline || ''} onChange={(v) => set(['brand_voice', 'tagline'], v)} disabled={disabled} />
        </Field>
      </Section>
    </div>
  );
}

// ----- subcomponents -----
const inputClass =
  'w-full px-2.5 py-1.5 border border-edge rounded text-[13px] bg-surface ' +
  'focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none ' +
  'disabled:bg-surface-alt disabled:text-ink-muted disabled:cursor-not-allowed';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-edge rounded-lg p-4 m-0">
      <legend className="text-[11px] font-bold text-ink-muted uppercase tracking-wider px-1.5">
        {title}
      </legend>
      <div className="flex flex-col gap-2.5">
        {children}
      </div>
    </fieldset>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-ink-muted mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
function Input({ value, onChange, disabled, type = 'text' }: { value: string | number; onChange: (v: string) => void; disabled?: boolean; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={inputClass}
    />
  );
}
function Textarea({ value, onChange, disabled, rows = 3 }: { value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={rows}
      className={`${inputClass} font-sans resize-y`}
    />
  );
}
function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] text-ink-muted mb-1">{label}</label>
      <div className="flex gap-1.5 items-center">
        <input
          type="color"
          value={value || '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-10 h-8 p-0 border border-edge rounded cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="#1B2838"
          className={`${inputClass} flex-1`}
        />
      </div>
    </div>
  );
}
function ListEditor({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <textarea
      value={(value || []).join('\n')}
      onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
      disabled={disabled}
      rows={Math.max(2, (value || []).length + 1)}
      placeholder="One item per line"
      className={`${inputClass} font-sans resize-y`}
    />
  );
}
