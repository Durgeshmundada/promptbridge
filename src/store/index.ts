import { create } from 'zustand';
import { DEFAULT_PERSONAS } from '../config/defaults';
import { createPopupSlice } from '../popup/popupSlice';
import { getAllTemplates, TEMPLATE_LIBRARY } from '../pipeline/layer1/templateMatcher';
import { ModelTarget } from '../types';
import type { PromptBridgeState } from './types';
import { createInitialState } from './helpers';
import { createHistorySlice } from './slices/historySlice';
import { createPersonaSlice } from './slices/personaSlice';
import { createPipelineSlice } from './slices/pipelineSlice';
import { createSessionSlice } from './slices/sessionSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { createTemplateSlice } from './slices/templateSlice';

const DEFAULT_TEMPLATES = TEMPLATE_LIBRARY;

export const MODEL_TARGET_OPTIONS = Object.values(ModelTarget) as ModelTarget[];
export { DEFAULT_PERSONAS };
export type {
  CurrentSessionState,
  PopupImageAttachment,
  PopupPendingInteraction,
  PromptBridgeState,
} from './types';

export const usePromptBridgeStore = create<PromptBridgeState>((set, get, api) => ({
  ...createInitialState(DEFAULT_TEMPLATES),
  ...createSettingsSlice({
    defaultTemplates: DEFAULT_TEMPLATES,
    loadTemplates: getAllTemplates,
  })(set, get, api),
  ...createPersonaSlice(DEFAULT_TEMPLATES)(set, get, api),
  ...createTemplateSlice(DEFAULT_TEMPLATES)(set, get, api),
  ...createHistorySlice(DEFAULT_TEMPLATES)(set, get, api),
  ...createPipelineSlice(DEFAULT_TEMPLATES)(set, get, api),
  ...createSessionSlice(DEFAULT_TEMPLATES)(set, get, api),
  ...createPopupSlice()(set, get, api),
}));
