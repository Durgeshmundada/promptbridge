import { evaluateScopeConfirmation } from '../layer3/scopeConfirmation';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageScopeConfirmation(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const scopeConfirmationResult = evaluateScopeConfirmation(workingPrompt);

    ctx.scopeConfirmationResult = scopeConfirmationResult;
    return scopeConfirmationResult;
  });
}
