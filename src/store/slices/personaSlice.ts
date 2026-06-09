import type { StateCreator } from 'zustand';
import { savePersonas } from '../../utils/storage';
import { clonePersonas, createInitialState, resolveActivePersona } from '../helpers';
import type { PersonaSlice, PromptBridgeState } from '../types';
import type { PromptTemplate } from '../../types';

export function createPersonaSlice(
  defaultTemplates: PromptTemplate[],
): StateCreator<PromptBridgeState, [], [], PersonaSlice> {
  const initialState = createInitialState(defaultTemplates);

  return (set, get) => ({
    personas: initialState.personas,
    activePersona: initialState.activePersona,
    setPersonas: (personas) => {
      set((state) => {
        const nextPersonas = clonePersonas(personas);

        return {
          personas: nextPersonas,
          activePersona: resolveActivePersona(nextPersonas, state.settings.activePersonaId),
        };
      });
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
    savePersonasToStorage: async (personas) => {
      await savePersonas(personas);
      get().setPersonas(personas);
    },
  });
}
