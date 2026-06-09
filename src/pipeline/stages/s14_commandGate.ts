import { evaluateCommandGate } from '../layer3/commandGate';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageCommandGate(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const intent = requireContext(ctx.intent, 'Intent classification');
    const commandGateResult = evaluateCommandGate(workingPrompt, intent.intent);

    ctx.commandGateResult = commandGateResult;
    return commandGateResult;
  });
}
