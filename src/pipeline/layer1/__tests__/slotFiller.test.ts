import { fillTemplateSlots } from '../slotFiller';

describe('slotFiller', () => {
  it('detects files, versions, languages, and frameworks', () => {
    const result = fillTemplateSlots(
      'Debug src/App.tsx in a React TypeScript app after upgrading to version 18.3.1.',
      'File: {{file_name}}\nLanguage: {{language}}\nFramework: {{framework}}\nVersion: {{version}}',
    );

    expect(result.filledTemplate).toContain('src/App.tsx');
    expect(result.filledTemplate).toContain('TypeScript');
    expect(result.filledTemplate).toContain('React');
    expect(result.filledTemplate).toContain('18.3.1');
    expect(result.slotMappings).toHaveLength(4);
  });

  it('detects dates, urls, and comparison items', () => {
    const result = fillTemplateSlots(
      'Compare React vs Vue before 2026-05-01 and review https://example.com/notes for context.',
      'Compare: {{comparison_items}}\nDate: {{date}}\nURL: {{url}}',
    );

    expect(result.filledTemplate).toContain('React vs Vue');
    expect(result.filledTemplate).toContain('2026-05-01');
    expect(result.filledTemplate).toContain('https://example.com/notes');
  });

  it('falls back to derived defaults when no entities are present', () => {
    const result = fillTemplateSlots(
      'Please help me organize the request clearly.',
      'Task: {{task}}\nConstraints: {{constraints}}\nOutput: {{output_format}}',
    );

    expect(result.filledTemplate).toContain('Please help me organize the request clearly.');
    expect(result.filledTemplate).toContain('Preserve the user intent');
    expect(result.filledTemplate).not.toContain('{{');
  });
});
