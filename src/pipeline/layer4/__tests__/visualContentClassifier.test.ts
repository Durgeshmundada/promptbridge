import { ImageType } from '../../../types';
import type { Layer4Error } from '../claudeVisionBridge';
import { Layer4ErrorCode } from '../claudeVisionBridge';
import { classifyVisualContent } from '../visualContentClassifier';
import { installRuntimeMock } from './runtimeMock';

describe('classifyVisualContent', () => {
  it('parses a direct JSON classification response from Claude Vision', async () => {
    const sendMessageMock = installRuntimeMock(() => ({
      ok: true,
      model: 'claude-3-5-sonnet-20241022',
      stopReason: 'end_turn',
      content: JSON.stringify({
        type: 'DIAGRAM',
        confidence: 0.93,
        suggestedPipeline: ['objectRelationshipMapper', 'imageToPromptSynthesizer'],
      }),
    }));

    const result = await classifyVisualContent({
      imageData: 'base64-image',
      mimeType: 'image/png',
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CLAUDE_VISION_REQUEST',
      }),
      expect.any(Function),
    );
    expect(result).toEqual({
      type: ImageType.DIAGRAM,
      confidence: 0.93,
      suggestedPipeline: ['objectRelationshipMapper', 'imageToPromptSynthesizer'],
    });
  });

  it('parses fenced JSON and falls back to the default pipeline when the model omits it', async () => {
    installRuntimeMock(() => ({
      ok: true,
      model: 'claude-3-5-sonnet-20241022',
      stopReason: 'end_turn',
      content: '```json\n{"type":"SCREENSHOT_CODE","confidence":"88"}\n```',
    }));

    const result = await classifyVisualContent({
      imageData: 'base64-image',
      mimeType: 'image/png',
    });

    expect(result.type).toBe(ImageType.SCREENSHOT_CODE);
    expect(result.confidence).toBe(0.88);
    expect(result.suggestedPipeline).toEqual([
      'ocrTextExtractor',
      'imageToPromptSynthesizer',
      'multimodalPromptBuilder',
    ]);
  });

  it('throws a typed error when Claude returns invalid JSON', async () => {
    installRuntimeMock(() => ({
      ok: true,
      model: 'claude-3-5-sonnet-20241022',
      stopReason: 'end_turn',
      content: 'not valid json',
    }));

    await expect(
      classifyVisualContent({
        imageData: 'base64-image',
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({
      name: 'Layer4Error',
      code: Layer4ErrorCode.JSON_PARSE_FAILED,
    } satisfies Partial<Layer4Error>);
  });
});
