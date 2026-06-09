import type { StateCreator } from 'zustand';
import type { PromptTemplate } from '../../types';
import { savePromptRating } from '../../utils/storage';
import { cloneRatings, createInitialState } from '../helpers';
import type { HistorySlice, PromptBridgeState } from '../types';

export function createHistorySlice(
  defaultTemplates: PromptTemplate[],
): StateCreator<PromptBridgeState, [], [], HistorySlice> {
  const initialState = createInitialState(defaultTemplates);

  return (set, get) => ({
    history: initialState.history,
    ratings: initialState.ratings,
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
    saveRatingToStorage: async (rating) => {
      await savePromptRating(rating);
      const nextRatings = [{ ...rating }, ...get().ratings];
      set({ ratings: cloneRatings(nextRatings) });
      return nextRatings;
    },
  });
}
