// Registry of automation workflows. Each row pins a prompt type from
// services/ai-prompts.ts and declares its inputs. Add a new automation by
// adding a row + (if needed) a new case in buildPrompt.

import type { PromptType } from './ai-prompts';

export interface AutomationDef {
  promptType: PromptType;
  jobType: 'analysis_deck' | 'proposal' | 'ai_content';
  requiresEngagement: boolean;
  usesBrandProfile: boolean;
}

export const AUTOMATIONS: Record<string, AutomationDef> = {
  proposal: {
    promptType: 'proposal_content',
    jobType: 'proposal',
    requiresEngagement: true,
    usesBrandProfile: true,
  },
};
