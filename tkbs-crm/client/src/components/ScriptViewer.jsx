import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

/**
 * Renders a script template with merge fields filled.
 * For call_script type with ## Step: headers, renders as a guided stepper.
 */
export default function ScriptViewer({ deal, contact, company }) {
  const [scripts, setScripts] = useState([]);
  const [activeScript, setActiveScript] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (deal?.stage) {
      api.getScripts({ stage: deal.stage }).then(data => {
        setScripts(data.scripts);
        if (data.scripts.length > 0) setActiveScript(data.scripts[0]);
      }).catch(() => {});
    }
  }, [deal?.stage]);

  const fillMergeFields = (content) => {
    const context = {
      company: company?.name || '', contact: contact?.name || '',
      email: contact?.email || '', phone: contact?.phone || '',
      industry: company?.industry || '', location: company?.location || '',
      type: company?.type || '', website: company?.website || '',
      source: deal?.source || '', source_detail: deal?.source_detail || '',
      referrer: deal?.source_detail || '', package_type: deal?.package_type || '',
      estimated_value: deal?.estimated_value || '', call_notes: deal?.call_notes || '',
      research_findings: deal?.research_findings || '', objections_noted: deal?.objections_noted || '',
      services: deal?.services_discussed || '',
    };
    return content.replace(/\{(\w+)\}/g, (match, field) => context[field] || match);
  };

  const parseSteps = (content) => {
    const steps = [];
    const parts = content.split(/^## Step:\s*/m).filter(Boolean);
    for (const part of parts) {
      const lines = part.split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();

      // Parse "If:" branches
      const branches = [];
      const mainParts = body.split(/^### If:\s*/m);
      const mainContent = mainParts[0].trim();

      for (let i = 1; i < mainParts.length; i++) {
        const bLines = mainParts[i].split('\n');
        const condition = bLines[0].replace(/^["']|["']$/g, '').trim();
        const response = bLines.slice(1).join('\n').trim();
        branches.push({ condition, response });
      }

      steps.push({ title, content: mainContent, branches });
    }
    return steps;
  };

  if (scripts.length === 0) {
    return <div style={{ fontSize: 13, color: '#64748B' }}>No scripts available for this stage.</div>;
  }

  const isCallScript = activeScript?.type === 'call_script' && activeScript?.content?.includes('## Step:');
  const filled = activeScript ? fillMergeFields(activeScript.content) : '';
  const steps = isCallScript ? parseSteps(filled) : [];

  return (
    <div>
      {/* Script selector tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {scripts.map(s => (
          <button
            key={s.id}
            onClick={() => { setActiveScript(s); setCurrentStep(0); }}
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 4, border: '1px solid #E2E6EB',
              background: activeScript?.id === s.id ? '#1B2838' : '#fff',
              color: activeScript?.id === s.id ? '#fff' : '#64748B',
              cursor: 'pointer', fontWeight: activeScript?.id === s.id ? 600 : 400,
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Stepper mode for call scripts */}
      {isCallScript && steps.length > 0 ? (
        <div>
          {/* Progress indicator */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {steps.map((s, i) => (
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i <= currentStep ? '#00D4AA' : '#E2E6EB',
              }} />
            ))}
          </div>

          <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>
            Step {currentStep + 1} of {steps.length}
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1B2838', marginBottom: 12 }}>
            {steps[currentStep].title}
          </h3>

          <div style={{
            background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16,
            whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, marginBottom: 12,
          }}>
            {steps[currentStep].content}
          </div>

          {/* Conditional branches */}
          {steps[currentStep].branches.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>
                If they say...
              </div>
              {steps[currentStep].branches.map((b, i) => (
                <details key={i} style={{ marginBottom: 6 }}>
                  <summary style={{
                    cursor: 'pointer', fontSize: 13, color: '#E6A817',
                    fontWeight: 600, padding: '6px 0',
                  }}>
                    "{b.condition}"
                  </summary>
                  <div style={{
                    background: '#FFF3E0', borderRadius: 4, padding: 12,
                    fontSize: 13, lineHeight: 1.6, marginTop: 4, whiteSpace: 'pre-wrap',
                  }}>
                    {b.response}
                  </div>
                </details>
              ))}
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              style={{
                padding: '8px 16px', fontSize: 13, background: '#fff', border: '1px solid #E2E6EB',
                borderRadius: 4, cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
                opacity: currentStep === 0 ? 0.4 : 1,
              }}
            >
              ← Previous
            </button>
            <button
              onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
              disabled={currentStep === steps.length - 1}
              style={{
                padding: '8px 16px', fontSize: 13, background: '#00D4AA', color: '#1B2838',
                border: 'none', borderRadius: 4, fontWeight: 600,
                cursor: currentStep === steps.length - 1 ? 'not-allowed' : 'pointer',
                opacity: currentStep === steps.length - 1 ? 0.4 : 1,
              }}
            >
              Next →
            </button>
          </div>
        </div>
      ) : (
        /* Standard template view */
        <div style={{
          background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16,
          whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6,
        }}>
          {filled}
        </div>
      )}

      {/* Copy button */}
      <button
        onClick={() => navigator.clipboard.writeText(filled)}
        style={{
          marginTop: 12, padding: '6px 16px', fontSize: 12, background: '#fff',
          border: '1px solid #E2E6EB', borderRadius: 4, cursor: 'pointer', color: '#64748B',
        }}
      >
        Copy to Clipboard
      </button>
    </div>
  );
}
