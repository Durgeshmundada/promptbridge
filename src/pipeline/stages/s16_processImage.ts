import { ModelTarget } from '../../types';
import type { Persona } from '../../types';
import { buildMultimodalPrompt } from '../layer4/multimodalPromptBuilder';
import { mapObjectRelationships } from '../layer4/objectRelationshipMapper';
import { extractOcrText } from '../layer4/ocrTextExtractor';
import { classifyVisualContent } from '../layer4/visualContentClassifier';
import { synthesizeImageToPromptContext } from '../layer4/imageToPromptSynthesizer';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

const DEFAULT_IMAGE_MIME_TYPE = 'image/png';
const MULTIMODAL_MODEL_TARGETS = new Set<ModelTarget>([
  ModelTarget.GPT4O,
  ModelTarget.CLAUDE,
  ModelTarget.GEMINI,
]);

function inferImageMimeType(imageData: string): string {
  const dataUrlMatch = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  return dataUrlMatch?.[1] ?? DEFAULT_IMAGE_MIME_TYPE;
}

function shouldRunLayer4Module(suggestedPipeline: string[], moduleName: string): boolean {
  return suggestedPipeline.includes(moduleName);
}

function buildPersonaContextBlock(persona: Persona | null | undefined): string {
  if (!persona) {
    return '';
  }

  const expertise =
    persona.expertise.length > 0 ? persona.expertise.join(', ') : 'general problem solving';

  return `You are assisting ${persona.role} with expertise in ${expertise}. Domain context: ${persona.domainContext}. Respond in ${persona.preferredStyle} style.`;
}

export async function runStageProcessImage(ctx: PipelineContext) {
  return runStage(async () => {
    const imageData = ctx.input.imageData;

    if (!imageData) {
      ctx.includeImageInPayload = false;
      return {
        finalPrompt: ctx.workingPrompt ?? '',
        includeImageInPayload: false,
      };
    }

    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const visualContent = await classifyVisualContent({
      imageData,
      mimeType: inferImageMimeType(imageData),
    });
    const ocrResult = shouldRunLayer4Module(
      visualContent.suggestedPipeline,
      'ocrTextExtractor',
    )
      ? await extractOcrText({
          imageData,
          imageType: visualContent.type,
        })
      : undefined;
    const mapResult = shouldRunLayer4Module(
      visualContent.suggestedPipeline,
      'objectRelationshipMapper',
    )
      ? await mapObjectRelationships({
          imageData,
          imageType: visualContent.type,
        })
      : undefined;
    const imageContextBlock = synthesizeImageToPromptContext({
      ocrResult,
      mapResult,
      imageType: visualContent.type,
    });
    const multimodalPrompt = buildMultimodalPrompt({
      imageContextBlock,
      userText: ctx.input.rawInput,
      enrichedTemplate: workingPrompt,
      personaContext: buildPersonaContextBlock(ctx.persona),
      sessionContext: ctx.sessionMemoryResult?.relevantContext ?? '',
      supportsMultimodal: MULTIMODAL_MODEL_TARGETS.has(ctx.input.targetModel),
    });

    ctx.workingPrompt = multimodalPrompt.finalPrompt;
    ctx.includeImageInPayload = multimodalPrompt.includeImageInPayload;
    ctx.sessionContext = imageContextBlock;

    return multimodalPrompt;
  });
}
