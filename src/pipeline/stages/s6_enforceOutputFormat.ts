import { enforceOutputFormat } from '../layer1/outputFormatEnforcer';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageEnforceOutputFormat(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const intent = requireContext(ctx.intent, 'Intent classification');
    const prompt = enforceOutputFormat(workingPrompt, intent.intent);

    ctx.workingPrompt = prompt;
    return prompt;
  });
}
