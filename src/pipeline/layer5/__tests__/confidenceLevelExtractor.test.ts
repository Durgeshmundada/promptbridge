import { ConfidenceLevel } from '../../../types';
import { extractConfidenceLevel } from '../confidenceLevelExtractor';

describe('extractConfidenceLevel', () => {
  it('returns HIGH when verified markers dominate the response', () => {
    const response = [
      'Paris is the capital of France. [VERIFIED]',
      'France is in Europe. [VERIFIED]',
      'The Eiffel Tower is in Paris. [VERIFIED]',
      'French is the official language of France. [VERIFIED]',
      'It is a popular destination. [LIKELY]',
    ].join(' ');

    const result = extractConfidenceLevel(response);

    expect(result.level).toBe(ConfidenceLevel.HIGH);
    expect(result.verifiedCount).toBe(4);
    expect(result.likelyCount).toBe(1);
    expect(result.warningMessage).toBeNull();
  });

  it('returns MEDIUM when verified claims are at least half of all markers', () => {
    const response = [
      'Claim one. [VERIFIED]',
      'Claim two. [VERIFIED]',
      'Claim three. [LIKELY]',
      'Claim four. [NO_CITATION]',
    ].join(' ');

    const result = extractConfidenceLevel(response);

    expect(result.level).toBe(ConfidenceLevel.MEDIUM);
    expect(result.noCitationCount).toBe(1);
    expect(result.warningMessage).toBeNull();
  });

  it('returns LOW and a warning when verified claims are under half of all markers', () => {
    const response = [
      'Unsupported claim. [UNVERIFIED]',
      'Another unsupported claim. [NO_CITATION]',
      'Tentative claim. [LIKELY]',
    ].join(' ');

    const result = extractConfidenceLevel(response);

    expect(result.level).toBe(ConfidenceLevel.LOW);
    expect(result.unverifiedCount).toBe(1);
    expect(result.noCitationCount).toBe(1);
    expect(result.warningMessage).toBe(
      'This response contains significant unverified claims. Consider cross-checking with primary sources.',
    );
  });
});
