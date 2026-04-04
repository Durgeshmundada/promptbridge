import { IntentType, RatingValue } from '../../types';
import { promoteAbWinnerTemplate, selectAbTemplates } from '../abTesting';
import type { PromptRating, PromptTemplate } from '../../types';

const STORY_TEMPLATE: PromptTemplate = {
  id: 'creative-story',
  intentType: IntentType.CREATIVE,
  template:
    'Create a product description with emotional storytelling about {{topic}} for {{audience}}.',
  description: 'Emotional storytelling copy for premium lifestyle launches.',
  tags: ['creative', 'storytelling', 'lifestyle'],
  weight: 1.05,
};

const SPEC_TEMPLATE: PromptTemplate = {
  id: 'creative-specs',
  intentType: IntentType.CREATIVE,
  template:
    'Create a product description with technical features and comparisons about {{topic}}.',
  description:
    'Technical wireless earbuds product description focused on specifications and comparisons.',
  tags: ['creative', 'technical', 'wireless', 'earbuds', 'product'],
  weight: 1.42,
};

const PRODUCT_DESCRIPTION_PROMPT = 'write a product description for wireless earbuds';

/**
 * Creates a deterministic prompt rating for template-feedback tests.
 */
function createRating(templateId: string, rating: RatingValue): PromptRating {
  return {
    promptId: 'ab-test-prompt',
    templateId,
    intentId: IntentType.CREATIVE,
    rating,
    comment: '',
    timestamp: '2026-04-04T12:00:00.000Z',
  };
}

describe('popup A/B helpers', () => {
  it('selects the top two A/B template candidates for a creative prompt', () => {
    const selection = selectAbTemplates(
      PRODUCT_DESCRIPTION_PROMPT,
      [STORY_TEMPLATE, SPEC_TEMPLATE],
      [],
    );

    expect(selection.intent.intent).toBe(IntentType.CREATIVE);
    expect(selection.templates).toHaveLength(2);
    expect(selection.templates.map((template) => template.id)).toEqual(
      expect.arrayContaining([STORY_TEMPLATE.id, SPEC_TEMPLATE.id]),
    );
  });

  it('promotes the chosen A/B winner to the top template match for the same prompt', () => {
    const beforePromotion = selectAbTemplates(
      PRODUCT_DESCRIPTION_PROMPT,
      [STORY_TEMPLATE, SPEC_TEMPLATE],
      [],
    );

    expect(beforePromotion.templates[0]?.id).toBe(SPEC_TEMPLATE.id);

    const promotedTemplates = promoteAbWinnerTemplate({
      rawInput: PRODUCT_DESCRIPTION_PROMPT,
      winnerTemplateId: STORY_TEMPLATE.id,
      loserTemplateId: SPEC_TEMPLATE.id,
      ratings: [
        createRating(STORY_TEMPLATE.id, RatingValue.THUMBS_UP),
        createRating(SPEC_TEMPLATE.id, RatingValue.THUMBS_DOWN),
      ],
      templates: [STORY_TEMPLATE, SPEC_TEMPLATE],
      pinnedTemplateIds: [],
    });

    const afterPromotion = selectAbTemplates(
      PRODUCT_DESCRIPTION_PROMPT,
      promotedTemplates.templates,
      promotedTemplates.pinnedTemplateIds,
    );

    expect(afterPromotion.templates[0]?.id).toBe(STORY_TEMPLATE.id);
  });
});
