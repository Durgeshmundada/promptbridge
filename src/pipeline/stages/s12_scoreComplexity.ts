import { scorePromptComplexity } from '../layer2/promptComplexityScorer';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageScoreComplexity(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const complexityScore = scorePromptComplexity({
      rawInput: ctx.input.rawInput,
      enrichedPrompt: workingPrompt,
    });

    ctx.complexityScore = complexityScore;
    return complexityScore;
  });
}
