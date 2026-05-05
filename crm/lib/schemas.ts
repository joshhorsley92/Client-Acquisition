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
// Engagements
// ---------------------------------------------------------------------------
export const EngagementCreateSchema = z.object({
  client_id: z.coerce.number().int().positive('Client is required'),
  status: z.enum(['new', 'working', 'won', 'lost']).optional(),
  package_type: z.enum(['boost', 'launch', 'both', 'undecided']).optional().or(z.literal('').transform(() => undefined)),
  source: z.enum(['referral', 'cold', 'web', 'content', 'paid_ads']).optional().or(z.literal('').transform(() => undefined)),
  source_detail: optionalString,
  estimated_value: z.coerce.number().min(0).optional(),
  notes: optionalString,
});
export type EngagementCreateInput = z.infer<typeof EngagementCreateSchema>;

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
