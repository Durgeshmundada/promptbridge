import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { browser } from '../lib/browser';
import contentStyles from '../assets/styles/content.css?inline';
import { EnhancerApp } from './EnhancerApp';
import { collectPageContext } from './utils/domUtils';
import type { PageContext } from './utils/domUtils';
import { isSupportedLlmHost } from './utils/hostDetector';

interface CollectPageContextMessage {
  type: 'COLLECT_PAGE_CONTEXT';
}

const ROOT_HOST_ID = 'promptbridge-root';

let reactRoot: Root | null = null;
let shadowHost: HTMLDivElement | null = null;

function notifyContentReady(): void {
  browser.runtime.sendMessage(
    {
      type: 'CONTENT_READY',
      payload: {
        title: document.title,
        url: window.location.href,
      },
    },
    () => {
      void browser.runtime.lastError;
    },
  );
}

function removeExistingHost(): void {
  const existingHost = document.getElementById(ROOT_HOST_ID);

  if (existingHost) {
    existingHost.remove();
  }
}

function unmountEnhancerApp(): void {
  reactRoot?.unmount();
  reactRoot = null;
  shadowHost?.remove();
  shadowHost = null;
}

function mountEnhancerApp(): void {
  if (!isSupportedLlmHost(window.location.hostname)) {
    return;
  }

  unmountEnhancerApp();
  removeExistingHost();

  shadowHost = document.createElement('div');
  shadowHost.id = ROOT_HOST_ID;

  const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  const appRoot = document.createElement('div');

  style.textContent = contentStyles;
  shadowRoot.append(style, appRoot);
  document.documentElement.appendChild(shadowHost);

  reactRoot = createRoot(appRoot);
  reactRoot.render(React.createElement(EnhancerApp));
}

function installWhenReady(): void {
  document.documentElement.setAttribute('data-promptbridge', 'active');

  if (document.readyState === 'complete') {
    notifyContentReady();
  } else {
    window.addEventListener('load', notifyContentReady, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountEnhancerApp, { once: true });
  } else {
    mountEnhancerApp();
  }
}

installWhenReady();

window.addEventListener('pagehide', unmountEnhancerApp, { once: true });

browser.runtime.onMessage.addListener(
  (message: CollectPageContextMessage, _sender, sendResponse): boolean => {
    if (message.type === 'COLLECT_PAGE_CONTEXT') {
      sendResponse(collectPageContext() satisfies PageContext);
    }

    return false;
  },
);
