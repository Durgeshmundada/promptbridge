import { create } from 'zustand';
import { DEFAULT_PERSONAS } from '../config/defaults';
import { getAllTemplates, TEMPLATE_LIBRARY } from '../pipeline/layer1/templateMatcher';
import { saveTemplateToRuntime } from '../utils/templateServiceRuntime';
import type {
  AppSettings,
  ClarificationQuestion,
  ClarificationResponse,
  HistoryEntry,
  Persona,
  PipelineInput,
  PipelineResult,
  PipelineStageId,
  PipelineStatus,
  PromptRating,
  PromptTemplate,
  SessionNode,
} from '../types';
import { ModelTarget } from '../types';
import {
  DEFAULT_APP_SETTINGS,
  loadPersonas,
  loadPinnedTemplateIds,
  loadPromptRatings,
  loadThemePreference,
  loadAppSettings,
  saveAppSettings,
  savePersonas,
  savePinnedTemplateIds,
  savePromptRating,
  savePromptTemplates,
  saveThemePreference,
} from '../utils/storage';

export interface CurrentSessionState {
  id: string;
  nodes: SessionNode[];
  lastUpdated: string;
}

export interface PopupImageAttachment {
  name: string;
  dataUrl: string;
  mimeType: string;
}

export type PopupPendingInteraction =
  | {
      kind: 'question';
      prompt: string;
      answer: string;
    }
  | {
      kind: 'clarificationSet';
      questions: ClarificationQuestion[];
      responses: ClarificationResponse[];
      activeQuestionId: string;
    }
  | {
      kind: 'commandConfirmation';
      prompt: string;
    }
  | {
      kind: 'scopeSelection';
      options: string[];
    };

interface PromptBridgeState {
  currentSession: CurrentSessionState | null;
  settings: AppSettings;
  personas: Persona[];
  templates: PromptTemplate[];
  pinnedTemplateIds: string[];
  history: HistoryEntry[];
  pipelineStatus: PipelineStatus;
  pipelineStage: PipelineStageId;
  activePersona: Persona | null;
  ratings: PromptRating[];
  lastResult: PipelineResult | null;
  popupVersion: string;
  popupDraftInput: string;
  popupImageAttachment: PopupImageAttachment | null;
  popupStatusMessage: string;
  popupPendingInteraction: PopupPendingInteraction | null;
  popupCurrentPromptId: string;
  popupCurrentHistoryEntryId: string;
  popupLastSubmittedInput: PipelineInput | null;
  hydrated: boolean;
  setHydrated: (hydrated: boolean) => void;
  applySettings: (settings: AppSettings) => void;
  updateSettings: (settingsPatch: Partial<AppSettings>) => void;
  setCurrentSession: (session: CurrentSessionState | null) => void;
  setPersonas: (personas: Persona[]) => void;
  setTemplates: (templates: PromptTemplate[]) => void;
  setPinnedTemplateIds: (templateIds: string[]) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setPipelineStage: (stage: PipelineStageId) => void;
  setActivePersona: (persona: Persona | null) => void;
  setHistory: (history: HistoryEntry[]) => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  setRatings: (ratings: PromptRating[]) => void;
  addRating: (rating: PromptRating) => void;
  setLastResult: (result: PipelineResult | null) => void;
  setPopupVersion: (version: string) => void;
  setPopupDraftInput: (value: string) => void;
  setPopupImageAttachment: (image: PopupImageAttachment | null) => void;
  setPopupStatusMessage: (message: string) => void;
  setPopupPendingInteraction: (interaction: PopupPendingInteraction | null) => void;
  updatePopupQuestionAnswer: (answer: string) => void;
  updatePopupClarificationAnswer: (questionId: string, answer: string) => void;
  setPopupActiveClarificationQuestion: (questionId: string) => void;
  setPopupCurrentPromptId: (promptId: string) => void;
  setPopupCurrentHistoryEntryId: (historyEntryId: string) => void;
  setPopupLastSubmittedInput: (input: PipelineInput | null) => void;
  resetPopupRuntime: () => void;
  hydratePersistentState: () => Promise<void>;
  saveSettingsToStorage: (settings: AppSettings) => Promise<void>;
  savePersonasToStorage: (personas: Persona[]) => Promise<void>;
  saveTemplatesToStorage: (templates: PromptTemplate[]) => Promise<void>;
  savePinnedTemplateIdsToStorage: (templateIds: string[]) => Promise<void>;
  togglePinnedTemplate: (templateId: string) => Promise<void>;
  saveRatingToStorage: (rating: PromptRating) => Promise<PromptRating[]>;
  resetState: () => void;
}

export const MODEL_TARGET_OPTIONS = Object.values(ModelTarget) as ModelTarget[];
export { DEFAULT_PERSONAS };

function cloneSessionNodes(nodes: SessionNode[]): SessionNode[] {
  return nodes.map((node) => ({
    ...node,
    keyEntities: [...node.keyEntities],
  }));
}

function clonePersonas(personas: Persona[]): Persona[] {
  return personas.map((persona) => ({
    ...persona,
    expertise: [...persona.expertise],
  }));
}

function cloneTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  return templates.map((template) => ({
    ...template,
    tags: [...template.tags],
    ...(template.tfIdfVector ? { tfIdfVector: [...template.tfIdfVector] } : {}),
  }));
}

function cloneRatings(ratings: PromptRating[]): PromptRating[] {
  return ratings.map((rating) => ({ ...rating }));
}

function serializeTemplateForComparison(template: PromptTemplate): string {
  return JSON.stringify({
    id: template.id,
    intentType: template.intentType,
    template: template.template,
    description: template.description,
    tags: [...template.tags],
    weight: template.weight,
  });
}

function getChangedTemplates(
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

function resolveActivePersona(personas: Persona[], activePersonaId: string): Persona | null {
  return personas.find((persona) => persona.id === activePersonaId) ?? null;
}

function createInitialState(): Pick<
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
    templates: cloneTemplates(TEMPLATE_LIBRARY),
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

export const usePromptBridgeStore = create<PromptBridgeState>((set, get) => ({
  ...createInitialState(),
  setHydrated: (hydrated) => {
    set({ hydrated });
  },
  applySettings: (settings) => {
    set((state) => ({
      settings: { ...settings },
      activePersona: resolveActivePersona(state.personas, settings.activePersonaId),
    }));
  },
  updateSettings: (settingsPatch) => {
    set((state) => {
      const nextSettings = {
        ...state.settings,
        ...settingsPatch,
      };

      return {
        settings: nextSettings,
        activePersona: resolveActivePersona(state.personas, nextSettings.activePersonaId),
      };
    });
  },
  setCurrentSession: (currentSession) => {
    set({
      currentSession: currentSession
        ? {
            ...currentSession,
            nodes: cloneSessionNodes(currentSession.nodes),
          }
        : null,
    });
  },
  setPersonas: (personas) => {
    set((state) => {
      const nextPersonas = clonePersonas(personas);

      return {
        personas: nextPersonas,
        activePersona: resolveActivePersona(nextPersonas, state.settings.activePersonaId),
      };
    });
  },
  setTemplates: (templates) => {
    set({ templates: cloneTemplates(templates) });
  },
  setPinnedTemplateIds: (pinnedTemplateIds) => {
    set({ pinnedTemplateIds: [...new Set(pinnedTemplateIds)] });
  },
  setPipelineStatus: (pipelineStatus) => {
    set({ pipelineStatus });
  },
  setPipelineStage: (pipelineStage) => {
    set({ pipelineStage });
  },
  setActivePersona: (persona) => {
    set((state) => ({
      activePersona: persona
        ? {
            ...persona,
            expertise: [...persona.expertise],
          }
        : null,
      settings: {
        ...state.settings,
        activePersonaId: persona?.id ?? state.settings.activePersonaId,
      },
    }));
  },
  setHistory: (history) => {
    set({ history: [...history] });
  },
  addHistoryEntry: (entry) => {
    set((state) => ({
      history: [entry, ...state.history],
    }));
  },
  setRatings: (ratings) => {
    set({ ratings: cloneRatings(ratings) });
  },
  addRating: (rating) => {
    set((state) => ({
      ratings: [{ ...rating }, ...state.ratings],
    }));
  },
  setLastResult: (result) => {
    set({ lastResult: result });
  },
  setPopupVersion: (popupVersion) => {
    set({ popupVersion });
  },
  setPopupDraftInput: (popupDraftInput) => {
    set({ popupDraftInput });
  },
  setPopupImageAttachment: (popupImageAttachment) => {
    set({ popupImageAttachment });
  },
  setPopupStatusMessage: (popupStatusMessage) => {
    set({ popupStatusMessage });
  },
  setPopupPendingInteraction: (popupPendingInteraction) => {
    set({ popupPendingInteraction });
  },
  updatePopupQuestionAnswer: (answer) => {
    set((state) => {
      const interaction = state.popupPendingInteraction;

      if (!interaction || interaction.kind !== 'question') {
        return state;
      }

      return {
        popupPendingInteraction: {
          ...interaction,
          answer,
        },
      };
    });
  },
  updatePopupClarificationAnswer: (questionId, answer) => {
    set((state) => {
      const interaction = state.popupPendingInteraction;

      if (!interaction || interaction.kind !== 'clarificationSet') {
        return state;
      }

      return {
        popupPendingInteraction: {
          ...interaction,
          responses: interaction.responses.map((response) => {
            if (response.questionId !== questionId) {
              return response;
            }

            return {
              ...response,
              answer,
              usedDefault: answer.trim().length === 0,
            };
          }),
        },
      };
    });
  },
  setPopupActiveClarificationQuestion: (questionId) => {
    set((state) => {
      const interaction = state.popupPendingInteraction;

      if (!interaction || interaction.kind !== 'clarificationSet') {
        return state;
      }

      return {
        popupPendingInteraction: {
          ...interaction,
          activeQuestionId: questionId,
        },
      };
    });
  },
  setPopupCurrentPromptId: (popupCurrentPromptId) => {
    set({ popupCurrentPromptId });
  },
  setPopupCurrentHistoryEntryId: (popupCurrentHistoryEntryId) => {
    set({ popupCurrentHistoryEntryId });
  },
  setPopupLastSubmittedInput: (popupLastSubmittedInput) => {
    set({ popupLastSubmittedInput });
  },
  resetPopupRuntime: () => {
    set({
      popupDraftInput: '',
      popupImageAttachment: null,
      popupStatusMessage: '',
      popupPendingInteraction: null,
      popupCurrentPromptId: '',
      popupCurrentHistoryEntryId: '',
      popupLastSubmittedInput: null,
      pipelineStage: 'IDLE',
      pipelineStatus: 'IDLE',
    });
  },
  hydratePersistentState: async () => {
    const [storedSettings, storedPersonas, storedTemplates, storedPinnedTemplateIds, ratings, theme] =
      await Promise.all([
        loadAppSettings(),
        loadPersonas(),
        getAllTemplates(),
        loadPinnedTemplateIds(),
        loadPromptRatings(),
        loadThemePreference(),
      ]);

    const personas = storedPersonas.length > 0 ? storedPersonas : DEFAULT_PERSONAS;
    const templates = storedTemplates.length > 0 ? storedTemplates : TEMPLATE_LIBRARY;
    const settings = {
      ...storedSettings,
      theme,
    };

    set({
      settings,
      personas: clonePersonas(personas),
      templates: cloneTemplates(templates),
      pinnedTemplateIds: [...new Set(storedPinnedTemplateIds)],
      ratings: cloneRatings(ratings),
      activePersona: resolveActivePersona(personas, settings.activePersonaId),
      hydrated: true,
    });
  },
  saveSettingsToStorage: async (settings) => {
    await Promise.all([saveAppSettings(settings), saveThemePreference(settings.theme)]);
    get().applySettings(settings);
  },
  savePersonasToStorage: async (personas) => {
    await savePersonas(personas);
    get().setPersonas(personas);
  },
  saveTemplatesToStorage: async (templates) => {
    const previousTemplates = get().templates;
    await savePromptTemplates(templates);
    const changedTemplates = getChangedTemplates(previousTemplates, templates);

    await Promise.all(
      changedTemplates.map(async (template) => {
        await saveTemplateToRuntime(template);
      }),
    );

    get().setTemplates(templates);
  },
  savePinnedTemplateIdsToStorage: async (templateIds) => {
    const nextPinnedTemplateIds = [...new Set(templateIds)];
    await savePinnedTemplateIds(nextPinnedTemplateIds);
    get().setPinnedTemplateIds(nextPinnedTemplateIds);
  },
  togglePinnedTemplate: async (templateId) => {
    const { pinnedTemplateIds, savePinnedTemplateIdsToStorage } = get();
    const nextPinnedTemplateIds = pinnedTemplateIds.includes(templateId)
      ? pinnedTemplateIds.filter((pinnedTemplateId) => pinnedTemplateId !== templateId)
      : [templateId, ...pinnedTemplateIds];

    await savePinnedTemplateIdsToStorage(nextPinnedTemplateIds);
  },
  saveRatingToStorage: async (rating) => {
    await savePromptRating(rating);
    const nextRatings = [{ ...rating }, ...get().ratings];
    set({ ratings: cloneRatings(nextRatings) });
    return nextRatings;
  },
  resetState: () => {
    set(createInitialState());
  },
}));
