import { buildMultimodalPrompt } from '../multimodalPromptBuilder';

describe('buildMultimodalPrompt', () => {
  it('includes image payload guidance when the target model supports multimodal input', () => {
    const result = buildMultimodalPrompt({
      imageContextBlock: 'The attached image shows a diagram.',
      userText: 'Explain the architecture in the image.',
      enrichedTemplate: 'Use a step-by-step explanation.',
      personaContext: 'You are assisting a solutions architect.',
      sessionContext: 'Earlier we discussed the API gateway.',
      supportsMultimodal: true,
    });

    expect(result.includeImageInPayload).toBe(true);
    expect(result.finalPrompt).toContain('Image Guidance:');
    expect(result.finalPrompt).toContain('The original image will be attached in the multimodal payload.');
  });

  it('uses text-only image context when the target model does not support multimodal input', () => {
    const result = buildMultimodalPrompt({
      imageContextBlock: 'The attached image shows a scanned invoice.',
      userText: 'Summarize the invoice.',
      enrichedTemplate: 'Return key fields.',
      personaContext: 'You are assisting a finance analyst.',
      sessionContext: '',
      supportsMultimodal: false,
    });

    expect(result.includeImageInPayload).toBe(false);
    expect(result.finalPrompt).toContain('Image Context:');
    expect(result.finalPrompt).toContain(
      'The model does not support direct image input, so rely on this text-only image summary:',
    );
  });

  it('omits blank sections rather than rendering empty headings', () => {
    const result = buildMultimodalPrompt({
      imageContextBlock: 'The attached image shows a user interface screenshot.',
      userText: 'Describe the UI.',
      enrichedTemplate: 'Respond with bullets.',
      personaContext: '',
      sessionContext: '',
      supportsMultimodal: true,
    });

    expect(result.finalPrompt).not.toContain('Persona Context:\n\n');
    expect(result.finalPrompt).not.toContain('Session Context:\n\n');
    expect(result.finalPrompt).toContain('User Request:');
    expect(result.finalPrompt).toContain('Enriched Template:');
  });
});
