import { highlightUnverifiableClaims } from '../unverifiableClaimHighlighter';

describe('highlightUnverifiableClaims', () => {
  it('wraps sentences containing UNVERIFIED markers in the expected span', () => {
    const response =
      'The drug was approved in 1980. [VERIFIED] It cures every patient instantly. [UNVERIFIED]';

    const result = highlightUnverifiableClaims(response);

    expect(result.highlightedCount).toBe(1);
    expect(result.processedHtml).toContain(
      '<span class="pb-unverified" data-tooltip="This claim could not be verified by the model" title="This claim could not be verified by the model"> It cures every patient instantly. [UNVERIFIED]</span>',
    );
  });

  it('wraps multiple sentences containing NO_CITATION or UNVERIFIED markers', () => {
    const response = [
      'Documented claim. [VERIFIED]',
      'This legal interpretation has no source. [NO_CITATION]',
      'This second claim is also weak. [UNVERIFIED]',
    ].join(' ');

    const result = highlightUnverifiableClaims(response);

    expect(result.highlightedCount).toBe(2);
    expect(result.processedHtml.match(/class="pb-unverified"/g)?.length).toBe(2);
  });

  it('escapes HTML and leaves fully supported responses unwrapped', () => {
    const response = 'Use <b>primary sources</b> when possible. [VERIFIED]';

    const result = highlightUnverifiableClaims(response);

    expect(result.highlightedCount).toBe(0);
    expect(result.processedHtml).toContain('&lt;b&gt;primary sources&lt;/b&gt;');
    expect(result.processedHtml).not.toContain('class="pb-unverified"');
  });
});
