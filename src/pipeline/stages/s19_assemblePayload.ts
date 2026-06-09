import { ConfidenceLevel } from '../../types';
import type { PipelineResult } from '../../types';
import { assemblePayload } from '../layer6/executionEngine';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageAssemblePayload(ctx: PipelineContext) {
  return runStage(() => {
    const enrichedPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const intent = requireContext(ctx.intent, 'Intent classification');
    const template = requireContext(ctx.template, 'Selected template');
    const complexityScore = requireContext(ctx.complexityScore, 'Complexity score');
    const pipelineState: PipelineResult = ctx.result ?? {
      enrichedPrompt,
      rawResponse: '',
      processedResponse: '',
      intent,
      template,
      complexityScore,
      piiRedactions: ctx.piiRedactions ?? [],
      confidenceLevel: ConfidenceLevel.LOW,
      citationList: [],
      executionTimeMs: 0,
      slotMappings: ctx.slotMappings ?? [],
      matchZone: ctx.matchZone ?? 'DIRECT',
      matchScore: ctx.matchScore ?? 0,
      matchBadge: ctx.matchBadge ?? '',
      isNewTemplate: ctx.isNewTemplate ?? false,
      model: ctx.input.targetModel,
    };
    const payload = assemblePayload(pipelineState, ctx.input.targetModel);

    if (ctx.includeImageInPayload && ctx.input.imageData) {
      payload.imageData = ctx.input.imageData;
    }

    ctx.result = pipelineState;
    ctx.payload = payload;
    return payload;
  });
}
