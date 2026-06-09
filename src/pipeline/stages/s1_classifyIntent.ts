import { classifyIntent } from '../layer1/intentClassifier';
import type { PipelineContext } from './types';
import { runStage } from './types';

export async function runStageClassifyIntent(ctx: PipelineContext) {
  return runStage(() => {
    const intent = classifyIntent(ctx.input.rawInput);
    ctx.intent = intent;
    return intent;
  });
}
