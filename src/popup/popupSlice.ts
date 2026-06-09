import type { StateCreator } from 'zustand';
import type { PromptBridgeState, PopupSlice } from '../store/types';

export function createPopupSlice(): StateCreator<PromptBridgeState, [], [], PopupSlice> {
  return (set) => ({
    popupVersion: '',
    popupDraftInput: '',
    popupImageAttachment: null,
    popupStatusMessage: '',
    popupPendingInteraction: null,
    popupCurrentPromptId: '',
    popupCurrentHistoryEntryId: '',
    popupLastSubmittedInput: null,
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
  });
}
