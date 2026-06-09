import { browser } from '../lib/browser';
import type {
  ErrorResponse,
  ExecuteLlmErrorResponse,
  RuntimeRequest,
} from './serviceWorker';

interface MessageRouterOptions {
  handleRuntimeRequest: (message: RuntimeRequest) => Promise<unknown>;
  isRestrictedContentScriptRequest: (message: RuntimeRequest) => boolean;
  getErrorMessage: (error: unknown) => string;
  getErrorCode: (error: unknown) => number | undefined;
}

export function registerMessageRouter(options: MessageRouterOptions): void {
  browser.runtime.onMessage.addListener((message: RuntimeRequest, sender, sendResponse) => {
    if (sender.tab && options.isRestrictedContentScriptRequest(message)) {
      sendResponse({
        ok: false,
        error:
          'PromptBridge blocks direct Groq and vision bridge calls from content scripts. Route them through extension pages instead.',
        code: 403,
      } satisfies ExecuteLlmErrorResponse);
      return false;
    }

    void (async () => {
      try {
        const response = await options.handleRuntimeRequest(message);
        sendResponse(response);
      } catch (error) {
        sendResponse({
          ok: false,
          error: options.getErrorMessage(error),
          ...(typeof options.getErrorCode(error) === 'number'
            ? { code: options.getErrorCode(error) }
            : {}),
        } satisfies ErrorResponse);
      }
    })();

    return true;
  });
}
