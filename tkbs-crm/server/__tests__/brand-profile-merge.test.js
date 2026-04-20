const {
  flattenPaths,
  getByPath,
  setByPath,
  mergeExtractionIntoClient,
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
