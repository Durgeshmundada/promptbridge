import PipelineExecutor, { type ApiKeyManager } from '../pipeline/PipelineExecutor';
import { getAllTemplates } from '../pipeline/layer1/templateMatcher';
import type {
  AppSettings,
  ClarificationQuestion,
  ClarificationResponse,
  Persona,
  PipelineInput,
  PipelineResult,
  PromptTemplate,
  SessionNode,
} from '../types';
import { loadAppSettings, loadPersonas, saveAppSettings } from '../utils/storage';

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
  controls: HTMLDivElement;
  button: HTMLButtonElement;
  enhancedModeToggle: HTMLInputElement;
  enhancedModeLabel: HTMLLabelElement;
  status: HTMLParagraphElement;
  mountedContainer: HTMLElement | null;
}

interface ClarificationModalUi {
  shell: HTMLDivElement;
  header: HTMLDivElement;
  questionsContainer: HTMLDivElement;
  submitButton: HTMLButtonElement;
  defaultsButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
}

interface ClarificationQuestionCard {
  root: HTMLDivElement;
  headerButton: HTMLButtonElement;
  textarea: HTMLTextAreaElement;
  answerWrap: HTMLDivElement;
  indicator: HTMLSpanElement;
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
const ENHANCED_MODE_LABEL = 'Enhanced mode';
const ENHANCED_MODE_MODAL_TITLE = 'PromptBridge Enhanced Mode';
const ENHANCED_MODE_MODAL_SUBTITLE =
  'Answer what matters. Leave anything blank and PromptBridge will use the best professional choice.';
const ENHANCED_MODE_MODAL_SUBMIT = 'Optimize with Context';
const ENHANCED_MODE_MODAL_DEFAULTS = 'Use Best Professional Choices';
const SAFE_AREA_PADDING_DATA_KEY = 'promptbridgeOriginalPaddingBottom';
const SAFE_AREA_MIN_HEIGHT_DATA_KEY = 'promptbridgeOriginalMinHeight';

let enhancerUi: EnhancerUi | null = null;
let activeComposer: ComposerElement | null = null;
let isEnhancing = false;
let runtimePromise: Promise<PromptBridgeEnhancerRuntime> | null = null;
let safeAreaComposer: ComposerElement | null = null;
let clarificationModalUi: ClarificationModalUi | null = null;

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
  const controls = document.createElement('div');
  const button = document.createElement('button');
  const enhancedModeLabel = document.createElement('label');
  const enhancedModeToggle = document.createElement('input');
  const status = document.createElement('p');

  shell.setAttribute('data-promptbridge-enhancer', 'true');
  shell.style.position = 'absolute';
  shell.style.zIndex = '30';
  shell.style.display = 'none';
  shell.style.flexDirection = 'column';
  shell.style.alignItems = 'flex-start';
  shell.style.gap = '6px';
  shell.style.fontFamily = 'Segoe UI, Arial, sans-serif';

  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  controls.style.gap = '8px';
  controls.style.flexWrap = 'wrap';

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

  enhancedModeLabel.style.display = 'inline-flex';
  enhancedModeLabel.style.alignItems = 'center';
  enhancedModeLabel.style.gap = '8px';
  enhancedModeLabel.style.padding = '8px 12px';
  enhancedModeLabel.style.borderRadius = '999px';
  enhancedModeLabel.style.background = 'rgba(15, 23, 42, 0.82)';
  enhancedModeLabel.style.color = '#e2e8f0';
  enhancedModeLabel.style.fontSize = '12px';
  enhancedModeLabel.style.fontWeight = '600';
  enhancedModeLabel.style.border = '1px solid rgba(148, 163, 184, 0.24)';
  enhancedModeLabel.style.cursor = 'pointer';
  enhancedModeLabel.style.userSelect = 'none';

  enhancedModeToggle.type = 'checkbox';
  enhancedModeToggle.style.margin = '0';
  enhancedModeToggle.style.accentColor = '#7c3aed';

  enhancedModeLabel.append(enhancedModeToggle, document.createTextNode(ENHANCED_MODE_LABEL));

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

  controls.append(button, enhancedModeLabel);
  shell.append(controls, status);

  return {
    shell,
    controls,
    button,
    enhancedModeToggle,
    enhancedModeLabel,
    status,
    mountedContainer: null,
  };
}

function getEnhancerUi(): EnhancerUi {
  if (!enhancerUi) {
    enhancerUi = createEnhancerUi();
  }

  return enhancerUi;
}

function setEnhancedModeToggleState(enabled: boolean): void {
  const ui = getEnhancerUi();
  ui.enhancedModeToggle.checked = enabled;
  ui.enhancedModeLabel.style.borderColor = enabled
    ? 'rgba(124, 58, 237, 0.58)'
    : 'rgba(148, 163, 184, 0.24)';
  ui.enhancedModeLabel.style.background = enabled
    ? 'rgba(76, 29, 149, 0.88)'
    : 'rgba(15, 23, 42, 0.82)';
}

async function syncEnhancedModeToggleFromStorage(): Promise<void> {
  const settings = await loadAppSettings().catch(() => null);
  setEnhancedModeToggleState(settings?.enhancedModeEnabled ?? false);
}

async function persistEnhancedModeSetting(enabled: boolean): Promise<void> {
  const currentSettings = await loadAppSettings();
  await saveAppSettings({
    ...currentSettings,
    enhancedModeEnabled: enabled,
  });
  setEnhancedModeToggleState(enabled);
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

function shieldKeyboardEvent(event: Event): void {
  event.stopPropagation();
}

function ensureClarificationModalUi(): ClarificationModalUi {
  if (clarificationModalUi) {
    return clarificationModalUi;
  }

  const shell = document.createElement('div');
  const header = document.createElement('div');
  const title = document.createElement('div');
  const subtitle = document.createElement('p');
  const closeButton = document.createElement('button');
  const questionsContainer = document.createElement('div');
  const footer = document.createElement('div');
  const defaultsButton = document.createElement('button');
  const submitButton = document.createElement('button');

  shell.setAttribute('data-promptbridge-clarification-modal', 'true');
  shell.style.position = 'fixed';
  shell.style.left = 'calc(50vw - 220px)';
  shell.style.top = '96px';
  shell.style.width = 'min(440px, calc(100vw - 32px))';
  shell.style.maxHeight = 'min(640px, calc(100vh - 32px))';
  shell.style.overflow = 'hidden';
  shell.style.display = 'none';
  shell.style.flexDirection = 'column';
  shell.style.gap = '16px';
  shell.style.padding = '18px';
  shell.style.borderRadius = '24px';
  shell.style.background = 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)';
  shell.style.boxShadow = '0 22px 70px rgba(15, 23, 42, 0.45)';
  shell.style.border = '1px solid rgba(124, 58, 237, 0.35)';
  shell.style.zIndex = '2147483647';
  shell.style.color = '#e2e8f0';
  shell.style.fontFamily = 'Segoe UI, Arial, sans-serif';
  shell.style.pointerEvents = 'auto';

  header.style.display = 'flex';
  header.style.alignItems = 'flex-start';
  header.style.justifyContent = 'space-between';
  header.style.gap = '16px';
  header.style.cursor = 'move';
  header.style.userSelect = 'none';

  title.textContent = ENHANCED_MODE_MODAL_TITLE;
  title.style.fontSize = '18px';
  title.style.fontWeight = '700';
  title.style.lineHeight = '1.4';

  subtitle.textContent = ENHANCED_MODE_MODAL_SUBTITLE;
  subtitle.style.margin = '8px 0 0';
  subtitle.style.fontSize = '13px';
  subtitle.style.lineHeight = '1.6';
  subtitle.style.color = '#cbd5e1';

  closeButton.type = 'button';
  closeButton.textContent = 'Use defaults';
  closeButton.style.border = '1px solid rgba(148, 163, 184, 0.24)';
  closeButton.style.background = 'rgba(15, 23, 42, 0.72)';
  closeButton.style.color = '#e2e8f0';
  closeButton.style.borderRadius = '999px';
  closeButton.style.padding = '8px 12px';
  closeButton.style.fontSize = '12px';
  closeButton.style.fontWeight = '700';
  closeButton.style.cursor = 'pointer';

  questionsContainer.style.display = 'grid';
  questionsContainer.style.gap = '10px';
  questionsContainer.style.overflowY = 'auto';
  questionsContainer.style.paddingRight = '4px';

  footer.style.display = 'flex';
  footer.style.justifyContent = 'flex-end';
  footer.style.gap = '10px';
  footer.style.flexWrap = 'wrap';

  defaultsButton.type = 'button';
  defaultsButton.textContent = ENHANCED_MODE_MODAL_DEFAULTS;
  defaultsButton.style.border = '1px solid rgba(148, 163, 184, 0.24)';
  defaultsButton.style.background = 'rgba(15, 23, 42, 0.72)';
  defaultsButton.style.color = '#e2e8f0';
  defaultsButton.style.borderRadius = '999px';
  defaultsButton.style.padding = '10px 14px';
  defaultsButton.style.fontSize = '13px';
  defaultsButton.style.fontWeight = '700';
  defaultsButton.style.cursor = 'pointer';

  submitButton.type = 'button';
  submitButton.textContent = ENHANCED_MODE_MODAL_SUBMIT;
  submitButton.style.border = 'none';
  submitButton.style.background = 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)';
  submitButton.style.color = '#ffffff';
  submitButton.style.borderRadius = '999px';
  submitButton.style.padding = '10px 16px';
  submitButton.style.fontSize = '13px';
  submitButton.style.fontWeight = '700';
  submitButton.style.cursor = 'pointer';

  const titleBlock = document.createElement('div');
  titleBlock.append(title, subtitle);
  header.append(titleBlock, closeButton);
  footer.append(defaultsButton, submitButton);
  shell.append(header, questionsContainer, footer);

  ['keydown', 'keyup', 'keypress'].forEach((eventName) => {
    shell.addEventListener(eventName, shieldKeyboardEvent);
  });
  shell.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  shell.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });

  document.body.append(shell);

  clarificationModalUi = {
    shell,
    header,
    questionsContainer,
    submitButton,
    defaultsButton,
    closeButton,
  };

  return clarificationModalUi;
}

function makeModalDraggable(shell: HTMLDivElement, header: HTMLDivElement): void {
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragging = false;

  const stopDragging = (): void => {
    dragging = false;
    document.body.style.userSelect = '';
  };

  header.addEventListener('mousedown', (event) => {
    if (!(event.target instanceof HTMLElement) || event.target.closest('button, textarea')) {
      return;
    }

    dragging = true;
    dragOffsetX = event.clientX - shell.getBoundingClientRect().left;
    dragOffsetY = event.clientY - shell.getBoundingClientRect().top;
    document.body.style.userSelect = 'none';
    event.preventDefault();
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragging) {
      return;
    }

    const nextLeft = Math.min(
      Math.max(12, event.clientX - dragOffsetX),
      Math.max(12, window.innerWidth - shell.offsetWidth - 12),
    );
    const nextTop = Math.min(
      Math.max(12, event.clientY - dragOffsetY),
      Math.max(12, window.innerHeight - shell.offsetHeight - 12),
    );

    shell.style.left = `${Math.round(nextLeft)}px`;
    shell.style.top = `${Math.round(nextTop)}px`;
  });

  window.addEventListener('mouseup', stopDragging);
  window.addEventListener('blur', stopDragging);
}

function createQuestionCard(
  question: ClarificationQuestion,
  index: number,
): ClarificationQuestionCard {
  const root = document.createElement('div');
  const headerButton = document.createElement('button');
  const answerWrap = document.createElement('div');
  const textarea = document.createElement('textarea');
  const hint = document.createElement('p');

  root.style.border = '1px solid rgba(148, 163, 184, 0.2)';
  root.style.borderRadius = '18px';
  root.style.background = 'rgba(15, 23, 42, 0.68)';
  root.style.overflow = 'hidden';

  headerButton.type = 'button';
  headerButton.style.width = '100%';
  headerButton.style.display = 'flex';
  headerButton.style.alignItems = 'center';
  headerButton.style.justifyContent = 'space-between';
  headerButton.style.gap = '12px';
  headerButton.style.padding = '14px';
  headerButton.style.border = 'none';
  headerButton.style.background = 'transparent';
  headerButton.style.color = '#e2e8f0';
  headerButton.style.cursor = 'pointer';
  headerButton.style.textAlign = 'left';
  const headerLeft = document.createElement('span');
  const badge = document.createElement('span');
  const promptText = document.createElement('span');
  const indicator = document.createElement('span');

  headerLeft.style.display = 'flex';
  headerLeft.style.alignItems = 'center';
  headerLeft.style.gap = '12px';

  badge.textContent = (index + 1).toString();
  badge.style.display = 'inline-flex';
  badge.style.height = '28px';
  badge.style.width = '28px';
  badge.style.alignItems = 'center';
  badge.style.justifyContent = 'center';
  badge.style.borderRadius = '999px';
  badge.style.background = '#7c3aed';
  badge.style.color = '#ffffff';
  badge.style.fontSize = '12px';
  badge.style.fontWeight = '700';

  promptText.textContent = question.prompt;
  promptText.style.fontSize = '14px';
  promptText.style.lineHeight = '1.5';
  promptText.style.fontWeight = '600';

  indicator.textContent = 'Open';
  indicator.style.fontSize = '11px';
  indicator.style.letterSpacing = '0.16em';
  indicator.style.textTransform = 'uppercase';
  indicator.style.color = '#94a3b8';

  headerLeft.append(badge, promptText);
  headerButton.append(headerLeft, indicator);

  answerWrap.style.display = 'grid';
  answerWrap.style.gridTemplateRows = '0fr';
  answerWrap.style.transition = 'grid-template-rows 180ms ease, opacity 180ms ease';
  answerWrap.style.opacity = '0';

  const answerInner = document.createElement('div');
  answerInner.style.overflow = 'hidden';
  answerInner.style.padding = '0 14px 14px';
  answerInner.style.borderTop = '1px solid rgba(148, 163, 184, 0.16)';

  textarea.placeholder = question.placeholder;
  textarea.rows = 4;
  textarea.style.marginTop = '14px';
  textarea.style.width = '100%';
  textarea.style.minHeight = '88px';
  textarea.style.resize = 'vertical';
  textarea.style.borderRadius = '16px';
  textarea.style.border = '1px solid rgba(148, 163, 184, 0.24)';
  textarea.style.background = 'rgba(30, 41, 59, 0.85)';
  textarea.style.color = '#e2e8f0';
  textarea.style.padding = '12px 14px';
  textarea.style.fontSize = '13px';
  textarea.style.lineHeight = '1.6';
  textarea.style.outline = 'none';

  hint.textContent = 'Leave blank to use the best professional choice.';
  hint.style.margin = '8px 0 0';
  hint.style.fontSize = '12px';
  hint.style.lineHeight = '1.5';
  hint.style.color = '#94a3b8';

  ['keydown', 'keyup', 'keypress'].forEach((eventName) => {
    textarea.addEventListener(eventName, shieldKeyboardEvent, true);
  });

  answerInner.append(textarea, hint);
  answerWrap.append(answerInner);
  root.append(headerButton, answerWrap);

  return {
    root,
    headerButton,
    textarea,
    answerWrap,
    indicator,
  };
}

function setQuestionCardExpanded(
  card: ClarificationQuestionCard,
  expanded: boolean,
): void {
  card.answerWrap.style.gridTemplateRows = expanded ? '1fr' : '0fr';
  card.answerWrap.style.opacity = expanded ? '1' : '0';
  card.root.style.borderColor = expanded
    ? 'rgba(124, 58, 237, 0.6)'
    : 'rgba(148, 163, 184, 0.2)';
  card.root.style.background = expanded
    ? 'rgba(30, 41, 59, 0.92)'
    : 'rgba(15, 23, 42, 0.68)';
  card.indicator.textContent = expanded ? 'Editing' : 'Open';
}

async function collectClarificationResponses(
  questions: ClarificationQuestion[],
): Promise<ClarificationResponse[]> {
  const modal = ensureClarificationModalUi();

  if (!(modal.shell.dataset.promptbridgeDraggable === 'true')) {
    makeModalDraggable(modal.shell, modal.header);
    modal.shell.dataset.promptbridgeDraggable = 'true';
  }

  modal.questionsContainer.replaceChildren();

  return await new Promise<ClarificationResponse[]>((resolve) => {
    const cards = questions.map((question, index) => createQuestionCard(question, index));
    let completed = false;

    const finalize = (useDefaultsOnly: boolean): void => {
      if (completed) {
        return;
      }

      completed = true;
      modal.submitButton.disabled = true;
      modal.defaultsButton.disabled = true;
      modal.closeButton.disabled = true;
      modal.shell.style.display = 'none';
      resolve(
        cards.map((card, index) => {
          const answer = useDefaultsOnly ? '' : card.textarea.value.trim();

          return {
            questionId: questions[index].id,
            answer,
            usedDefault: answer.length === 0,
          };
        }),
      );
    };

    cards.forEach((card, index) => {
      card.headerButton.addEventListener('click', () => {
        cards.forEach((entry, entryIndex) => {
          setQuestionCardExpanded(entry, entryIndex === index);
        });
        card.textarea.focus();
      });
      modal.questionsContainer.append(card.root);
    });

    setQuestionCardExpanded(cards[0], true);

    for (let index = 1; index < cards.length; index += 1) {
      setQuestionCardExpanded(cards[index], false);
    }

    const submitHandler = (): void => {
      cleanup();
      setEnhancerStatus('Applying your context to build a stronger prompt...');
      finalize(false);
    };
    const defaultsHandler = (): void => {
      cleanup();
      setEnhancerStatus('Applying the best professional defaults...');
      finalize(true);
    };
    const cleanup = (): void => {
      modal.submitButton.removeEventListener('click', submitHandler);
      modal.defaultsButton.removeEventListener('click', defaultsHandler);
      modal.closeButton.removeEventListener('click', defaultsHandler);
    };

    modal.submitButton.disabled = false;
    modal.defaultsButton.disabled = false;
    modal.closeButton.disabled = false;
    modal.submitButton.addEventListener('click', submitHandler);
    modal.defaultsButton.addEventListener('click', defaultsHandler);
    modal.closeButton.addEventListener('click', defaultsHandler);
    modal.shell.style.display = 'flex';

    window.setTimeout(() => {
      cards[0]?.textarea.focus();
    }, 0);
  });
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
      executor.on('clarificationSet', (questions) => {
        setEnhancerStatus('Enhanced Mode found missing context. Answer the questions or use defaults.');
        void collectClarificationResponses(questions)
          .then((responses) => {
            executor.resumeWithClarificationSet(responses);
          })
          .catch(() => {
            executor.resumeWithClarificationSet(
              questions.map((question) => ({
                questionId: question.id,
                answer: '',
                usedDefault: true,
              })),
            );
          });
      });
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
  setEnhancedModeToggleState(settings.enhancedModeEnabled);

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
  ui.enhancedModeToggle.addEventListener('change', () => {
    const nextValue = ui.enhancedModeToggle.checked;

    void persistEnhancedModeSetting(nextValue)
      .then(() => {
        setEnhancerStatus(
          nextValue
            ? 'Enhanced Mode enabled. PromptBridge will ask targeted clarification questions first.'
            : 'Enhanced Mode disabled. PromptBridge is back to one-click optimization.',
        );
        positionEnhancer(activeComposer);
      })
      .catch((error) => {
        setEnhancerStatus(
          error instanceof Error
            ? error.message
            : 'PromptBridge could not save the Enhanced Mode setting.',
          true,
        );
        void syncEnhancedModeToggleFromStorage();
      });
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

  void syncEnhancedModeToggleFromStorage();
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
