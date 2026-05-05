// Translates raw Supabase / PostgREST / Anthropic error strings into messages
// safe to show in the UI. The goal is two-fold: don't leak schema/internal
// state, and don't show the user something they can't act on.
//
// Usage:
//   try { ... } catch (err) {
//     setMsg(humanizeError(err));
//   }

const MESSAGE_OVERRIDES: Array<{ match: RegExp; message: string }> = [
  // Supabase auth
  { match: /Invalid login credentials/i, message: 'Email or password is incorrect.' },
  { match: /Email not confirmed/i, message: 'Please confirm your email before signing in.' },
  { match: /User not found/i, message: 'No account found for that email.' },
  { match: /Password should be at least/i, message: 'Password is too short.' },
  { match: /Email rate limit exceeded/i, message: 'Too many attempts. Try again in a minute.' },
  { match: /JWT expired|token has expired/i, message: 'Your session expired. Please sign in again.' },

  // Postgres / PostgREST
  { match: /duplicate key value violates unique constraint/i, message: 'That record already exists.' },
  { match: /violates foreign key constraint/i, message: 'Referenced record does not exist.' },
  { match: /violates not-null constraint/i, message: 'A required field is missing.' },
  { match: /value too long for type/i, message: 'One of the fields is too long.' },
  { match: /permission denied for/i, message: 'You don\'t have access to that.' },
  { match: /row-level security/i, message: 'You don\'t have access to that.' },

  // Anthropic / network
  { match: /ANTHROPIC_API_KEY|No API key/i, message: 'AI service is not configured. Contact an admin.' },
  { match: /rate.?limit/i, message: 'Rate limit reached. Try again shortly.' },
  { match: /ETIMEDOUT|ECONNRESET|fetch failed/i, message: 'Network error. Check your connection and retry.' },
];

const FALLBACK = 'Something went wrong. Please try again.';

function extractRaw(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return '';
  }
}

export function humanizeError(err: unknown, fallback: string = FALLBACK): string {
  const raw = extractRaw(err);
  if (!raw) return fallback;
  for (const { match, message } of MESSAGE_OVERRIDES) {
    if (match.test(raw)) return message;
  }
  return fallback;
}
