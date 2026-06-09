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

export interface SettingsSlice {
  settings: AppSettings;
  hydrated: boolean;
  setHydrated: (hydrated: boolean) => void;
  applySettings: (settings: AppSettings) => void;
  updateSettings: (settingsPatch: Partial<AppSettings>) => void;
  hydratePersistentState: () => Promise<void>;
  saveSettingsToStorage: (settings: AppSettings) => Promise<void>;
  resetState: () => void;
}

export interface PersonaSlice {
  personas: Persona[];
  activePersona: Persona | null;
  setPersonas: (personas: Persona[]) => void;
  setActivePersona: (persona: Persona | null) => void;
  savePersonasToStorage: (personas: Persona[]) => Promise<void>;
}

export interface TemplateSlice {
  templates: PromptTemplate[];
  pinnedTemplateIds: string[];
  setTemplates: (templates: PromptTemplate[]) => void;
  setPinnedTemplateIds: (templateIds: string[]) => void;
  saveTemplatesToStorage: (templates: PromptTemplate[]) => Promise<void>;
  savePinnedTemplateIdsToStorage: (templateIds: string[]) => Promise<void>;
  togglePinnedTemplate: (templateId: string) => Promise<void>;
}

export interface HistorySlice {
  history: HistoryEntry[];
  ratings: PromptRating[];
  setHistory: (history: HistoryEntry[]) => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  setRatings: (ratings: PromptRating[]) => void;
  addRating: (rating: PromptRating) => void;
  saveRatingToStorage: (rating: PromptRating) => Promise<PromptRating[]>;
}

export interface PipelineSlice {
  pipelineStatus: PipelineStatus;
  pipelineStage: PipelineStageId;
  lastResult: PipelineResult | null;
  setPipelineStatus: (status: PipelineStatus) => void;
  setPipelineStage: (stage: PipelineStageId) => void;
  setLastResult: (result: PipelineResult | null) => void;
}

export interface SessionSlice {
  currentSession: CurrentSessionState | null;
  setCurrentSession: (session: CurrentSessionState | null) => void;
}

export interface PopupSlice {
  popupVersion: string;
  popupDraftInput: string;
  popupImageAttachment: PopupImageAttachment | null;
  popupStatusMessage: string;
  popupPendingInteraction: PopupPendingInteraction | null;
  popupCurrentPromptId: string;
  popupCurrentHistoryEntryId: string;
  popupLastSubmittedInput: PipelineInput | null;
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
}

export type PromptBridgeState = SettingsSlice &
  PersonaSlice &
  TemplateSlice &
  HistorySlice &
  PipelineSlice &
  SessionSlice &
  PopupSlice;
