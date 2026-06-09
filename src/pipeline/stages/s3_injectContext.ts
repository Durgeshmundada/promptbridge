import { injectContext } from '../layer1/contextInjector';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageInjectContext(ctx: PipelineContext) {
  return runStage(() => {
    const template = requireContext(ctx.template, 'Selected template');
    const persona = requireContext(ctx.persona, 'Persona');
    const prompt = injectContext(
      template,
      persona,
      ctx.sessionContext ?? ctx.input.rawInput,
    );

    ctx.workingPrompt = prompt;
    return prompt;
  });
}
