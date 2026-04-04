import { classifyIntent } from '../pipeline/layer1/intentClassifier';
import {
  adjustWeights,
  matchTemplates,
  prioritizePinnedTemplates,
} from '../pipeline/layer1/templateMatcher';
import type {
  IntentClassification,
  PromptRating,
  PromptTemplate,
} from '../types';

const MAX_TEMPLATE_WEIGHT = 1.8;
const MIN_TEMPLATE_WEIGHT = 0.8;
const STRONG_WINNER_WEIGHT = 1.55;
const STRONG_LOSER_WEIGHT = 0.95;

export interface AbTemplateSelection {
  intent: IntentClassification;
  templates: PromptTemplate[];
}

export interface AbWinnerPromotionInput {
  rawInput: string;
  winnerTemplateId: string;
  loserTemplateId: string;
  ratings: PromptRating[];
  templates: PromptTemplate[];
  pinnedTemplateIds: string[];
}

export interface AbWinnerPromotionResult {
  pinnedTemplateIds: string[];
  templates: PromptTemplate[];
}

/**
 * Returns the top two templates that should participate in an A/B comparison for a prompt.
 */
export function selectAbTemplates(
  rawInput: string,
  templates: PromptTemplate[],
  pinnedTemplateIds: string[],
): AbTemplateSelection {
  const intent = classifyIntent(rawInput);
  const prioritizedTemplates = prioritizePinnedTemplates(templates, pinnedTemplateIds);

  return {
    intent,
    templates: matchTemplates(intent, rawInput, prioritizedTemplates).slice(0, 2),
  };
}

/**
 * Applies rating-driven weight updates and then strongly promotes the selected A/B winner.
 */
export function promoteAbWinnerTemplate({
  rawInput,
  winnerTemplateId,
  loserTemplateId,
  ratings,
  templates,
  pinnedTemplateIds,
}: AbWinnerPromotionInput): AbWinnerPromotionResult {
  let nextTemplates = adjustWeights(ratings, templates).map((template) => {
    if (template.id === winnerTemplateId) {
      return {
        ...template,
        weight: Number(
          Math.min(MAX_TEMPLATE_WEIGHT, Math.max(template.weight, STRONG_WINNER_WEIGHT)).toFixed(2),
        ),
      };
    }

    if (template.id === loserTemplateId) {
      return {
        ...template,
        weight: Number(
          Math.max(MIN_TEMPLATE_WEIGHT, Math.min(template.weight, STRONG_LOSER_WEIGHT)).toFixed(2),
        ),
      };
    }

    return template;
  });

  if (
    selectAbTemplates(rawInput, nextTemplates, pinnedTemplateIds).templates[0]?.id ===
    winnerTemplateId
  ) {
    return {
      pinnedTemplateIds,
      templates: nextTemplates,
    };
  }

  const currentTopTemplateId =
    selectAbTemplates(rawInput, nextTemplates, pinnedTemplateIds).templates[0]?.id ?? loserTemplateId;

  nextTemplates = nextTemplates.map((template) => {
    if (template.id === winnerTemplateId) {
      return {
        ...template,
        weight: MAX_TEMPLATE_WEIGHT,
      };
    }

    if (template.id === currentTopTemplateId || template.id === loserTemplateId) {
      return {
        ...template,
        weight: MIN_TEMPLATE_WEIGHT,
      };
    }

    return template;
  });

  const nextPinnedTemplateIds = pinnedTemplateIds.includes(winnerTemplateId)
    ? pinnedTemplateIds
    : [winnerTemplateId, ...pinnedTemplateIds];

  return {
    pinnedTemplateIds: nextPinnedTemplateIds,
    templates: nextTemplates,
  };
}
