interface BrowserRuntimeGlobal {
  browser?: typeof chrome;
  chrome?: typeof chrome;
}

const runtimeGlobal = globalThis as BrowserRuntimeGlobal;
const detectedBrowser = runtimeGlobal.browser ?? runtimeGlobal.chrome;

if (!detectedBrowser) {
  throw new Error('No WebExtension browser runtime is available.');
}

export const browser: typeof chrome = detectedBrowser;
