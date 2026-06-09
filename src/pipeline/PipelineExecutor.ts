import type {
  AppSettings,
  ClarificationResponse,
  Persona,
  PipelineInput,
  PipelineResult,
  PipelineStageId,
  PipelineStatus,
  PromptTemplate,
  SessionNode,
} from '../types';
import PipelineOrchestrator, {
  type ApiKeyManager,
  type EventListener,
  type PipelineExecutorEvents,
  PipelineExecutorError,
  PipelineExecutorErrorCode,
} from './PipelineOrchestrator';

export type { ApiKeyManager, PipelineExecutorEvents };
export { PipelineExecutorError, PipelineExecutorErrorCode };

/**
 * Backward-compatible executor facade that delegates all pipeline work to PipelineOrchestrator.
 */
class PipelineExecutor {
  private orchestrator: PipelineOrchestrator;

  /**
   * Creates a pipeline executor configured with app settings and an API-key readiness manager.
   */
  constructor(settings: AppSettings, apiKeyManager: ApiKeyManager) {
    this.orchestrator = new PipelineOrchestrator(settings, apiKeyManager);
  }

  /**
   * Registers an event listener and returns an unsubscribe function.
   */
  on<K extends keyof PipelineExecutorEvents>(
    eventName: K,
    listener: EventListener<PipelineExecutorEvents[K]>,
  ): () => void {
    return this.orchestrator.on(eventName, listener);
  }

  /**
   * Removes a previously registered event listener.
   */
  off<K extends keyof PipelineExecutorEvents>(
    eventName: K,
    listener: EventListener<PipelineExecutorEvents[K]>,
  ): void {
    this.orchestrator.off(eventName, listener);
  }

  /**
   * Registers a one-time event listener.
   */
  once<K extends keyof PipelineExecutorEvents>(
    eventName: K,
    listener: EventListener<PipelineExecutorEvents[K]>,
  ): () => void {
    return this.orchestrator.once(eventName, listener);
  }

  /**
   * Returns the executor's current lifecycle status.
   */
  getStatus(): PipelineStatus {
    return this.orchestrator.getStatus();
  }

  /**
   * Returns the executor's current non-localized pipeline stage identifier.
   */
  getStage(): PipelineStageId {
    return this.orchestrator.getStage();
  }

  /**
   * Updates executor settings used by future pipeline runs.
   */
  setSettings(settings: AppSettings): void {
    this.orchestrator.setSettings(settings);
  }

  /**
   * Updates the persona library used for future executions.
   */
  setPersonas(personas: Persona[]): void {
    this.orchestrator.setPersonas(personas);
  }

  /**
   * Updates the template library used for future executions.
   */
  setTemplateLibrary(templates: PromptTemplate[]): void {
    this.orchestrator.setTemplateLibrary(templates);
  }

  /**
   * Returns a defensive copy of the stored session nodes for a session identifier.
   */
  getSessionNodesForSession(sessionId: string): SessionNode[] {
    return this.orchestrator.getSessionNodesForSession(sessionId);
  }

  /**
   * Replaces the stored session nodes for a session identifier with a defensive copy.
   */
  replaceSessionNodes(sessionId: string, sessionNodes: SessionNode[]): void {
    this.orchestrator.replaceSessionNodes(sessionId, sessionNodes);
  }

  /**
   * Accepts user-provided input for the currently paused pipeline step.
   */
  resumeWithAnswer(answer: string): void {
    this.orchestrator.resumeWithAnswer(answer);
  }

  /**
   * Accepts a set of clarification answers for the Enhanced Mode question flow.
   */
  resumeWithClarificationSet(responses: ClarificationResponse[]): void {
    this.orchestrator.resumeWithClarificationSet(responses);
  }

  /**
   * Runs the full PromptBridge execution flow and returns the final enriched result.
   */
  execute(input: PipelineInput): Promise<PipelineResult> {
    return this.orchestrator.execute(input);
  }

  /**
   * Runs the enrichment pipeline without executing the final downstream model call.
   */
  enhancePrompt(input: PipelineInput): Promise<PipelineResult> {
    return this.orchestrator.enhancePrompt(input);
  }

  /**
   * Runs the full pipeline while forcing a specific template variant.
   */
  executeWithTemplate(
    input: PipelineInput,
    templateOverride: PromptTemplate,
  ): Promise<PipelineResult> {
    return this.orchestrator.executeWithTemplate(input, templateOverride);
  }

  /**
   * Emits a clarification question and waits for the popup or caller to resume the pipeline with an answer.
   */
  pauseForQuestion(question: string): Promise<string> {
    return this.orchestrator.pauseForQuestion(question);
  }

  /**
   * Emits a three-question clarification set and waits for the caller to answer it.
   */
  pauseForClarificationSet(
    questions: Parameters<PipelineOrchestrator['pauseForClarificationSet']>[0],
  ): Promise<ClarificationResponse[]> {
    return this.orchestrator.pauseForClarificationSet(questions);
  }

  /**
   * Emits a command-preview confirmation request and waits for the caller to approve or reject it.
   */
  pauseForCommandConfirmation(preview: string): Promise<boolean> {
    return this.orchestrator.pauseForCommandConfirmation(preview);
  }

  /**
   * Emits scope options for potentially broad operations and waits for the caller to choose one.
   */
  pauseForScopeSelection(options: string[]): Promise<string> {
    return this.orchestrator.pauseForScopeSelection(options);
  }
}

export default PipelineExecutor;
