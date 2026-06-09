import { generateEnhancedClarificationSet } from '../layer2/enhancedClarificationEngine';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageGenerateClarifications(ctx: PipelineContext) {
  return runStage(async () => {
    const intent = requireContext(ctx.intent, 'Intent classification');
    const clarificationQuestions = await generateEnhancedClarificationSet({
      rawInput: ctx.templateSearchInput ?? ctx.input.rawInput,
      intent: intent.intent,
      knowledgeGaps: ctx.knowledgeGaps ?? [],
      sessionContext: ctx.templateRetrievalContext ?? '',
    });

    ctx.clarificationQuestions = clarificationQuestions;
    return clarificationQuestions;
  });
}
