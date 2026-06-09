declare module '*.css';
declare module '*.css?inline';

declare global {
  interface GlobalThis {
    __PROMPTBRIDGE_TEMPLATE_SERVICE_BASE_URL__?: string;
  }
}

export {};
