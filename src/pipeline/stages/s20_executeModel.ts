import { execute } from '../layer6/executionEngine';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageExecuteModel(ctx: PipelineContext) {
  return runStage(async () => {
    const payload = requireContext(ctx.payload, 'API payload');

    await ctx.apiKeyManager?.ensureReady(ctx.input.targetModel);

    const executionResult = await execute(payload);
    ctx.executionResult = executionResult;
    return executionResult;
  });
}
