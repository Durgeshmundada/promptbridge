import { getAllTemplates, getTopMatch } from '../layer1/templateMatcher';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

const DIRECT_MATCH_BADGE = 'Template matched directly';
const PARTIAL_MATCH_BADGE = 'Template adapted from existing';
const GENERATED_TEMPLATE_BADGE = 'New template generated and saved';

function buildMatchBadge(zone: NonNullable<PipelineContext['matchZone']>): string {
  switch (zone) {
    case 'DIRECT':
      return DIRECT_MATCH_BADGE;
    case 'PARTIAL':
      return PARTIAL_MATCH_BADGE;
    case 'GENERATE':
      return GENERATED_TEMPLATE_BADGE;
    default: {
      const unreachableZone: never = zone;
      return unreachableZone;
    }
  }
}

export async function runStageMatchTemplate(ctx: PipelineContext) {
  return runStage(async () => {
    const intent = requireContext(ctx.intent, 'Intent classification');
    const templateLibrary = ctx.templateLibrary ?? (await getAllTemplates());
    const candidates = ctx.templateOverride
      ? [ctx.templateOverride, ...templateLibrary]
      : templateLibrary;
    const topMatch = getTopMatch(
      intent,
      ctx.templateSearchInput ?? ctx.input.rawInput,
      candidates,
    );
    const selectedTemplate = ctx.templateOverride ?? topMatch.template ?? templateLibrary[0];

    if (!selectedTemplate) {
      throw new Error('No matching prompt template was available.');
    }

    ctx.templateLibrary = templateLibrary;
    ctx.topMatch = topMatch;
    ctx.template = selectedTemplate;
    ctx.matchZone = ctx.templateOverride ? 'DIRECT' : topMatch.zone;
    ctx.matchScore = ctx.templateOverride ? 1 : topMatch.score;
    ctx.matchBadge = buildMatchBadge(ctx.matchZone);
    ctx.isNewTemplate = false;

    return topMatch;
  });
}
