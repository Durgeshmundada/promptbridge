import { useEffect, useState } from 'react';
import { DEFAULT_APP_SETTINGS, loadHistory } from '../utils/storage';
import { RatingValue } from '../types';
import type {
  AppSettings,
  HistoryEntry,
  PipelineInput,
  PipelineResult,
  SessionNode,
} from '../types';
import PipelineExecutor from '../pipeline/PipelineExecutor';
import { prioritizePinnedTemplates } from '../pipeline/layer1/templateMatcher';
import { usePromptBridgeStore } from '../store';
import { promoteAbWinnerTemplate, selectAbTemplates } from './abTesting';
import type { AbTesterVariant } from './components/ABTester';
import Header from './components/Header';
import MainPanel from './components/MainPanel';
import {
  POPUP_MODEL_OPTIONS,
  POPUP_TEXT,
  getModelDisplayLabel,
} from './constants';
import {
  applyThemePreference,
  getNextManualTheme,
  type ResolvedTheme,
  subscribeToSystemTheme,
} from '../utils/theme';
import { type SavePipelineResultResponse, sendRuntimeMessage } from './runtime';

function createApiKeyManager() {
  return {
    ensureReady: async (): Promise<void> => undefined,
  };
}

function createPromptId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `prompt-${Date.now().toString()}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(POPUP_TEXT.inputArea.imageReadError));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error(POPUP_TEXT.inputArea.imageReadError));
    };

    reader.readAsDataURL(file);
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : POPUP_TEXT.statusBar.errorMessage;
}

interface AbComparisonVariantState extends AbTesterVariant {
  entry: HistoryEntry;
  result: PipelineResult;
  sessionNodes: SessionNode[];
  templateId: string;
}

/**
 * Creates an isolated executor for a single A/B template variant while preserving prior session context.
 */
function createVariantExecutor(
  settings: AppSettings,
  personas: ReturnType<typeof usePromptBridgeStore.getState>['personas'],
  templates: ReturnType<typeof usePromptBridgeStore.getState>['templates'],
  pinnedTemplateIds: string[],
  sessionId: string,
  baseSessionNodes: SessionNode[],
): PipelineExecutor {
  const variantExecutor = new PipelineExecutor(settings, createApiKeyManager());

  variantExecutor.setSettings(settings);
  variantExecutor.setPersonas(personas);
  variantExecutor.setTemplateLibrary(prioritizePinnedTemplates(templates, pinnedTemplateIds));
  variantExecutor.replaceSessionNodes(sessionId, baseSessionNodes);

  return variantExecutor;
}

export default function App(): JSX.Element {
  const {
    activePersona,
    addHistoryEntry,
    hydratePersistentState,
    personas,
    pinnedTemplateIds,
    saveSettingsToStorage,
    setHistory,
    setLastResult,
    setPipelineStage,
    setPipelineStatus,
    setPopupCurrentPromptId,
    setPopupCurrentHistoryEntryId,
    setPopupImageAttachment,
    setPopupLastSubmittedInput,
    setPopupPendingInteraction,
    setPopupStatusMessage,
    setPopupVersion,
    settings,
    templates,
  } = usePromptBridgeStore();
  const [executor] = useState(
    () => new PipelineExecutor(DEFAULT_APP_SETTINGS, createApiKeyManager()),
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [abComparisonVariants, setAbComparisonVariants] = useState<AbComparisonVariantState[]>([]);
  const [isWinnerSelectionPending, setIsWinnerSelectionPending] = useState(false);
  const [selectedWinnerHistoryEntryId, setSelectedWinnerHistoryEntryId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const unsubscribeStatus = executor.on('status', (status) => {
      setPipelineStatus(status);
    });
    const unsubscribeStage = executor.on('stage', (stage) => {
      setPipelineStage(stage);
    });
    const unsubscribeQuestion = executor.on('question', (question) => {
      setPopupPendingInteraction({
        kind: 'question',
        prompt: question,
        answer: '',
      });
      setPopupStatusMessage(question);
      setIsSubmitting(false);
    });
    const unsubscribeCommandConfirmation = executor.on('commandConfirmation', (prompt) => {
      setPopupPendingInteraction({
        kind: 'commandConfirmation',
        prompt,
      });
      setPopupStatusMessage(prompt);
      setIsSubmitting(false);
    });
    const unsubscribeScopeSelection = executor.on('scopeSelection', (options) => {
      setPopupPendingInteraction({
        kind: 'scopeSelection',
        options,
      });
      setPopupStatusMessage(POPUP_TEXT.interactions.scopeDescription);
      setIsSubmitting(false);
    });
    const unsubscribeComplete = executor.on('complete', () => {
      setPopupPendingInteraction(null);
      setPopupStatusMessage(POPUP_TEXT.statusBar.completeMessage);
      setIsSubmitting(false);
    });
    const unsubscribeError = executor.on('error', (error) => {
      setPopupPendingInteraction(null);
      setPopupStatusMessage(getErrorMessage(error));
      setIsSubmitting(false);
    });

    return () => {
      unsubscribeStatus();
      unsubscribeStage();
      unsubscribeQuestion();
      unsubscribeCommandConfirmation();
      unsubscribeScopeSelection();
      unsubscribeComplete();
      unsubscribeError();
    };
  }, [
    executor,
    setPipelineStage,
    setPipelineStatus,
    setPopupPendingInteraction,
    setPopupStatusMessage,
  ]);

  useEffect(() => {
    executor.setSettings(settings);
    executor.setPersonas(personas);
    executor.setTemplateLibrary(prioritizePinnedTemplates(templates, pinnedTemplateIds));
  }, [executor, personas, pinnedTemplateIds, settings, templates]);

  useEffect(() => {
    const hydratePopup = async (): Promise<void> => {
      await hydratePersistentState();
      const storedHistory = await loadHistory();
      setHistory(storedHistory.slice(0, 3));
      setPopupVersion(chrome.runtime.getManifest().version);
      setPopupStatusMessage(POPUP_TEXT.statusBar.idleMessage);
    };

    void hydratePopup();
  }, [hydratePersistentState, setHistory, setPopupStatusMessage, setPopupVersion]);

  useEffect(() => {
    setResolvedTheme(applyThemePreference(settings.theme));

    if (settings.theme !== 'system') {
      return () => undefined;
    }

    return subscribeToSystemTheme((nextTheme) => {
      setResolvedTheme(nextTheme);
      applyThemePreference(settings.theme);
    });
  }, [settings.theme]);

  const updateSettings = async (settingsPatch: Partial<AppSettings>): Promise<void> => {
    await saveSettingsToStorage({
      ...settings,
      ...settingsPatch,
    });
  };

  const activeTargetModel = POPUP_MODEL_OPTIONS.includes(
    settings.targetModel as (typeof POPUP_MODEL_OPTIONS)[number],
  )
    ? settings.targetModel
    : POPUP_MODEL_OPTIONS[0];

  const runPipeline = async (): Promise<void> => {
    const storeState = usePromptBridgeStore.getState();
    const normalizedInput = storeState.popupDraftInput.trim();
    const hasImageAttachment = Boolean(storeState.popupImageAttachment);

    if (!normalizedInput && !hasImageAttachment) {
      setPopupStatusMessage(POPUP_TEXT.inputArea.emptyPromptError);
      return;
    }

    const promptId = createPromptId();
    const pipelineInput: PipelineInput = {
      rawInput:
        normalizedInput || POPUP_TEXT.inputArea.imageOnlyFallbackPrompt,
      imageData: storeState.popupImageAttachment?.dataUrl,
      targetModel: activeTargetModel,
      personaId: activePersona?.id ?? settings.activePersonaId,
      sessionId: 'popup-session',
    };

    setIsSubmitting(true);
    setAbComparisonVariants([]);
    setSelectedWinnerHistoryEntryId(null);
    setPopupCurrentHistoryEntryId('');
    setLastResult(null);
    setPopupCurrentPromptId(promptId);
    setPopupLastSubmittedInput(pipelineInput);
    setPopupPendingInteraction(null);
    setPopupStatusMessage(
      `${POPUP_TEXT.statusBar.runningPrefix}: ${getModelDisplayLabel(activeTargetModel)}.`,
    );

    try {
      if (settings.abModeEnabled) {
        const templateSelection = selectAbTemplates(
          pipelineInput.rawInput,
          storeState.templates,
          storeState.pinnedTemplateIds,
        );

        if (templateSelection.templates.length >= 2) {
          const sessionNodes = executor.getSessionNodesForSession(pipelineInput.sessionId);
          const variantExecutors = templateSelection.templates.map((_template) =>
            createVariantExecutor(
              settings,
              personas,
              templates,
              pinnedTemplateIds,
              pipelineInput.sessionId,
              sessionNodes,
            ),
          );

          const variantResults = await Promise.all(
            templateSelection.templates.map(async (template, index) => {
              const result = await variantExecutors[index].executeWithTemplate(
                pipelineInput,
                template,
              );
              const saveResponse = await sendRuntimeMessage<SavePipelineResultResponse>({
                type: 'SAVE_PIPELINE_RESULT',
                payload: result,
              });

              return {
                entry: saveResponse.entry,
                executionTimeMs: result.executionTimeMs,
                historyEntryId: saveResponse.entry.id,
                label: index === 0 ? 'A' : 'B',
                processedResponse: result.processedResponse,
                result,
                sessionNodes: variantExecutors[index].getSessionNodesForSession(
                  pipelineInput.sessionId,
                ),
                templateId: template.id,
                weight: template.weight,
              } satisfies AbComparisonVariantState;
            }),
          );

          [...variantResults].reverse().forEach((variant) => {
            addHistoryEntry(variant.entry);
          });

          setAbComparisonVariants(variantResults);
          setPopupStatusMessage(POPUP_TEXT.abTester.completeMessage);
          setPipelineStatus('COMPLETE');
          setPipelineStage('COMPLETE');
          return;
        }

        setPopupStatusMessage(POPUP_TEXT.abTester.unavailable);
      }

      const result = await executor.execute(pipelineInput);
      setLastResult(result);

      const saveResponse = await sendRuntimeMessage<SavePipelineResultResponse>({
        type: 'SAVE_PIPELINE_RESULT',
        payload: result,
      });

      if (saveResponse.ok) {
        setPopupCurrentHistoryEntryId(saveResponse.entry.id);
        addHistoryEntry(saveResponse.entry);
      }
    } catch (error) {
      setPopupStatusMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChooseAbWinner = async (historyEntryId: string): Promise<void> => {
    const storeState = usePromptBridgeStore.getState();
    const winnerVariant = abComparisonVariants.find(
      (variant) => variant.historyEntryId === historyEntryId,
    );
    const loserVariant = abComparisonVariants.find(
      (variant) => variant.historyEntryId !== historyEntryId,
    );

    if (!winnerVariant || !loserVariant || !storeState.popupLastSubmittedInput) {
      return;
    }

    setIsWinnerSelectionPending(true);

    try {
      const timestamp = new Date().toISOString();
      const winnerRating = {
        promptId: storeState.popupCurrentPromptId,
        templateId: winnerVariant.templateId,
        intentId: winnerVariant.result.intent.intent,
        rating: RatingValue.THUMBS_UP,
        comment: 'A/B winner selected in popup comparison.',
        timestamp,
      };
      const loserRating = {
        promptId: storeState.popupCurrentPromptId,
        templateId: loserVariant.templateId,
        intentId: loserVariant.result.intent.intent,
        rating: RatingValue.THUMBS_DOWN,
        comment: 'A/B runner-up in popup comparison.',
        timestamp,
      };

      await storeState.saveRatingToStorage(winnerRating);
      const nextRatings = await storeState.saveRatingToStorage(loserRating);
      const promotionResult = promoteAbWinnerTemplate({
        rawInput: storeState.popupLastSubmittedInput.rawInput,
        winnerTemplateId: winnerVariant.templateId,
        loserTemplateId: loserVariant.templateId,
        ratings: nextRatings,
        templates: storeState.templates,
        pinnedTemplateIds: storeState.pinnedTemplateIds,
      });

      await storeState.saveTemplatesToStorage(promotionResult.templates);
      if (
        promotionResult.pinnedTemplateIds.join('|') !== storeState.pinnedTemplateIds.join('|')
      ) {
        await storeState.savePinnedTemplateIdsToStorage(promotionResult.pinnedTemplateIds);
      }
      await Promise.all([
        sendRuntimeMessage({
          type: 'UPDATE_HISTORY_RATING',
          payload: {
            entryId: winnerVariant.historyEntryId,
            rating: RatingValue.THUMBS_UP,
          },
        }),
        sendRuntimeMessage({
          type: 'UPDATE_HISTORY_RATING',
          payload: {
            entryId: loserVariant.historyEntryId,
            rating: RatingValue.THUMBS_DOWN,
          },
        }),
      ]);

      executor.replaceSessionNodes(
        storeState.popupLastSubmittedInput.sessionId,
        winnerVariant.sessionNodes,
      );
      setLastResult(winnerVariant.result);
      setPopupCurrentHistoryEntryId(winnerVariant.historyEntryId);
      setSelectedWinnerHistoryEntryId(historyEntryId);
      setPopupStatusMessage(POPUP_TEXT.abTester.winnerSelected);
    } catch (error) {
      setPopupStatusMessage(getErrorMessage(error));
    } finally {
      setIsWinnerSelectionPending(false);
    }
  };

  const handleAttachImage = async (file: File): Promise<void> => {
    try {
      const dataUrl = await readFileAsDataUrl(file);

      setPopupImageAttachment({
        name: file.name,
        dataUrl,
        mimeType: file.type,
      });
      setPopupStatusMessage(POPUP_TEXT.statusBar.idleMessage);
    } catch (error) {
      setPopupStatusMessage(getErrorMessage(error));
    }
  };

  return (
    <main
      aria-label={POPUP_TEXT.popup.shellAriaLabel}
      className="mx-auto flex h-[600px] w-[400px] max-h-[600px] flex-col gap-3 overflow-hidden px-3 py-3"
    >
      <Header
        onOpenOptions={() => {
          void chrome.runtime.openOptionsPage();
        }}
        onToggleTheme={() => {
          void updateSettings({
            theme: getNextManualTheme(settings.theme, resolvedTheme),
          });
        }}
        onUpdatePersona={(personaId) => {
          void updateSettings({
            activePersonaId: personaId,
          });
        }}
        onUpdateTargetModel={(targetModel) => {
          void updateSettings({
            targetModel,
          });
        }}
        resolvedTheme={resolvedTheme}
      />

      <MainPanel
        abComparisonVariants={abComparisonVariants}
        isSubmitting={isSubmitting}
        isWinnerSelectionPending={isWinnerSelectionPending}
        onAttachImage={(file) => {
          void handleAttachImage(file);
        }}
        onCancelCommandGate={() => {
          setPopupPendingInteraction(null);
          executor.resumeWithAnswer('no');
        }}
        onChooseAbWinner={(historyEntryId) => {
          void handleChooseAbWinner(historyEntryId);
        }}
        onConfirmCommandGate={() => {
          setPopupPendingInteraction(null);
          executor.resumeWithAnswer('yes');
        }}
        onOpenOptions={() => {
          void chrome.runtime.openOptionsPage();
        }}
        onRemoveImage={() => {
          setPopupImageAttachment(null);
        }}
        onScopeSelection={(option) => {
          setPopupPendingInteraction(null);
          executor.resumeWithAnswer(option);
        }}
        selectedWinnerHistoryEntryId={selectedWinnerHistoryEntryId}
        onSubmit={() => {
          void runPipeline();
        }}
        onSubmitMicroQuestion={() => {
          const interaction = usePromptBridgeStore.getState().popupPendingInteraction;

          if (!interaction || interaction.kind !== 'question') {
            return;
          }

          setPopupPendingInteraction(null);
          executor.resumeWithAnswer(interaction.answer);
        }}
        onToggleAbMode={(enabled) => {
          void updateSettings({
            abModeEnabled: enabled,
          });
        }}
      />
    </main>
  );
}
