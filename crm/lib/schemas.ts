import { z } from 'zod';

// Shared Zod schemas — used by API routes (request body validation) AND
// client modals (react-hook-form). Single source of truth for what a valid
// payload looks like prevents client/server drift.
//
// Convention: keep the API contract loose (most fields optional) and let
// the form layer enforce stricter rules per-modal via .extend() / .refine().

const optionalString = z.string().trim().optional().or(z.literal('').transform(() => undefined));
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .or(z.literal('').transform(() => undefined))
  .refine(
    (v) => !v || /^https?:\/\//i.test(v),
    { message: 'Website must start with http:// or https://' },
  );
const optionalEmail = z
  .string()
  .trim()
  .optional()
  .or(z.literal('').transform(() => undefined))
  .refine(
    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    { message: 'Enter a valid email address' },
  );

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
export const ClientCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  website: optionalUrl,
  industry: optionalString,
  location: optionalString,
  type: z.enum(['B2B', 'B2C']).optional().or(z.literal('').transform(() => undefined)),
  primary_contact_name: optionalString,
  email: optionalEmail,
  phone: optionalString,
  role: optionalString,
  preferred_contact: z.enum(['email', 'phone', 'text', 'linkedin']).optional().or(z.literal('').transform(() => undefined)),
  employee_count: optionalString,
  revenue_estimate: optionalString,
  notes: optionalString,
});
export type ClientCreateInput = z.infer<typeof ClientCreateSchema>;

// ---------------------------------------------------------------------------
// Client contacts (multi-contact list per client)
// ---------------------------------------------------------------------------
const preferredContactSchema = z.enum(['email', 'phone', 'text', 'linkedin'])
  .optional()
  .or(z.literal('').transform(() => undefined));

export const ClientContactCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: optionalEmail,
  phone: optionalString,
  role: optionalString,
  preferred_contact: preferredContactSchema,
  notes: optionalString,
  is_primary: z.boolean().optional(),
});
export type ClientContactCreateInput = z.infer<typeof ClientContactCreateSchema>;

// PATCH: every field optional. Server enforces uniqueness on is_primary
// via a partial UNIQUE index.
export const ClientContactUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: optionalEmail,
  phone: optionalString,
  role: optionalString,
  preferred_contact: preferredContactSchema,
  notes: optionalString,
  is_primary: z.boolean().optional(),
});
export type ClientContactUpdateInput = z.infer<typeof ClientContactUpdateSchema>;

// ---------------------------------------------------------------------------
// Engagements
// ---------------------------------------------------------------------------
import { PACKAGE_SLUGS, PRICING_TYPES, SOURCE_SLUGS } from './engagement-options';
const packageSlugSchema = z.enum(PACKAGE_SLUGS as unknown as [string, ...string[]]);
const pricingTypeSchema = z.enum(PRICING_TYPES as unknown as [string, ...string[]]);
const sourceSlugSchema = z.enum(SOURCE_SLUGS as unknown as [string, ...string[]]);

// Per-package row in the JSONB array. label is only meaningful for 'other';
// details is the free-text expansion used in proposal generation.
// unit_price + pricing_type drive engagement-level value rollups (see
// summarizePackagePricing).
const engagementPackageSchema = z.object({
  slug: packageSlugSchema,
  label: z.string().trim().max(120).optional(),
  details: z.string().trim().max(2000).optional(),
  unit_price: z.coerce.number().min(0).max(10_000_000).optional(),
  pricing_type: pricingTypeSchema.optional(),
}).refine(
  (p) => p.slug !== 'other' || (p.label && p.label.length > 0),
  { message: 'Custom label is required when slug is "other"' },
);

// Optional title — empty/whitespace coerces to null so clearing the field
// falls back to the auto-derived package list display.
const optionalTitle = z.string().trim().max(200).optional().nullable()
  .or(z.literal('').transform(() => null));

export const EngagementCreateSchema = z.object({
  client_id: z.coerce.number().int().positive('Client is required'),
  status: z.enum(['new', 'working', 'won', 'lost']).optional(),
  title: optionalTitle,
  packages: z.array(engagementPackageSchema).optional().default([]),
  source: sourceSlugSchema.optional().or(z.literal('').transform(() => undefined)),
  source_detail: optionalString,
  estimated_value: z.coerce.number().min(0).optional(),
  contract_months: z.coerce.number().int().min(1).max(120).optional().nullable(),
  contact_id: z.coerce.number().int().positive().optional().nullable(),
  notes: optionalString,
});
export type EngagementCreateInput = z.infer<typeof EngagementCreateSchema>;

// PATCH payload — same packages shape but everything optional. Use this on
// /api/engagements/[id] when validating partial updates so 'other' still
// requires its label even on edits.
export const EngagementPatchSchema = z.object({
  title: optionalTitle,
  packages: z.array(engagementPackageSchema).optional(),
  contract_months: z.coerce.number().int().min(1).max(120).optional().nullable(),
  contact_id: z.coerce.number().int().positive().optional().nullable(),
});
export type EngagementPackageInput = z.infer<typeof engagementPackageSchema>;

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------
export const CallCreateSchema = z.object({
  client_id: z.coerce.number().int().positive('Client is required'),
  engagement_id: z.coerce.number().int().positive().optional(),
  call_date: optionalString,
  duration_minutes: z.coerce.number().min(0).max(720, 'That seems too long').optional(),
  transcript: optionalString,
  notes: optionalString,
});
export type CallCreateInput = z.infer<typeof CallCreateSchema>;

// ---------------------------------------------------------------------------
// Settings — Users
// ---------------------------------------------------------------------------
export const UserCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email address'),
  role: z.enum(['member', 'admin']).default('member'),
});
export type UserCreateInput = z.infer<typeof UserCreateSchema>;

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------
export const AutomationRunSchema = z.object({
  automation: z.string().min(1),
  client_id: z.coerce.number().int().positive(),
  engagement_id: z.coerce.number().int().positive().optional(),
});
export type AutomationRunInput = z.infer<typeof AutomationRunSchema>;

// ---------------------------------------------------------------------------
// Lead Discovery
// ---------------------------------------------------------------------------
export const LeadDiscoveryRunSchema = z.object({
  source: z.string().min(1),
  filters: z
    .object({
      industry: optionalString,
      location: optionalString,
      zip: optionalString,
      radius_miles: z.coerce.number().int().min(1).max(50).optional(),
      county: optionalString,
      min_reviews: z.coerce.number().int().min(0).optional(),
      max_reviews: z.coerce.number().int().min(0).optional(),
      max_rating: z.coerce.number().min(0).max(5).optional(),
      has_website: z.boolean().optional(),
      limit: z.coerce.number().int().min(1).max(20).optional(),
    })
    .default({}),
});
export type LeadDiscoveryRunInput = z.infer<typeof LeadDiscoveryRunSchema>;

export const EnrichNextSchema = z.object({
  job_id: z.coerce.number().int().positive(),
  batch_size: z.coerce.number().int().min(1).max(5).optional(),
});
export type EnrichNextInput = z.infer<typeof EnrichNextSchema>;
