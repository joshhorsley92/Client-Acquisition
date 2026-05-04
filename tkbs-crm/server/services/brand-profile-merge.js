// Utilities for merging a call-extracted Brand Profile into a client's
// canonical `clients.brand_profile` while respecting manual edits.
//
// Sources are tracked per dotted leaf-path in `clients.brand_profile_sources`:
//   { "business_name": "manual",
//     "customer_avatar.name": "call:3",
//     "brand_voice.tone": "manual",
//     "customer_avatar.pain_points": "merged:7" }
//
// Default merge rules:
//   - Paths tagged "manual" are skipped (user edits win).
//   - Array-of-string fields (pain_points, traits, etc.) are unioned, not
//     overwritten — preserves data accumulated across multiple calls.
//   - Scalar fields are overwritten by the incoming extraction unless the
//     caller passes per-path `choices` to override (see Apply-to-Client diff).

function flattenPaths(obj, prefix = '') {
  const paths = [];
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) paths.push(prefix);
    return paths;
  }
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      paths.push(...flattenPaths(v, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

function getByPath(obj, path) {
  if (!obj) return undefined;
  const parts = path.split('.');
  let node = obj;
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[p];
  }
  return node;
}

function setByPath(obj, path, value) {
  const parts = path.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (node[parts[i]] == null || typeof node[parts[i]] !== 'object') {
      node[parts[i]] = {};
    }
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isEmpty(v) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

/**
 * Identify paths where the current canonical profile and an incoming call
 * extraction would conflict if applied. A "conflict" means both sides have
 * non-empty values that disagree. Arrays never conflict (they always union).
 *
 * Used by the Apply-to-Client UI to surface a per-field diff modal so the
 * user can keep/take/skip on a per-path basis.
 *
 * Returns: [{ path, current, incoming }, ...]
 */
function computeBrandProfileDiff(currentProfile, incomingProfile) {
  const conflicts = [];
  const paths = flattenPaths(incomingProfile || {});
  for (const path of paths) {
    const incoming = getByPath(incomingProfile, path);
    if (isEmpty(incoming)) continue;

    const current = getByPath(currentProfile, path);
    if (isEmpty(current)) continue;

    // Arrays never conflict (they union by default).
    if (Array.isArray(current) && Array.isArray(incoming)) continue;

    if (JSON.stringify(current) === JSON.stringify(incoming)) continue;

    conflicts.push({ path, current, incoming });
  }
  return conflicts;
}

/**
 * Merge a call extraction into the client's canonical brand profile.
 *
 * Per-path resolution rules (in order):
 *   1. options.choices[path] === 'skip'  → no change to current; tagged in skipped
 *   2. options.choices[path] === 'keep'  → current preserved AND tagged 'manual'
 *      (user explicitly said keep, lock it from future calls)
 *   3. options.choices[path] === 'take'  → incoming overwrites; tagged call:N
 *   4. nextSources[path] === 'manual'    → preserved; tagged in skipped
 *   5. both sides are string arrays      → union (deduped); tagged merged:N
 *   6. otherwise                         → incoming overwrites; tagged call:N
 *
 * Returns a NEW { profile, sources, appliedPaths, skippedPaths, mergedPaths }
 * — inputs are not mutated.
 */
function mergeExtractionIntoClient(clientProfile, clientSources, extractionProfile, callId, options = {}) {
  const nextProfile = clientProfile ? JSON.parse(JSON.stringify(clientProfile)) : {};
  const nextSources = clientSources ? { ...clientSources } : {};
  const applied = [];
  const skipped = [];
  const merged = [];
  const choices = options.choices || {};

  const paths = flattenPaths(extractionProfile || {});
  for (const path of paths) {
    const incoming = getByPath(extractionProfile, path);
    if (isEmpty(incoming)) continue;

    const choice = choices[path];

    if (choice === 'skip') {
      skipped.push(path);
      continue;
    }
    if (choice === 'keep') {
      // User explicitly chose current value — promote to manual so future
      // call applies don't silently overwrite it.
      nextSources[path] = 'manual';
      skipped.push(path);
      continue;
    }
    if (choice === 'take') {
      setByPath(nextProfile, path, incoming);
      nextSources[path] = `call:${callId}`;
      applied.push(path);
      continue;
    }

    // Default behavior — no explicit user choice.
    if (nextSources[path] === 'manual') {
      skipped.push(path);
      continue;
    }

    const current = getByPath(nextProfile, path);
    if (isStringArray(current) && isStringArray(incoming)) {
      const union = Array.from(new Set([...current, ...incoming]));
      if (union.length === current.length) {
        // Incoming is a subset — nothing new to add.
        continue;
      }
      setByPath(nextProfile, path, union);
      nextSources[path] = `merged:${callId}`;
      merged.push(path);
      continue;
    }

    setByPath(nextProfile, path, incoming);
    nextSources[path] = `call:${callId}`;
    applied.push(path);
  }

  return {
    profile: nextProfile,
    sources: nextSources,
    appliedPaths: applied,
    skippedPaths: skipped,
    mergedPaths: merged,
  };
}

/**
 * Compare two profiles and return the leaf paths whose values differ.
 * Used by the PATCH /api/clients/:id handler to auto-tag manually edited
 * fields as 'manual' in brand_profile_sources, so they're protected from
 * being silently overwritten by a future call's "Apply to client".
 *
 * A path is "changed" if either side has a non-empty value and the JSON
 * representations differ. Empty-to-empty transitions are ignored.
 */
function diffChangedPaths(beforeProfile, afterProfile) {
  const before = beforeProfile || {};
  const after = afterProfile || {};
  const allPaths = new Set([
    ...flattenPaths(before),
    ...flattenPaths(after),
  ]);
  const changed = [];
  for (const path of allPaths) {
    const a = getByPath(before, path);
    const b = getByPath(after, path);
    if (isEmpty(a) && isEmpty(b)) continue;
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(path);
  }
  return changed;
}

module.exports = {
  flattenPaths,
  getByPath,
  setByPath,
  mergeExtractionIntoClient,
  computeBrandProfileDiff,
  diffChangedPaths,
};
