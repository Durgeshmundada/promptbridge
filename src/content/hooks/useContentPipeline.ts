import { useCallback, useEffect, useRef, useState } from 'react';
import PipelineExecutor, { type ApiKeyManager } from '../../pipeline/PipelineExecutor';
import { getAllTemplates } from '../../pipeline/layer1/templateMatcher';
import type {
  AppSettings,
  ClarificationQuestion,
  ClarificationResponse,
  PipelineInput,
  PipelineResult,
  SessionNode,
} from '../../types';
import { browser } from '../../lib/browser';
import { loadAppSettings, loadPersonas, saveAppSettings } from '../../utils/storage';
import { getComposerText, setComposerText, type ComposerElement } from '../utils/domUtils';

const CONTENT_SESSION_STORAGE_KEY = 'pb_content_session_nodes';

interface ClarificationState {
  questions: ClarificationQuestion[];
}

interface UseContentPipelineResult {
  statusMessage: string;
  isError: boolean;
  isEnhancing: boolean;
  enhancedModeEnabled: boolean;
  clarificationState: ClarificationState | null;
  setEnhancedModeEnabled: (enabled: boolean) => Promise<void>;
  optimizeComposer: (composer: ComposerElement | null) => Promise<void>;
  submitClarifications: (responses: ClarificationResponse[]) => void;
  useDefaultClarifications: () => void;
  closeClarifications: () => void;
}

function createApiKeyManager(): ApiKeyManager {
  return {
    ensureReady: async (): Promise<void> => undefined,
  };
}

function buildContentSessionId(): string {
  const pathname = window.location.pathname.replace(/[^a-zA-Z0-9/_-]/g, '-') || '/';
  return `content-${window.location.hostname}${pathname}`;
}

function cloneSessionNodes(sessionNodes: SessionNode[]): SessionNode[] {
  return sessionNodes.map((node) => ({
    ...node,
    keyEntities: [...node.keyEntities],
  }));
}

async function loadPersistedSessionNodes(sessionId: string): Promise<SessionNode[]> {
  if (!browser.storage?.local) {
    return [];
  }

  return await new Promise<SessionNode[]>((resolve) => {
    browser.storage.local.get(CONTENT_SESSION_STORAGE_KEY, (items) => {
      const sessionMap =
        (items[CONTENT_SESSION_STORAGE_KEY] as Record<string, SessionNode[]> | undefined) ?? {};
      const runtimeError = browser.runtime.lastError;

      if (runtimeError) {
        resolve([]);
        return;
      }

      resolve(cloneSessionNodes(sessionMap[sessionId] ?? []));
    });
  });
}

async function savePersistedSessionNodes(
  sessionId: string,
  sessionNodes: SessionNode[],
): Promise<void> {
  if (!browser.storage?.local) {
    return;
  }

  await new Promise<void>((resolve) => {
    browser.storage.local.get(CONTENT_SESSION_STORAGE_KEY, (items) => {
      const sessionMap =
        (items[CONTENT_SESSION_STORAGE_KEY] as Record<string, SessionNode[]> | undefined) ?? {};

      sessionMap[sessionId] = cloneSessionNodes(sessionNodes);
      browser.storage.local.set(
        {
          [CONTENT_SESSION_STORAGE_KEY]: sessionMap,
        },
        () => {
          resolve();
        },
      );
    });
  });
}

function formatEnhancerMatchStatus(result: PipelineResult): string {
  const roundedScore = Math.round(result.matchScore * 100).toString();

  switch (result.matchZone) {
    case 'DIRECT':
      return `${result.matchBadge} - ${roundedScore}%`;
    case 'PARTIAL':
      return result.isNewTemplate
        ? `${result.matchBadge} - Adapted from ${roundedScore}% match - Saved to your template library`
        : `${result.matchBadge} - Adapted from ${roundedScore}% match`;
    case 'GENERATE':
    default:
      return result.isNewTemplate
        ? `${result.matchBadge} - Nearest template ${roundedScore}% - Saved to your template library`
        : `${result.matchBadge} - Nearest template ${roundedScore}%`;
  }
}

async function createExecutor(settings: AppSettings): Promise<PipelineExecutor> {
  const [personas, templates] = await Promise.all([loadPersonas(), getAllTemplates()]);
  const executor = new PipelineExecutor(settings, createApiKeyManager());

  executor.setSettings(settings);
  executor.setPersonas(personas);
  executor.setTemplateLibrary(templates);

  return executor;
}

export function useContentPipeline(): UseContentPipelineResult {
  const [statusMessage, setStatusMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedModeEnabled, setEnhancedModeState] = useState(false);
  const [clarificationState, setClarificationState] = useState<ClarificationState | null>(null);
  const executorRef = useRef<PipelineExecutor | null>(null);

  useEffect(() => {
    void loadAppSettings()
      .then((settings) => {
        setEnhancedModeState(settings.enhancedModeEnabled);
      })
      .catch(() => undefined);
  }, []);

  const setEnhancedModeEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    const currentSettings = await loadAppSettings();
    const nextSettings = {
      ...currentSettings,
      enhancedModeEnabled: enabled,
    };

    await saveAppSettings(nextSettings);
    setEnhancedModeState(enabled);
    setIsError(false);
    setStatusMessage(
      enabled
        ? 'Enhanced Mode enabled. PromptBridge will ask targeted questions first.'
        : 'Enhanced Mode disabled. PromptBridge is back to one-click optimization.',
    );
  }, []);

  const optimizeComposer = useCallback(async (composer: ComposerElement | null): Promise<void> => {
    if (!composer) {
      setIsError(true);
      setStatusMessage('Focus the LLM prompt box first so PromptBridge knows where to write back.');
      return;
    }

    const composerText = getComposerText(composer);

    if (!composerText) {
      setIsError(true);
      setStatusMessage('Type something into the prompt box before enhancing it.');
      return;
    }

    setIsEnhancing(true);
    setIsError(false);
    setStatusMessage('Optimizing the current prompt inside this chat...');

    try {
      const settings = await loadAppSettings();
      const sessionId = buildContentSessionId();
      const executor = await createExecutor(settings);
      const persistedSessionNodes = await loadPersistedSessionNodes(sessionId);

      executorRef.current = executor;
      executor.replaceSessionNodes(sessionId, persistedSessionNodes);
      executor.on('clarificationSet', (questions) => {
        setClarificationState({ questions });
        setStatusMessage(
          'Enhanced Mode found missing context. Answer the questions or use defaults.',
        );
        setIsEnhancing(false);
      });

      const pipelineInput: PipelineInput = {
        rawInput: composerText,
        targetModel: settings.targetModel,
        personaId: settings.activePersonaId,
        sessionId,
      };
      const result = await executor.enhancePrompt(pipelineInput);

      await savePersistedSessionNodes(
        sessionId,
        executor.getSessionNodesForSession(sessionId),
      );
      setComposerText(composer, result.enrichedPrompt);
      setStatusMessage(formatEnhancerMatchStatus(result));
      setIsError(false);
    } catch (error) {
      setIsError(true);
      setStatusMessage(
        error instanceof Error ? error.message : 'PromptBridge could not enhance this prompt.',
      );
    } finally {
      setIsEnhancing(false);
    }
  }, []);

  const submitClarifications = useCallback((responses: ClarificationResponse[]): void => {
    executorRef.current?.resumeWithClarificationSet(responses);
    setClarificationState(null);
    setIsEnhancing(true);
    setStatusMessage('Applying your context to build a stronger prompt...');
  }, []);

  const useDefaultClarifications = useCallback((): void => {
    const questions = clarificationState?.questions ?? [];
    submitClarifications(
      questions.map((question) => ({
        questionId: question.id,
        answer: question.defaultAnswer,
        usedDefault: true,
      })),
    );
  }, [clarificationState?.questions, submitClarifications]);

  const closeClarifications = useCallback((): void => {
    setClarificationState(null);
    setStatusMessage('');
  }, []);

  return {
    statusMessage,
    isError,
    isEnhancing,
    enhancedModeEnabled,
    clarificationState,
    setEnhancedModeEnabled,
    optimizeComposer,
    submitClarifications,
    useDefaultClarifications,
    closeClarifications,
  };
}
