import { adaptPromptForModel } from '../layer2/modelAwareAdapter';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageAdaptForModel(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const prompt = adaptPromptForModel(workingPrompt, ctx.input.targetModel);

    ctx.workingPrompt = prompt;
    return prompt;
  });
}
