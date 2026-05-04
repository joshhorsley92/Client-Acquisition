// Pure utilities for merging a call-extracted Brand Profile into a
// client's canonical brand_profile, respecting manual edits.
//
// Sources are tracked per dotted leaf path in clients.brand_profile_sources:
//   { "business_name": "manual",
//     "customer_avatar.name": "call:3",
//     "customer_avatar.pain_points": "merged:7" }
//
// Default merge rules (in apply order):
//   - Paths tagged "manual" are skipped (user edits win).
//   - Array-of-string fields union (deduped) — preserves data across calls.
//   - Scalar fields are overwritten unless the caller passes per-path
//     `choices` to override (used by the Apply-to-Client diff modal).
//
// Ported verbatim from the prototype's brand-profile-merge.js — same
// behavior, TypeScript signatures.

export type Profile = Record<string, unknown>;
export type Sources = Record<string, string>;
export type Choice = 'keep' | 'take' | 'skip';

export interface MergeOptions {
  choices?: Record<string, Choice>;
}

export interface MergeResult {
  profile: Profile;
  sources: Sources;
  appliedPaths: string[];
  skippedPaths: string[];
  mergedPaths: string[];
}

export interface DiffEntry {
  path: string;
  current: unknown;
  incoming: unknown;
}

export function flattenPaths(obj: unknown, prefix = ''): string[] {
  const paths: string[] = [];
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) paths.push(prefix);
    return paths;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      paths.push(...flattenPaths(v, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

export function getByPath(obj: unknown, path: string): unknown {
  if (!obj) return undefined;
  const parts = path.split('.');
  let node: unknown = obj;
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[p];
  }
  return node;
}

export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (node[k] == null || typeof node[k] !== 'object' || Array.isArray(node[k])) {
      node[k] = {};
    }
    node = node[k] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isEmpty(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function computeBrandProfileDiff(
  current: Profile | undefined | null,
  incoming: Profile | undefined | null,
): DiffEntry[] {
  const conflicts: DiffEntry[] = [];
  const paths = flattenPaths(incoming || {});
  for (const path of paths) {
    const inc = getByPath(incoming, path);
    if (isEmpty(inc)) continue;
    const cur = getByPath(current, path);
    if (isEmpty(cur)) continue;
    if (Array.isArray(cur) && Array.isArray(inc)) continue; // arrays union
    if (JSON.stringify(cur) === JSON.stringify(inc)) continue;
    conflicts.push({ path, current: cur, incoming: inc });
  }
  return conflicts;
}

export function mergeExtractionIntoClient(
  clientProfile: Profile | null | undefined,
  clientSources: Sources | null | undefined,
  extractionProfile: Profile | null | undefined,
  callId: number | string,
  options: MergeOptions = {},
): MergeResult {
  const nextProfile: Profile = clientProfile
    ? (JSON.parse(JSON.stringify(clientProfile)) as Profile)
    : {};
  const nextSources: Sources = clientSources ? { ...clientSources } : {};
  const applied: string[] = [];
  const skipped: string[] = [];
  const merged: string[] = [];
  const choices = options.choices || {};

  const paths = flattenPaths(extractionProfile || {});
  for (const path of paths) {
    const incoming = getByPath(extractionProfile, path);
    if (isEmpty(incoming)) continue;

    const choice = choices[path];
    if (choice === 'skip') { skipped.push(path); continue; }
    if (choice === 'keep') {
      nextSources[path] = 'manual';
      skipped.push(path);
      continue;
    }
    if (choice === 'take') {
      setByPath(nextProfile as Record<string, unknown>, path, incoming);
      nextSources[path] = `call:${callId}`;
      applied.push(path);
      continue;
    }

    if (nextSources[path] === 'manual') {
      skipped.push(path);
      continue;
    }

    const current = getByPath(nextProfile, path);
    if (isStringArray(current) && isStringArray(incoming)) {
      const union = Array.from(new Set([...current, ...incoming]));
      if (union.length === current.length) continue; // no new items
      setByPath(nextProfile as Record<string, unknown>, path, union);
      nextSources[path] = `merged:${callId}`;
      merged.push(path);
      continue;
    }

    setByPath(nextProfile as Record<string, unknown>, path, incoming);
    nextSources[path] = `call:${callId}`;
    applied.push(path);
  }

  return { profile: nextProfile, sources: nextSources, appliedPaths: applied, skippedPaths: skipped, mergedPaths: merged };
}

export function diffChangedPaths(
  before: Profile | null | undefined,
  after: Profile | null | undefined,
): string[] {
  const b = before || {};
  const a = after || {};
  const allPaths = new Set<string>([...flattenPaths(b), ...flattenPaths(a)]);
  const changed: string[] = [];
  for (const path of allPaths) {
    const beforeVal = getByPath(b, path);
    const afterVal = getByPath(a, path);
    if (isEmpty(beforeVal) && isEmpty(afterVal)) continue;
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changed.push(path);
    }
  }
  return changed;
}
