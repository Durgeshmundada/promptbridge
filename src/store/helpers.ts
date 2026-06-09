import { DEFAULT_PERSONAS } from '../config/defaults';
import type { Persona, PromptRating, PromptTemplate, SessionNode } from '../types';
import { DEFAULT_APP_SETTINGS } from '../utils/storage';
import type { PromptBridgeState } from './types';

export function cloneSessionNodes(nodes: SessionNode[]): SessionNode[] {
  return nodes.map((node) => ({
    ...node,
    keyEntities: [...node.keyEntities],
  }));
}

export function clonePersonas(personas: Persona[]): Persona[] {
  return personas.map((persona) => ({
    ...persona,
    expertise: [...persona.expertise],
  }));
}

export function cloneTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  return templates.map((template) => ({
    ...template,
    tags: [...template.tags],
    ...(template.tfIdfVector ? { tfIdfVector: [...template.tfIdfVector] } : {}),
  }));
}

export function cloneRatings(ratings: PromptRating[]): PromptRating[] {
  return ratings.map((rating) => ({ ...rating }));
}

export function serializeTemplateForComparison(template: PromptTemplate): string {
  return JSON.stringify({
    id: template.id,
    intentType: template.intentType,
    template: template.template,
    description: template.description,
    tags: [...template.tags],
    weight: template.weight,
  });
}

export function getChangedTemplates(
  previousTemplates: PromptTemplate[],
  nextTemplates: PromptTemplate[],
): PromptTemplate[] {
  const previousTemplatesById = new Map(
    previousTemplates.map((template) => [template.id, serializeTemplateForComparison(template)]),
  );

  return nextTemplates.filter((template) => {
    return previousTemplatesById.get(template.id) !== serializeTemplateForComparison(template);
  });
}

export function resolveActivePersona(personas: Persona[], activePersonaId: string): Persona | null {
  return personas.find((persona) => persona.id === activePersonaId) ?? null;
}

export function createInitialState(
  defaultTemplates: PromptTemplate[],
): Pick<
  PromptBridgeState,
  | 'currentSession'
  | 'settings'
  | 'personas'
  | 'templates'
  | 'pinnedTemplateIds'
  | 'history'
  | 'pipelineStatus'
  | 'pipelineStage'
  | 'activePersona'
  | 'ratings'
  | 'lastResult'
  | 'popupVersion'
  | 'popupDraftInput'
  | 'popupImageAttachment'
  | 'popupStatusMessage'
  | 'popupPendingInteraction'
  | 'popupCurrentPromptId'
  | 'popupCurrentHistoryEntryId'
  | 'popupLastSubmittedInput'
  | 'hydrated'
> {
  const personas = clonePersonas(DEFAULT_PERSONAS);
  const settings = { ...DEFAULT_APP_SETTINGS };

  return {
    currentSession: null,
    settings,
    personas,
    templates: cloneTemplates(defaultTemplates),
    pinnedTemplateIds: [],
    history: [],
    pipelineStatus: 'IDLE',
    pipelineStage: 'IDLE',
    activePersona: resolveActivePersona(personas, settings.activePersonaId),
    ratings: [],
    lastResult: null,
    popupVersion: '',
    popupDraftInput: '',
    popupImageAttachment: null,
    popupStatusMessage: '',
    popupPendingInteraction: null,
    popupCurrentPromptId: '',
    popupCurrentHistoryEntryId: '',
    popupLastSubmittedInput: null,
    hydrated: false,
  };
}
