import { ModelTarget } from '../types';

export type OptionsTabId = 'templates' | 'personas' | 'history' | 'settings';

export interface OptionsTabDefinition {
  id: OptionsTabId;
  label: string;
  description: string;
}

export interface ApiKeyFieldDefinition {
  id: 'geminiApiKey';
  label: string;
  providerName: string;
  placeholder: string;
}

export const OPTIONS_ACTIVE_TAB_STORAGE_KEY = 'promptbridge.options.activeTab';
export const OPTIONS_DIRTY_STATE_EVENT = 'promptbridge:options-dirty-state';

export const OPTIONS_TABS: readonly OptionsTabDefinition[] = [
  {
    id: 'templates',
    label: 'Templates',
    description: 'Search, pin, and extend the prompt template library.',
  },
  {
    id: 'personas',
    label: 'Personas',
    description: 'Create and switch domain-aware collaborator profiles.',
  },
  {
    id: 'history',
    label: 'History',
    description: 'Inspect saved runs, search them, and export the timeline.',
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Manage secure keys, defaults, memory, and reset actions.',
  },
] as const;

export const SETTINGS_MODEL_OPTIONS: readonly ModelTarget[] = [
  ModelTarget.GROQ,
  ModelTarget.GPT4O,
  ModelTarget.CLAUDE,
  ModelTarget.GEMINI,
  ModelTarget.LLAMA,
  ModelTarget.OLLAMA,
  ModelTarget.CUSTOM,
] as const;

export const API_KEY_FIELDS: readonly ApiKeyFieldDefinition[] = [
  {
    id: 'geminiApiKey',
    label: 'Gemini API key',
    providerName: 'Gemini',
    placeholder: 'AIza...',
  },
] as const;

export function isOptionsTabId(value: string | null): value is OptionsTabId {
  return OPTIONS_TABS.some((tab) => tab.id === value);
}
