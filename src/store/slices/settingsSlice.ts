import type { StateCreator } from 'zustand';
import { DEFAULT_PERSONAS } from '../../config/defaults';
import type { PromptTemplate } from '../../types';
import {
  loadAppSettings,
  loadPersonas,
  loadPinnedTemplateIds,
  loadPromptRatings,
  loadThemePreference,
  saveAppSettings,
  saveThemePreference,
} from '../../utils/storage';
import {
  clonePersonas,
  cloneRatings,
  cloneTemplates,
  createInitialState,
  resolveActivePersona,
} from '../helpers';
import type { PromptBridgeState, SettingsSlice } from '../types';

export interface SettingsSliceOptions {
  defaultTemplates: PromptTemplate[];
  loadTemplates: () => Promise<PromptTemplate[]>;
}

export function createSettingsSlice(
  options: SettingsSliceOptions,
): StateCreator<PromptBridgeState, [], [], SettingsSlice> {
  return (set, get) => ({
    settings: createInitialState(options.defaultTemplates).settings,
    hydrated: false,
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
    hydratePersistentState: async () => {
      const [
        storedSettings,
        storedPersonas,
        storedTemplates,
        storedPinnedTemplateIds,
        ratings,
        theme,
      ] = await Promise.all([
        loadAppSettings(),
        loadPersonas(),
        options.loadTemplates(),
        loadPinnedTemplateIds(),
        loadPromptRatings(),
        loadThemePreference(),
      ]);

      const personas = storedPersonas.length > 0 ? storedPersonas : DEFAULT_PERSONAS;
      const templates =
        storedTemplates.length > 0 ? storedTemplates : options.defaultTemplates;
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
    resetState: () => {
      set(createInitialState(options.defaultTemplates));
    },
  });
}
