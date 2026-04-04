import { ImageType } from '../../../types';
import type { Layer4Error } from '../claudeVisionBridge';
import { Layer4ErrorCode } from '../claudeVisionBridge';
import { extractOcrText } from '../ocrTextExtractor';
import { installRuntimeMock } from './runtimeMock';

describe('extractOcrText', () => {
  it('extracts code text, language, and syntax issues from a code screenshot', async () => {
    installRuntimeMock(() => ({
      ok: true,
      model: 'claude-3-5-sonnet-20241022',
      stopReason: 'end_turn',
      content: JSON.stringify({
        extractedText: 'const total = value + ;',
        detectedLanguage: 'TypeScript',
        hasCode: true,
        syntaxErrors: ['Missing expression after the plus operator'],
      }),
    }));

    const result = await extractOcrText({
      imageData: 'data:image/png;base64,abc123',
      imageType: ImageType.SCREENSHOT_CODE,
    });

    expect(result).toEqual({
      extractedText: 'const total = value + ;',
      detectedLanguage: 'TypeScript',
      hasCode: true,
      syntaxErrors: ['Missing expression after the plus operator'],
    });
  });

  it('returns document OCR output without optional code metadata when no code is present', async () => {
    installRuntimeMock(() => ({
      ok: true,
      model: 'claude-3-5-sonnet-20241022',
      stopReason: 'end_turn',
      content: '```json\n{"extractedText":"Invoice #2048\\nBalance Due","hasCode":false}\n```',
    }));

    const result = await extractOcrText({
      imageData: 'base64-image',
      imageType: ImageType.DOCUMENT,
    });

    expect(result).toEqual({
      extractedText: 'Invoice #2048\nBalance Due',
      hasCode: false,
    });
  });

  it('throws a typed error when the background worker returns malformed JSON', async () => {
    installRuntimeMock(() => ({
      ok: true,
      model: 'claude-3-5-sonnet-20241022',
      stopReason: 'end_turn',
      content: '{oops',
    }));

    await expect(
      extractOcrText({
        imageData: 'base64-image',
        imageType: ImageType.DOCUMENT,
      }),
    ).rejects.toMatchObject({
      name: 'Layer4Error',
      code: Layer4ErrorCode.JSON_PARSE_FAILED,
    } satisfies Partial<Layer4Error>);
  });
});
