import { injectFactFlags } from '../layer5/factFlagInjector';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageInjectFactFlags(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const intent = requireContext(ctx.intent, 'Intent classification');
    const prompt = injectFactFlags(workingPrompt, intent.intent);

    ctx.workingPrompt = prompt;
    return prompt;
  });
}
