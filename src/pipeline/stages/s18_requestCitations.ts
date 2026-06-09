import { triggerCitationRequests } from '../layer5/citationRequestTrigger';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageRequestCitations(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const intent = requireContext(ctx.intent, 'Intent classification');
    const prompt = triggerCitationRequests(workingPrompt, intent.intent);

    ctx.workingPrompt = prompt;
    return prompt;
  });
}
