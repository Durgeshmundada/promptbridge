import type { StateCreator } from 'zustand';
import type { PromptTemplate } from '../../types';
import { createInitialState } from '../helpers';
import type { PipelineSlice, PromptBridgeState } from '../types';

export function createPipelineSlice(
  defaultTemplates: PromptTemplate[],
): StateCreator<PromptBridgeState, [], [], PipelineSlice> {
  const initialState = createInitialState(defaultTemplates);

  return (set) => ({
    pipelineStatus: initialState.pipelineStatus,
    pipelineStage: initialState.pipelineStage,
    lastResult: initialState.lastResult,
    setPipelineStatus: (pipelineStatus) => {
      set({ pipelineStatus });
    },
    setPipelineStage: (pipelineStage) => {
      set({ pipelineStage });
    },
    setLastResult: (lastResult) => {
      set({ lastResult });
    },
  });
}
