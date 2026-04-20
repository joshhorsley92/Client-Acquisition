// Utilities for merging a call-extracted Brand Profile into a client's
// canonical `clients.brand_profile` while respecting manual edits.
//
// Sources are tracked per dotted leaf-path in `clients.brand_profile_sources`:
//   { "business_name": "manual",
//     "customer_avatar.name": "call:3",
//     "brand_voice.tone": "manual" }
//
// On merge, any path already marked "manual" is skipped. Everything else is
// overwritten by the incoming extraction and tagged `call:<id>`.

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

/**
 * Merge a call extraction into the client's canonical brand profile.
 * Paths tagged "manual" in clientSources are preserved.
 *
 * Returns:
 *   { profile, sources, appliedPaths, skippedPaths }
 *
 * `profile` and `sources` are NEW objects (inputs are not mutated).
 */
function mergeExtractionIntoClient(clientProfile, clientSources, extractionProfile, callId) {
  const nextProfile = clientProfile ? JSON.parse(JSON.stringify(clientProfile)) : {};
  const nextSources = clientSources ? { ...clientSources } : {};
  const applied = [];
  const skipped = [];

  const paths = flattenPaths(extractionProfile || {});
  for (const path of paths) {
    const val = getByPath(extractionProfile, path);
    if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) continue; // skip empty values

    if (nextSources[path] === 'manual') {
      skipped.push(path);
      continue;
    }
    setByPath(nextProfile, path, val);
    nextSources[path] = `call:${callId}`;
    applied.push(path);
  }

  return { profile: nextProfile, sources: nextSources, appliedPaths: applied, skippedPaths: skipped };
}

module.exports = { flattenPaths, getByPath, setByPath, mergeExtractionIntoClient };
