import type { PromptTemplate } from '../types';

export interface LoadTemplatesRuntimeRequest {
  type: 'LOAD_TEMPLATES';
  includeInactive?: boolean;
}

export interface SaveTemplateRuntimeRequest {
  type: 'SAVE_TEMPLATE';
  payload: PromptTemplate;
}

export interface TemplateRuntimeErrorResponse {
  ok: false;
  code?: number;
  error: string;
}

export interface LoadTemplatesRuntimeSuccessResponse {
  ok: true;
  source: 'cache' | 'remote';
  templates: PromptTemplate[];
}

export interface SaveTemplateRuntimeSuccessResponse {
  ok: true;
  template: PromptTemplate;
}

export type TemplateRuntimeRequest =
  | LoadTemplatesRuntimeRequest
  | SaveTemplateRuntimeRequest;

type TemplateRuntimeResponse =
  | LoadTemplatesRuntimeSuccessResponse
  | SaveTemplateRuntimeSuccessResponse
  | TemplateRuntimeErrorResponse;

function cloneTemplate(template: PromptTemplate): PromptTemplate {
  return {
    ...template,
    tags: [...template.tags],
    ...(template.tfIdfVector ? { tfIdfVector: [...template.tfIdfVector] } : {}),
  };
}

function hasRuntimeMessaging(): boolean {
  return typeof globalThis.chrome?.runtime?.sendMessage === 'function';
}

async function sendTemplateRuntimeMessage<TResponse extends TemplateRuntimeResponse>(
  message: TemplateRuntimeRequest,
): Promise<TResponse | null> {
  if (!hasRuntimeMessaging()) {
    return null;
  }

  return await new Promise<TResponse | null>((resolve) => {
    globalThis.chrome.runtime.sendMessage(message, (response: TResponse) => {
      if (globalThis.chrome?.runtime?.lastError) {
        resolve(null);
        return;
      }

      resolve(response ?? null);
    });
  });
}

export async function loadTemplatesFromRuntime(): Promise<PromptTemplate[] | null> {
  return loadTemplateCatalogFromRuntime();
}

export async function loadTemplateCatalogFromRuntime(
  includeInactive = false,
): Promise<PromptTemplate[] | null> {
  const response =
    await sendTemplateRuntimeMessage<LoadTemplatesRuntimeSuccessResponse | TemplateRuntimeErrorResponse>(
      {
        type: 'LOAD_TEMPLATES',
        ...(includeInactive ? { includeInactive } : {}),
      },
    );

  if (!response || response.ok !== true) {
    return null;
  }

  return response.templates.map(cloneTemplate);
}

export async function saveTemplateToRuntime(
  template: PromptTemplate,
): Promise<boolean> {
  const response =
    await sendTemplateRuntimeMessage<SaveTemplateRuntimeSuccessResponse | TemplateRuntimeErrorResponse>(
      {
        type: 'SAVE_TEMPLATE',
        payload: cloneTemplate(template),
      },
    );

  return response?.ok === true;
}
