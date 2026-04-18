const { buildPrompt, getPromptTypesForStatus } = require('../services/ai-prompts');

const mockEngagement = {
  status: 'proposal',
  source: 'cold',
  source_detail: '',
  estimated_value: 2500,
  package_type: 'boost',
  notes: 'They rely on referrals only. No email infrastructure.',
};

const mockClient = {
  name: 'Acme Manufacturing',
  primary_contact_name: 'Sarah Chen',
  email: 'sarah@acme.com',
  location: 'Detroit, MI',
  industry: 'Manufacturing',
  type: 'B2B',
  website: 'acme-mfg.com',
};

describe('buildPrompt', () => {
  test('proposal_content includes Value Equation framing with client context', () => {
    const prompt = buildPrompt('proposal_content', mockEngagement, mockClient);
    expect(prompt).toContain('Acme Manufacturing');
    expect(prompt).toContain('Value Equation');
    expect(prompt).toContain('90 days');
  });

  test('followup_emails includes break-up cadence', () => {
    const prompt = buildPrompt('followup_emails', mockEngagement, mockClient);
    expect(prompt).toContain('Break-up');
    expect(prompt).toContain('Sarah Chen');
    expect(prompt).toContain('Day 21');
  });

  test('objection_scripts references industry for specificity', () => {
    const prompt = buildPrompt('objection_scripts', mockEngagement, mockClient);
    expect(prompt).toContain('Manufacturing');
    expect(prompt).toContain('Value Equation');
  });

  test('default fallback includes Hormozi preamble', () => {
    const prompt = buildPrompt('generic', mockEngagement, mockClient);
    expect(prompt).toContain('Hormozi');
  });
});

describe('getPromptTypesForStatus', () => {
  test('working status gets follow-up + objection prompts', () => {
    expect(getPromptTypesForStatus('working')).toEqual(['followup_emails', 'objection_scripts']);
  });

  test('proposal status gets proposal + follow-up prompts', () => {
    expect(getPromptTypesForStatus('proposal')).toEqual(['proposal_content', 'followup_emails']);
  });

  test('unknown status falls back to generic', () => {
    expect(getPromptTypesForStatus('unknown_status')).toEqual(['generic']);
  });
});
