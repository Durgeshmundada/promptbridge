import PipelineExecutor, { type ApiKeyManager } from '../pipeline/PipelineExecutor';
import { getAllTemplates } from '../pipeline/layer1/templateMatcher';
import type {
  AppSettings,
  Persona,
  PipelineInput,
  PipelineResult,
  PromptTemplate,
  SessionNode,
} from '../types';
import { loadAppSettings, loadPersonas } from '../utils/storage';

interface PageContext {
  title: string;
  url: string;
  selection: string;
  summary: string;
}

interface CollectPageContextMessage {
  type: 'COLLECT_PAGE_CONTEXT';
}

type ComposerElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

interface EnhancerUi {
  shell: HTMLDivElement;
  button: HTMLButtonElement;
  status: HTMLParagraphElement;
  mountedContainer: HTMLElement | null;
}

interface PromptBridgeEnhancerRuntime {
  executor: PipelineExecutor;
  loadSettings: () => Promise<AppSettings>;
  loadPersonas: () => Promise<Persona[]>;
  loadTemplates: () => Promise<PromptTemplate[]>;
}

const SUPPORTED_LLM_HOSTS = [
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'gemini.google.com',
  'aistudio.google.com',
  'perplexity.ai',
] as const;
const GENERIC_COMPOSER_SELECTORS = [
  '#prompt-textarea',
  'textarea',
  '[role="textbox"][contenteditable="true"]',
  '[contenteditable="true"]',
] as const;
const CONTENT_SESSION_STORAGE_KEY = 'pb_content_session_nodes';
const OPTIMIZE_BUTTON_LABEL = 'Optimize with PromptBridge';
const OPTIMIZING_BUTTON_LABEL = 'Optimizing...';
const BUTTON_IDLE_STATUS = '';
const SAFE_AREA_PADDING_DATA_KEY = 'promptbridgeOriginalPaddingBottom';
const SAFE_AREA_MIN_HEIGHT_DATA_KEY = 'promptbridgeOriginalMinHeight';

let enhancerUi: EnhancerUi | null = null;
let activeComposer: ComposerElement | null = null;
let isEnhancing = false;
let runtimePromise: Promise<PromptBridgeEnhancerRuntime> | null = null;
let safeAreaComposer: ComposerElement | null = null;

function getSelectionText(): string {
  return window.getSelection()?.toString().trim() ?? '';
}

function getMetaDescription(): string {
  const descriptionTag = document.querySelector('meta[name="description"]');
  return descriptionTag?.getAttribute('content')?.trim() ?? '';
}

function getVisibleText(limit: number): string {
  const visibleText = document.body?.innerText?.replace(/\s+/g, ' ').trim() ?? '';
  return visibleText.slice(0, limit);
}

function collectPageContext(): PageContext {
  const selection = getSelectionText();
  const summarySegments = [selection, getMetaDescription(), getVisibleText(800)].filter(Boolean);

  return {
    title: document.title,
    url: window.location.href,
    selection,
    summary: summarySegments.join(' | ').slice(0, 1200),
  };
}

function notifyContentReady(): void {
  chrome.runtime.sendMessage(
    {
      type: 'CONTENT_READY',
      payload: {
        title: document.title,
        url: window.location.href,
      },
    },
    () => {
      void chrome.runtime.lastError;
    },
  );
}

function isSupportedLlmHost(hostname: string): boolean {
  return SUPPORTED_LLM_HOSTS.some(
    (supportedHost) =>
      hostname === supportedHost || hostname.endsWith(`.${supportedHost}`),
  );
}

function isTextControlElement(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function isEditableCandidate(element: Element | null): element is ComposerElement {
  if (!element) {
    return false;
  }

  if (isTextControlElement(element)) {
    if (element.disabled || element.readOnly) {
      return false;
    }

    return true;
  }

  return element instanceof HTMLElement && element.isContentEditable;
}

function isVisibleComposer(element: ComposerElement): boolean {
  const rect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);

  return (
    rect.width >= 80 &&
    rect.height >= 16 &&
    computedStyle.display !== 'none' &&
    computedStyle.visibility !== 'hidden'
  );
}

function findComposerFromElement(element: Element | null): ComposerElement | null {
  let currentElement: Element | null = element;

  while (currentElement) {
    if (isEditableCandidate(currentElement) && isVisibleComposer(currentElement)) {
      return currentElement;
    }

    currentElement = currentElement.parentElement;
  }

  return null;
}

function findBestComposer(): ComposerElement | null {
  const focusedComposer = findComposerFromElement(document.activeElement);

  if (focusedComposer) {
    return focusedComposer;
  }

  for (const selector of GENERIC_COMPOSER_SELECTORS) {
    const matchingElements = [...document.querySelectorAll(selector)];
    const visibleComposer = matchingElements.find(
      (element): element is ComposerElement =>
        isEditableCandidate(element) && isVisibleComposer(element),
    );

    if (visibleComposer) {
      return visibleComposer;
    }
  }

  return null;
}

function getComposerText(element: ComposerElement): string {
  if (isTextControlElement(element)) {
    return element.value.trim();
  }

  return element.innerText.trim();
}

function dispatchComposerEvents(element: ComposerElement): void {
  element.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: getComposerText(element),
    }),
  );
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function moveCaretToEnd(element: HTMLElement): void {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function buildContentEditableFragment(value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const lines = value.split('\n');

  lines.forEach((line, index) => {
    fragment.append(document.createTextNode(line));

    if (index < lines.length - 1) {
      fragment.append(document.createElement('br'));
    }
  });

  return fragment;
}

function setComposerText(element: ComposerElement, value: string): void {
  if (isTextControlElement(element)) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    setter?.call(element, value);
    if (element.value !== value) {
      element.value = value;
    }
    element.focus();
    element.setSelectionRange(value.length, value.length);
    dispatchComposerEvents(element);
    return;
  }

  element.focus();
  element.replaceChildren(buildContentEditableFragment(value));
  moveCaretToEnd(element);
  dispatchComposerEvents(element);
}

function createEnhancerUi(): EnhancerUi {
  const shell = document.createElement('div');
  const button = document.createElement('button');
  const status = document.createElement('p');

  shell.setAttribute('data-promptbridge-enhancer', 'true');
  shell.style.position = 'absolute';
  shell.style.zIndex = '30';
  shell.style.display = 'none';
  shell.style.flexDirection = 'column';
  shell.style.alignItems = 'flex-start';
  shell.style.gap = '6px';
  shell.style.fontFamily = 'Segoe UI, Arial, sans-serif';

  button.type = 'button';
  button.textContent = OPTIMIZE_BUTTON_LABEL;
  button.style.border = 'none';
  button.style.borderRadius = '999px';
  button.style.background = 'linear-gradient(135deg, #7c3aed 0%, #9333ea 55%, #2563eb 100%)';
  button.style.color = '#ffffff';
  button.style.cursor = 'pointer';
  button.style.fontSize = '13px';
  button.style.fontWeight = '700';
  button.style.padding = '8px 14px';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.lineHeight = '1';
  button.style.boxShadow = '0 8px 18px rgba(124, 58, 237, 0.3)';
  button.style.whiteSpace = 'nowrap';

  status.textContent = BUTTON_IDLE_STATUS;
  status.style.display = 'none';
  status.style.margin = '0';
  status.style.fontSize = '12px';
  status.style.lineHeight = '1.5';
  status.style.color = '#e2e8f0';
  status.style.background = 'rgba(15, 23, 42, 0.78)';
  status.style.padding = '6px 10px';
  status.style.borderRadius = '10px';
  status.style.maxWidth = '320px';

  shell.append(button, status);

  return { shell, button, status, mountedContainer: null };
}

function getEnhancerUi(): EnhancerUi {
  if (!enhancerUi) {
    enhancerUi = createEnhancerUi();
  }

  return enhancerUi;
}

function hideEnhancerUi(): void {
  if (!enhancerUi) {
    return;
  }

  enhancerUi.shell.style.display = 'none';

  if (safeAreaComposer) {
    restoreComposerSafeArea(safeAreaComposer);
    safeAreaComposer = null;
  }
}

function setEnhancerStatus(message: string, isError = false): void {
  const ui = getEnhancerUi();
  ui.status.textContent = message;
  ui.status.style.display = message ? 'block' : 'none';
  ui.status.style.color = isError ? '#fecaca' : '#e2e8f0';
  ui.status.style.background = isError ? 'rgba(127, 29, 29, 0.9)' : 'rgba(15, 23, 42, 0.78)';
}

function isVisibleHtmlElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);

  return (
    rect.width >= 20 &&
    rect.height >= 20 &&
    computedStyle.display !== 'none' &&
    computedStyle.visibility !== 'hidden'
  );
}

function findEnhancerContainer(composer: ComposerElement): HTMLElement {
  const composerRect = composer.getBoundingClientRect();
  const formContainer = composer.closest('form');

  if (formContainer instanceof HTMLElement) {
    const formRect = formContainer.getBoundingClientRect();

    if (
      formRect.width >= composerRect.width * 0.6 &&
      formRect.height >= composerRect.height + 20 &&
      formRect.height <= 240
    ) {
      return formContainer;
    }
  }

  let currentElement = composer.parentElement;
  let bestCandidate: HTMLElement | null = null;

  while (currentElement) {
    const rect = currentElement.getBoundingClientRect();

    if (
      rect.width >= composerRect.width &&
      rect.height >= composerRect.height + 20 &&
      rect.height <= 240
    ) {
      bestCandidate = currentElement;
    }

    currentElement = currentElement.parentElement;
  }

  return bestCandidate ?? composer.parentElement ?? composer;
}

function mountEnhancer(composer: ComposerElement): HTMLElement {
  const ui = getEnhancerUi();
  const container = findEnhancerContainer(composer);

  if (ui.mountedContainer !== container) {
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    container.append(ui.shell);
    ui.mountedContainer = container;
  }

  return container;
}

function findToolbarAnchorButton(
  composer: ComposerElement,
  container: HTMLElement,
  ui: EnhancerUi,
): HTMLButtonElement | null {
  const formContainer = composer.closest('form');
  const searchRoot = formContainer instanceof HTMLElement ? formContainer : container;
  const composerRect = composer.getBoundingClientRect();
  const visibleButtons = [...searchRoot.querySelectorAll('button')]
    .filter(
      (button): button is HTMLButtonElement =>
        button instanceof HTMLButtonElement &&
        button !== ui.button &&
        !ui.shell.contains(button) &&
        isVisibleHtmlElement(button),
    )
    .map((button) => ({
      button,
      rect: button.getBoundingClientRect(),
    }));

  if (visibleButtons.length === 0) {
    return null;
  }

  const semanticAnchor = visibleButtons
    .map(({ button, rect }) => ({
      button,
      rect,
      descriptor: [
        button.getAttribute('aria-label') ?? '',
        button.getAttribute('title') ?? '',
        button.textContent ?? '',
      ]
        .join(' ')
        .toLowerCase(),
    }))
    .filter(
      ({ descriptor, rect }) =>
        (descriptor.includes('add') ||
          descriptor.includes('file') ||
          descriptor.includes('attach') ||
          descriptor.includes('upload')) &&
        rect.left <= composerRect.left + 72 &&
        rect.bottom >= composerRect.bottom - 96,
    )
    .sort((left, right) => left.rect.left - right.rect.left)[0];

  if (semanticAnchor) {
    return semanticAnchor.button;
  }

  const leftToolbarButtons = visibleButtons.filter(
    ({ rect }) =>
      rect.left <= composerRect.left + 56 &&
      rect.bottom >= composerRect.bottom - 96 &&
      rect.top <= composerRect.bottom + 20,
  );
  const rankedButtons = (leftToolbarButtons.length > 0 ? leftToolbarButtons : visibleButtons).sort(
    (left, right) => {
      const leftVerticalDistance = Math.abs(left.rect.bottom - composerRect.bottom);
      const rightVerticalDistance = Math.abs(right.rect.bottom - composerRect.bottom);

      if (Math.abs(leftVerticalDistance - rightVerticalDistance) > 4) {
        return leftVerticalDistance - rightVerticalDistance;
      }

      return left.rect.left - right.rect.left;
    },
  );

  return rankedButtons[0]?.button ?? null;
}

function syncEnhancerButtonToAnchor(
  ui: EnhancerUi,
  anchorButton: HTMLButtonElement | null,
): void {
  if (!anchorButton) {
    ui.button.style.height = '36px';
    ui.button.style.minHeight = '36px';
    ui.button.style.padding = '0 14px';
    ui.button.style.fontSize = '13px';
    ui.button.style.borderRadius = '999px';
    return;
  }

  const anchorRect = anchorButton.getBoundingClientRect();
  const anchorStyles = window.getComputedStyle(anchorButton);
  const targetHeight = Math.round(Math.max(34, Math.min(44, anchorRect.height)));
  const targetFontSize = parseFloat(anchorStyles.fontSize);

  ui.button.style.height = `${targetHeight}px`;
  ui.button.style.minHeight = `${targetHeight}px`;
  ui.button.style.padding = `0 ${Math.max(12, Math.round(targetHeight * 0.42))}px`;
  ui.button.style.fontSize = `${Number.isFinite(targetFontSize) ? Math.max(12, Math.min(14, targetFontSize)) : 13}px`;
  ui.button.style.borderRadius =
    anchorStyles.borderRadius && anchorStyles.borderRadius !== '0px'
      ? anchorStyles.borderRadius
      : '999px';
}

function restoreComposerSafeArea(composer: ComposerElement): void {
  composer.style.paddingBottom = composer.dataset[SAFE_AREA_PADDING_DATA_KEY] ?? '';
  composer.style.minHeight = composer.dataset[SAFE_AREA_MIN_HEIGHT_DATA_KEY] ?? '';
  delete composer.dataset[SAFE_AREA_PADDING_DATA_KEY];
  delete composer.dataset[SAFE_AREA_MIN_HEIGHT_DATA_KEY];
}

function applyComposerSafeArea(composer: ComposerElement, buttonHeight: number): void {
  if (safeAreaComposer && safeAreaComposer !== composer) {
    restoreComposerSafeArea(safeAreaComposer);
  }

  if (composer.dataset[SAFE_AREA_PADDING_DATA_KEY] === undefined) {
    composer.dataset[SAFE_AREA_PADDING_DATA_KEY] = composer.style.paddingBottom;
  }

  if (composer.dataset[SAFE_AREA_MIN_HEIGHT_DATA_KEY] === undefined) {
    composer.dataset[SAFE_AREA_MIN_HEIGHT_DATA_KEY] = composer.style.minHeight;
  }

  const computedStyle = window.getComputedStyle(composer);
  const currentPaddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
  const currentMinHeight = parseFloat(computedStyle.minHeight) || 0;
  const desiredPaddingBottom = Math.max(currentPaddingBottom, buttonHeight + 14);
  const desiredMinHeight = Math.max(composer.getBoundingClientRect().height, buttonHeight + 44);

  composer.style.paddingBottom = `${Math.round(desiredPaddingBottom)}px`;
  composer.style.minHeight = `${Math.round(Math.max(currentMinHeight, desiredMinHeight))}px`;
  safeAreaComposer = composer;
}

function positionEnhancer(composer: ComposerElement | null): void {
  if (!composer || !composer.isConnected || !isVisibleComposer(composer)) {
    hideEnhancerUi();
    return;
  }

  const ui = getEnhancerUi();
  const container = mountEnhancer(composer);
  ui.shell.style.display = 'flex';
  const anchorButton = findToolbarAnchorButton(composer, container, ui);

  syncEnhancerButtonToAnchor(ui, anchorButton);

  const composerRect = composer.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const shellWidth = ui.shell.offsetWidth || 260;
  const buttonHeight = ui.button.offsetHeight || 34;

  applyComposerSafeArea(composer, buttonHeight);

  const fallbackLeft = Math.min(
    Math.max(16, composerRect.left - containerRect.left + 8),
    Math.max(16, containerRect.width - shellWidth - 16),
  );
  const fallbackTop = Math.max(
    8,
    Math.min(
      composerRect.bottom - containerRect.top + 8,
      containerRect.height - buttonHeight - 8,
    ),
  );
  const anchorRect = anchorButton?.getBoundingClientRect();
  const buttonLeft = anchorRect
    ? Math.min(
        anchorRect.right - containerRect.left + 8,
        Math.max(16, containerRect.width - shellWidth - 16),
      )
    : fallbackLeft;
  const buttonTop = anchorRect
    ? Math.max(8, containerRect.height - buttonHeight - 10)
    : fallbackTop;

  ui.shell.style.left = `${Math.round(buttonLeft)}px`;
  ui.shell.style.top = `${Math.round(buttonTop)}px`;
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
  if (!chrome.storage?.local) {
    return [];
  }

  return await new Promise<SessionNode[]>((resolve) => {
    chrome.storage.local.get(CONTENT_SESSION_STORAGE_KEY, (items) => {
      const sessionMap =
        (items[CONTENT_SESSION_STORAGE_KEY] as Record<string, SessionNode[]> | undefined) ?? {};
      const runtimeError = chrome.runtime.lastError;

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
  if (!chrome.storage?.local) {
    return;
  }

  await new Promise<void>((resolve) => {
    chrome.storage.local.get(CONTENT_SESSION_STORAGE_KEY, (items) => {
      const sessionMap =
        (items[CONTENT_SESSION_STORAGE_KEY] as Record<string, SessionNode[]> | undefined) ?? {};

      sessionMap[sessionId] = cloneSessionNodes(sessionNodes);
      chrome.storage.local.set(
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

async function loadEnhancerRuntime(): Promise<PromptBridgeEnhancerRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const settings = await loadAppSettings();
      const personas = await loadPersonas();
      const templates = await getAllTemplates();
      const executor = new PipelineExecutor(settings, createApiKeyManager());

      executor.setSettings(settings);
      executor.setPersonas(personas);
      executor.setTemplateLibrary(templates);
      executor.on('question', () => {
        executor.resumeWithAnswer('');
      });
      executor.on('commandConfirmation', () => {
        executor.resumeWithAnswer('yes');
      });
      executor.on('scopeSelection', (options) => {
        const fallbackOption = options[0] ?? '';
        executor.resumeWithAnswer(fallbackOption);
      });

      return {
        executor,
        loadSettings: loadAppSettings,
        loadPersonas,
        loadTemplates: getAllTemplates,
      };
    })();
  }

  return runtimePromise;
}

async function enhanceComposerPrompt(composer: ComposerElement): Promise<PipelineResult> {
  const runtime = await loadEnhancerRuntime();
  const sessionId = buildContentSessionId();
  const [settings, personas, templates] = await Promise.all([
    runtime.loadSettings(),
    runtime.loadPersonas(),
    runtime.loadTemplates(),
  ]);
  const persistedSessionNodes = await loadPersistedSessionNodes(sessionId);
  const pipelineInput: PipelineInput = {
    rawInput: getComposerText(composer),
    targetModel: settings.targetModel,
    personaId: settings.activePersonaId,
    sessionId,
  };

  runtime.executor.setSettings(settings);
  runtime.executor.setPersonas(personas);
  runtime.executor.setTemplateLibrary(templates);
  runtime.executor.replaceSessionNodes(sessionId, persistedSessionNodes);

  const result = await runtime.executor.enhancePrompt(pipelineInput);
  await savePersistedSessionNodes(
    sessionId,
    runtime.executor.getSessionNodesForSession(sessionId),
  );

  return result;
}

async function handleEnhanceClick(): Promise<void> {
  const composer = activeComposer ?? findBestComposer();
  const ui = getEnhancerUi();

  if (!composer) {
    setEnhancerStatus('Focus the LLM prompt box first so PromptBridge knows where to write back.', true);
    hideEnhancerUi();
    return;
  }

  const composerText = getComposerText(composer);

  if (!composerText) {
    setEnhancerStatus('Type something into the prompt box before enhancing it.', true);
    positionEnhancer(composer);
    return;
  }

  isEnhancing = true;
  ui.button.disabled = true;
  ui.button.textContent = OPTIMIZING_BUTTON_LABEL;
  ui.button.style.opacity = '0.75';
  setEnhancerStatus('Optimizing the current prompt inside this chat...');

  try {
    const result = await enhanceComposerPrompt(composer);
    setComposerText(composer, result.enrichedPrompt);
    activeComposer = composer;
    setEnhancerStatus(
      result.isNewTemplate
        ? `${result.matchBadge} - ${Math.round(result.matchScore * 100).toString()}% - Saved to your template library`
        : `${result.matchBadge} - ${Math.round(result.matchScore * 100).toString()}%`,
    );
    positionEnhancer(composer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PromptBridge could not enhance this prompt.';
    setEnhancerStatus(message, true);
    positionEnhancer(composer);
  } finally {
    isEnhancing = false;
    ui.button.disabled = false;
    ui.button.textContent = OPTIMIZE_BUTTON_LABEL;
    ui.button.style.opacity = '1';
  }
}

function refreshActiveComposer(candidate: Element | null): void {
  const nextComposer = findComposerFromElement(candidate) ?? findBestComposer();

  activeComposer = nextComposer;
  if (!nextComposer) {
    hideEnhancerUi();
    return;
  }

  setEnhancerStatus(BUTTON_IDLE_STATUS);
  positionEnhancer(nextComposer);
}

function installPromptEnhancer(): void {
  const ui = getEnhancerUi();

  ui.button.addEventListener('click', () => {
    if (!isEnhancing) {
      void handleEnhanceClick();
    }
  });

  window.addEventListener('focusin', (event) => {
    refreshActiveComposer(event.target instanceof Element ? event.target : null);
  });
  window.addEventListener('click', (event) => {
    refreshActiveComposer(event.target instanceof Element ? event.target : null);
  });
  window.addEventListener('resize', () => {
    positionEnhancer(activeComposer);
  });
  window.addEventListener(
    'scroll',
    () => {
      positionEnhancer(activeComposer);
    },
    { passive: true },
  );

  const observer = new MutationObserver(() => {
    if (activeComposer && !activeComposer.isConnected) {
      activeComposer = null;
    }

    positionEnhancer(activeComposer ?? findBestComposer());
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  refreshActiveComposer(document.activeElement instanceof Element ? document.activeElement : null);
}

document.documentElement.setAttribute('data-promptbridge', 'active');

if (document.readyState === 'complete') {
  notifyContentReady();
} else {
  window.addEventListener('load', notifyContentReady, { once: true });
}

if (isSupportedLlmHost(window.location.hostname)) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installPromptEnhancer, { once: true });
  } else {
    installPromptEnhancer();
  }
}

chrome.runtime.onMessage.addListener(
  (message: CollectPageContextMessage, _sender, sendResponse): boolean => {
    if (message.type === 'COLLECT_PAGE_CONTEXT') {
      sendResponse(collectPageContext());
    }

    return false;
  },
);
