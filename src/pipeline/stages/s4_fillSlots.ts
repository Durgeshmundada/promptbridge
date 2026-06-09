import { fillTemplateSlots } from '../layer1/slotFiller';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageFillSlots(ctx: PipelineContext) {
  return runStage(() => {
    const template = requireContext(ctx.template, 'Selected template');
    const slotFillResult = fillTemplateSlots(ctx.input.rawInput, template.template);

    ctx.slotMappings = slotFillResult.slotMappings;
    ctx.workingPrompt = slotFillResult.filledTemplate;
    return slotFillResult;
  });
}
