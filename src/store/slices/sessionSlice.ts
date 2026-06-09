import type { StateCreator } from 'zustand';
import type { PromptTemplate } from '../../types';
import { chromeSessionStorage } from '../../utils/storage';
import { cloneSessionNodes, createInitialState } from '../helpers';
import type { CurrentSessionState, PromptBridgeState, SessionSlice } from '../types';

const SESSION_STORAGE_PREFIX = 'sessionNodes_';

function persistSessionNodes(session: CurrentSessionState | null): void {
  if (!session) {
    return;
  }

  void chromeSessionStorage
    .setItem(`${SESSION_STORAGE_PREFIX}${session.id}`, JSON.stringify(session.nodes))
    .catch(() => undefined);
}

export function createSessionSlice(
  defaultTemplates: PromptTemplate[],
): StateCreator<PromptBridgeState, [], [], SessionSlice> {
  const initialState = createInitialState(defaultTemplates);

  return (set) => ({
    currentSession: initialState.currentSession,
    setCurrentSession: (currentSession) => {
      const nextSession = currentSession
        ? {
            ...currentSession,
            nodes: cloneSessionNodes(currentSession.nodes),
          }
        : null;

      persistSessionNodes(nextSession);
      set({ currentSession: nextSession });
    },
  });
}
