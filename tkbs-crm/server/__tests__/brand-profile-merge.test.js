const {
  flattenPaths,
  getByPath,
  setByPath,
  mergeExtractionIntoClient,
  computeBrandProfileDiff,
  diffChangedPaths,
} = require('../services/brand-profile-merge');

describe('flattenPaths', () => {
  test('flattens nested objects into dotted leaf paths', () => {
    const obj = {
      business_name: 'Acme',
      customer_avatar: { name: 'Sarah', age_range: '30-45' },
      brand_personality: { traits: ['bold', 'warm'] },
    };
    const paths = flattenPaths(obj).sort();
    expect(paths).toEqual([
      'brand_personality.traits',
      'business_name',
      'customer_avatar.age_range',
      'customer_avatar.name',
    ]);
  });

  test('treats arrays as leaves', () => {
    expect(flattenPaths({ a: [1, 2, 3] })).toEqual(['a']);
  });

  test('empty object → no paths', () => {
    expect(flattenPaths({})).toEqual([]);
  });
});

describe('get/setByPath', () => {
  test('roundtrip on nested paths', () => {
    const obj = {};
    setByPath(obj, 'a.b.c', 42);
    expect(getByPath(obj, 'a.b.c')).toBe(42);
    expect(obj).toEqual({ a: { b: { c: 42 } } });
  });

  test('getByPath returns undefined on missing path', () => {
    expect(getByPath({ a: 1 }, 'b.c')).toBeUndefined();
  });
});

describe('mergeExtractionIntoClient', () => {
  test('fills empty client profile from extraction; tags sources', () => {
    const result = mergeExtractionIntoClient(
      {},
      {},
      { business_name: 'Acme', customer_avatar: { name: 'Sarah' } },
      7,
    );
    expect(result.profile).toEqual({ business_name: 'Acme', customer_avatar: { name: 'Sarah' } });
    expect(result.sources).toEqual({ business_name: 'call:7', 'customer_avatar.name': 'call:7' });
    expect(result.appliedPaths.sort()).toEqual(['business_name', 'customer_avatar.name']);
    expect(result.skippedPaths).toEqual([]);
  });

  test('skips paths tagged "manual"; fills others', () => {
    const result = mergeExtractionIntoClient(
      { business_name: 'My Name', customer_avatar: { name: 'Old Sarah' } },
      { business_name: 'manual', 'customer_avatar.name': 'manual' },
      { business_name: 'Different', customer_avatar: { name: 'Other', age_range: '30-45' } },
      9,
    );
    expect(result.profile.business_name).toBe('My Name');
    expect(result.profile.customer_avatar.name).toBe('Old Sarah');
    expect(result.profile.customer_avatar.age_range).toBe('30-45');
    expect(result.sources['customer_avatar.age_range']).toBe('call:9');
    expect(result.skippedPaths.sort()).toEqual(['business_name', 'customer_avatar.name']);
  });

  test('overwrites paths from an older call when a newer call arrives', () => {
    const result = mergeExtractionIntoClient(
      { business_name: 'Old Acme' },
      { business_name: 'call:3' },
      { business_name: 'New Acme' },
      9,
    );
    expect(result.profile.business_name).toBe('New Acme');
    expect(result.sources.business_name).toBe('call:9');
    expect(result.appliedPaths).toEqual(['business_name']);
  });

  test('skips empty extraction values so we don\'t erase good data', () => {
    const result = mergeExtractionIntoClient(
      { business_name: 'Acme' },
      { business_name: 'call:3' },
      { business_name: '', customer_avatar: { name: null, pain_points: [] } },
      9,
    );
    expect(result.profile.business_name).toBe('Acme');
    expect(result.sources.business_name).toBe('call:3');
    expect(result.appliedPaths).toEqual([]);
  });

  test('does not mutate inputs', () => {
    const clientProfile = { business_name: 'Original' };
    const clientSources = { business_name: 'manual' };
    mergeExtractionIntoClient(clientProfile, clientSources, { business_name: 'Other' }, 5);
    expect(clientProfile).toEqual({ business_name: 'Original' });
    expect(clientSources).toEqual({ business_name: 'manual' });
  });
});

describe('mergeExtractionIntoClient — array merge as union', () => {
  test('unions string arrays at the same path; tags merged:N', () => {
    const result = mergeExtractionIntoClient(
      { customer_avatar: { pain_points: ['slow leads', 'no analytics'] } },
      { 'customer_avatar.pain_points': 'call:1' },
      { customer_avatar: { pain_points: ['no analytics', 'no SEO'] } },
      7,
    );
    expect(result.profile.customer_avatar.pain_points.sort()).toEqual(
      ['no SEO', 'no analytics', 'slow leads'].sort()
    );
    expect(result.mergedPaths).toEqual(['customer_avatar.pain_points']);
    expect(result.appliedPaths).toEqual([]);
    expect(result.sources['customer_avatar.pain_points']).toBe('merged:7');
  });

  test('skips arrays where incoming is a subset of current', () => {
    const result = mergeExtractionIntoClient(
      { brand_personality: { traits: ['warm', 'friendly', 'modern'] } },
      {},
      { brand_personality: { traits: ['warm', 'friendly'] } },
      7,
    );
    expect(result.profile.brand_personality.traits).toEqual(['warm', 'friendly', 'modern']);
    expect(result.mergedPaths).toEqual([]);
    expect(result.appliedPaths).toEqual([]);
  });

  test('sets new array when path was previously empty', () => {
    const result = mergeExtractionIntoClient(
      {},
      {},
      { customer_avatar: { goals: ['scale to 10x', 'hire VP marketing'] } },
      7,
    );
    expect(result.profile.customer_avatar.goals).toEqual(['scale to 10x', 'hire VP marketing']);
    expect(result.appliedPaths).toContain('customer_avatar.goals');
    expect(result.sources['customer_avatar.goals']).toBe('call:7');
  });

  test('manual-tagged array is preserved (not unioned)', () => {
    const result = mergeExtractionIntoClient(
      { brand_voice: { tone: ['confident', 'warm'] } },
      { 'brand_voice.tone': 'manual' },
      { brand_voice: { tone: ['playful', 'casual'] } },
      7,
    );
    expect(result.profile.brand_voice.tone).toEqual(['confident', 'warm']);
    expect(result.skippedPaths).toContain('brand_voice.tone');
    expect(result.mergedPaths).toEqual([]);
  });
});

describe('mergeExtractionIntoClient — explicit choices', () => {
  const current = { business_name: 'Old Name' };
  const incoming = { business_name: 'New Name' };

  test('choice "skip" leaves current value untouched', () => {
    const out = mergeExtractionIntoClient(current, {}, incoming, 7, {
      choices: { business_name: 'skip' },
    });
    expect(out.profile.business_name).toBe('Old Name');
    expect(out.skippedPaths).toContain('business_name');
  });

  test('choice "keep" preserves current and locks the path as manual', () => {
    const out = mergeExtractionIntoClient(current, {}, incoming, 7, {
      choices: { business_name: 'keep' },
    });
    expect(out.profile.business_name).toBe('Old Name');
    expect(out.sources.business_name).toBe('manual');
    expect(out.skippedPaths).toContain('business_name');
  });

  test('choice "take" overrides even a manual tag', () => {
    const out = mergeExtractionIntoClient(
      current,
      { business_name: 'manual' },
      incoming,
      7,
      { choices: { business_name: 'take' } },
    );
    expect(out.profile.business_name).toBe('New Name');
    expect(out.sources.business_name).toBe('call:7');
    expect(out.appliedPaths).toContain('business_name');
  });
});

describe('computeBrandProfileDiff', () => {
  test('returns paths where current and incoming non-empty values disagree', () => {
    const conflicts = computeBrandProfileDiff(
      { business_name: 'Acme', industry: 'Retail' },
      { business_name: 'Acme Corp', industry: 'Retail' },
    );
    expect(conflicts).toEqual([
      { path: 'business_name', current: 'Acme', incoming: 'Acme Corp' },
    ]);
  });

  test('skips paths where current is empty (incoming just fills in)', () => {
    expect(computeBrandProfileDiff(
      { industry: 'Retail' },
      { business_name: 'Acme', industry: 'Retail' },
    )).toEqual([]);
  });

  test('arrays never conflict (they union by default)', () => {
    expect(computeBrandProfileDiff(
      { tags: ['a', 'b'] },
      { tags: ['c', 'd'] },
    )).toEqual([]);
  });

  test('identical scalars are not conflicts', () => {
    expect(computeBrandProfileDiff(
      { business_name: 'Acme' },
      { business_name: 'Acme' },
    )).toEqual([]);
  });
});

describe('diffChangedPaths', () => {
  test('returns paths that differ between two profiles', () => {
    expect(diffChangedPaths(
      { business_name: 'Old', customer_avatar: { name: 'Sarah' } },
      { business_name: 'New', customer_avatar: { name: 'Sarah' } },
    )).toEqual(['business_name']);
  });

  test('detects added paths', () => {
    expect(diffChangedPaths(
      { business_name: 'Acme' },
      { business_name: 'Acme', industry: 'Retail' },
    )).toEqual(['industry']);
  });

  test('detects removed paths', () => {
    expect(diffChangedPaths(
      { business_name: 'Acme', industry: 'Retail' },
      { business_name: 'Acme' },
    )).toEqual(['industry']);
  });

  test('ignores empty-to-empty transitions', () => {
    expect(diffChangedPaths(
      { business_name: 'Acme', industry: '' },
      { business_name: 'Acme', industry: null },
    )).toEqual([]);
  });

  test('detects array changes', () => {
    expect(diffChangedPaths(
      { tags: ['a', 'b'] },
      { tags: ['a', 'b', 'c'] },
    )).toEqual(['tags']);
  });
});
