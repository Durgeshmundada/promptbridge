import { injectPersonaContext } from '../layer2/personaInjector';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageInjectPersona(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const prompt = injectPersonaContext(workingPrompt, ctx.persona ?? null);

    ctx.workingPrompt = prompt;
    return prompt;
  });
}
