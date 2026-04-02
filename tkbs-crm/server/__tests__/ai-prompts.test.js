const { buildPrompt } = require('../services/ai-prompts');

const mockDeal = {
  stage: 'outreach', source: 'cold', source_detail: '',
  estimated_value: 2500, package_type: 'boost',
  services_discussed: '["Landing Page","Email Marketing","Meta Ads"]',
  call_notes: 'They rely on referrals only.', research_findings: 'No email infrastructure. Thin GBP listing.',
  objections_noted: '',
};
const mockContact = { name: 'Sarah Chen', email: 'sarah@acme.com', phone: '555-1234' };
const mockCompany = { name: 'Acme Manufacturing', location: 'Detroit, MI', industry: 'Manufacturing', type: 'B2B', website: 'acme-mfg.com' };

describe('buildPrompt', () => {
  test('builds outreach email prompt with Hormozi framework', () => {
    const prompt = buildPrompt('outreach_emails', mockDeal, mockContact, mockCompany);
    expect(prompt).toContain('Acme Manufacturing');
    expect(prompt).toContain('Sarah Chen');
    expect(prompt).toContain('Detroit, MI');
    expect(prompt).toContain('Hormozi');
    expect(prompt).toContain('Value Equation');
    expect(prompt).toContain('break-up');
  });

  test('builds call script prompt with CLOSER framework', () => {
    const prompt = buildPrompt('outreach_call', mockDeal, mockContact, mockCompany);
    expect(prompt).toContain('CLOSER');
    expect(prompt).toContain('CLARIFY');
    expect(prompt).toContain('REINFORCE');
  });

  test('builds follow-up prompt with objection weaving', () => {
    const dealWithObjections = { ...mockDeal, stage: 'follow_up', objections_noted: 'Price concern — thinks $2500 is high' };
    const prompt = buildPrompt('followup_emails', dealWithObjections, mockContact, mockCompany);
    expect(prompt).toContain('Price concern');
    expect(prompt).toContain('ROI');
  });

  test('builds objection handling prompt', () => {
    const prompt = buildPrompt('objection_scripts', mockDeal, mockContact, mockCompany);
    expect(prompt).toContain('Too expensive');
    expect(prompt).toContain('I need to think about it');
    expect(prompt).toContain('NEVER discount');
  });

  test('adapts tone for warm vs cold source', () => {
    const warmDeal = { ...mockDeal, source: 'referral', source_detail: 'Referral from Dave' };
    const prompt = buildPrompt('outreach_emails', warmDeal, mockContact, mockCompany);
    expect(prompt).toContain('warm');
    expect(prompt).toContain('Dave');
  });
});
