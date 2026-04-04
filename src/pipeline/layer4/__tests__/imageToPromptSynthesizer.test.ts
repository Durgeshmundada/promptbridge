import { ImageType } from '../../../types';
import { synthesizeImageToPromptContext } from '../imageToPromptSynthesizer';

describe('synthesizeImageToPromptContext', () => {
  it('builds a structured context block from OCR and relationship mapping results', () => {
    const result = synthesizeImageToPromptContext({
      imageType: ImageType.CHART_GRAPH,
      ocrResult: {
        extractedText: 'Q1 Q2 Q3 Q4\nRevenue',
        detectedLanguage: 'English',
        hasCode: false,
      },
      mapResult: {
        elements: ['x-axis', 'y-axis', 'revenue line'],
        relationships: ['revenue rises steadily from Q1 to Q4'],
        layout: 'single chart with legend on the right',
        summary: 'Quarterly revenue growth over four periods',
      },
    });

    expect(result).toContain('The attached image shows a chart or graph.');
    expect(result).toContain('It contains x-axis, y-axis, revenue line.');
    expect(result).toContain('Key relationships: revenue rises steadily from Q1 to Q4.');
    expect(result).toContain('Layout: single chart with legend on the right.');
    expect(result).toContain('Extracted text: Q1 Q2 Q3 Q4\nRevenue Detected language: English.');
    expect(result).toContain('This appears to depict Quarterly revenue growth over four periods.');
  });

  it('describes code-oriented OCR when no structural mapping is available', () => {
    const result = synthesizeImageToPromptContext({
      imageType: ImageType.SCREENSHOT_CODE,
      ocrResult: {
        extractedText: 'function test() { return true; }',
        detectedLanguage: 'JavaScript',
        hasCode: true,
        syntaxErrors: ['No syntax errors detected'],
      },
    });

    expect(result).toContain('The attached image shows a code screenshot.');
    expect(result).toContain('Code detected in JavaScript.');
    expect(result).toContain('Possible syntax issues: No syntax errors detected.');
  });

  it('falls back gracefully when OCR and mapping results are both missing', () => {
    const result = synthesizeImageToPromptContext({
      imageType: ImageType.UNKNOWN,
    });

    expect(result).toContain('The attached image shows an image of unknown type.');
    expect(result).toContain('It contains no clearly identified elements.');
    expect(result).toContain('Extracted text: no extractable text was detected.');
  });
});
