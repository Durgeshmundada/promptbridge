export interface PageContext {
  title: string;
  url: string;
  selection: string;
  summary: string;
}

export type ComposerElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const GENERIC_COMPOSER_SELECTORS = [
  '#prompt-textarea',
  'textarea',
  '[role="textbox"][contenteditable="true"]',
  '[contenteditable="true"]',
] as const;

export function collectPageContext(): PageContext {
  const selection = window.getSelection()?.toString().trim() ?? '';
  const descriptionTag = document.querySelector('meta[name="description"]');
  const description = descriptionTag?.getAttribute('content')?.trim() ?? '';
  const visibleText = document.body?.innerText?.replace(/\s+/g, ' ').trim() ?? '';
  const summarySegments = [selection, description, visibleText.slice(0, 800)].filter(Boolean);

  return {
    title: document.title,
    url: window.location.href,
    selection,
    summary: summarySegments.join(' | ').slice(0, 1200),
  };
}

function isTextControlElement(
  element: Element | null,
): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function isEditableElement(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.isContentEditable;
}

function getComposerScore(element: Element): number {
  const text = getComposerText(element as ComposerElement);
  const rect = element.getBoundingClientRect();
  const roleScore = element.getAttribute('role') === 'textbox' ? 4 : 0;
  const textScore = text.length > 0 ? 3 : 0;
  const sizeScore = rect.width > 200 && rect.height > 24 ? 2 : 0;

  return roleScore + textScore + sizeScore;
}

export function findBestComposer(): ComposerElement | null {
  const candidates = GENERIC_COMPOSER_SELECTORS.flatMap((selector) =>
    Array.from(document.querySelectorAll(selector)),
  )
    .filter((element): element is ComposerElement => {
      if (isTextControlElement(element)) {
        return !element.disabled && !element.readOnly;
      }

      return isEditableElement(element);
    })
    .sort((left, right) => getComposerScore(right) - getComposerScore(left));

  return candidates[0] ?? null;
}

export function findComposerFromElement(element: Element | null): ComposerElement | null {
  if (!element) {
    return null;
  }

  if (isTextControlElement(element) || isEditableElement(element)) {
    return element;
  }

  return element.closest(GENERIC_COMPOSER_SELECTORS.join(',')) as ComposerElement | null;
}

export function getComposerText(element: ComposerElement): string {
  if (isTextControlElement(element)) {
    return element.value.trim();
  }

  return (element.textContent ?? '').trim();
}

export function setComposerText(element: ComposerElement, value: string): void {
  if (isTextControlElement(element)) {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.focus();
    element.setSelectionRange(value.length, value.length);
    return;
  }

  element.textContent = value;
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  element.focus();
}
