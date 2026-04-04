export interface MultimodalPromptBuilderInput {
  imageContextBlock: string;
  userText: string;
  enrichedTemplate: string;
  personaContext: string;
  sessionContext: string;
  supportsMultimodal: boolean;
}

export interface MultimodalPromptBuilderResult {
  finalPrompt: string;
  includeImageInPayload: boolean;
}

function buildSection(title: string, value: string): string | null {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  return `${title}:\n${normalizedValue}`;
}

/**
 * Merges image-derived context, text input, persona context, and session context into the final Layer 4 prompt.
 */
export function buildMultimodalPrompt(
  input: MultimodalPromptBuilderInput,
): MultimodalPromptBuilderResult {
  const imageSection = input.supportsMultimodal
    ? buildSection(
        'Image Guidance',
        [
          'The original image will be attached in the multimodal payload.',
          'Use the following text summary as supplemental context:',
          input.imageContextBlock,
        ].join('\n'),
      )
    : buildSection(
        'Image Context',
        [
          'The model does not support direct image input, so rely on this text-only image summary:',
          input.imageContextBlock,
        ].join('\n'),
      );

  const sections = [
    buildSection('Persona Context', input.personaContext),
    buildSection('Session Context', input.sessionContext),
    buildSection('User Request', input.userText),
    buildSection('Enriched Template', input.enrichedTemplate),
    imageSection,
  ].filter((section): section is string => section !== null);

  return {
    finalPrompt: sections.join('\n\n').trim(),
    includeImageInPayload: input.supportsMultimodal,
  };
}
