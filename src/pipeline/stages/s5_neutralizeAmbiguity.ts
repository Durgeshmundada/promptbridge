import { neutralizeAmbiguity } from '../layer1/ambiguityNeutralizer';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageNeutralizeAmbiguity(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const prompt = neutralizeAmbiguity(
      workingPrompt,
      ctx.sessionContext ?? ctx.input.rawInput,
    );

    ctx.workingPrompt = prompt;
    return prompt;
  });
}
