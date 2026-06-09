import { detectKnowledgeGaps } from '../layer2/knowledgeGapDetector';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageDetectGaps(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const knowledgeGaps = detectKnowledgeGaps(workingPrompt);

    ctx.knowledgeGaps = knowledgeGaps;
    return knowledgeGaps;
  });
}
