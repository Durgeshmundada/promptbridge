import { IntentType } from '../../types';
import type { SessionNode } from '../../types';
import { buildSessionMemoryGraph } from '../layer2/sessionMemoryGraph';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

const DEFAULT_RESPONSE_QUALITY = 0.5;

export async function runStageBuildSessionMemory(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const intent = ctx.intent?.intent ?? IntentType.GENERAL;
    const sessionNode: SessionNode = {
      promptId: ctx.promptId ?? `${ctx.input.sessionId}-${Date.now().toString()}`,
      intent,
      keyEntities: [],
      timestamp: ctx.timestamp ?? new Date().toISOString(),
      responseQuality: DEFAULT_RESPONSE_QUALITY,
      enrichedPrompt: workingPrompt,
      rawResponse: '',
    };
    const sessionMemoryResult = buildSessionMemoryGraph(
      sessionNode,
      ctx.existingSessionNodes ?? [],
      ctx.settings.sessionMemoryDepth,
    );

    ctx.sessionMemoryResult = sessionMemoryResult;
    ctx.workingPrompt = sessionMemoryResult.relevantContext
      ? `${workingPrompt}\n\n${sessionMemoryResult.relevantContext}`
      : workingPrompt;

    return sessionMemoryResult;
  });
}
