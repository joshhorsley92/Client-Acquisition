/**
 * Replaces merge fields in a template string with deal/contact/company data.
 * Merge fields use {field_name} syntax.
 */
function renderTemplate(template, context) {
  return template.replace(/\{(\w+)\}/g, (match, field) => {
    if (context[field] !== undefined && context[field] !== null) {
      return String(context[field]);
    }
    return match; // Leave unresolved fields as-is
  });
}

/**
 * Builds a merge context from deal, contact, and company objects.
 */
function buildContext(deal, contact, company) {
  return {
    company: company?.name || '',
    contact: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    industry: company?.industry || '',
    location: company?.location || '',
    type: company?.type || '',
    website: company?.website || '',
    source: deal?.source || '',
    source_detail: deal?.source_detail || '',
    referrer: deal?.source_detail || '',
    services: deal?.services_discussed || '[]',
    package_type: deal?.package_type || '',
    estimated_value: deal?.estimated_value || '',
    call_notes: deal?.call_notes || '',
    research_findings: deal?.research_findings || '',
    objections_noted: deal?.objections_noted || '',
    notes: deal?.call_notes || '',
  };
}

module.exports = { renderTemplate, buildContext };
