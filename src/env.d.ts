declare module '*.css';

declare global {
  interface GlobalThis {
    __PROMPTBRIDGE_GROQ_API_KEY__?: string;
    __PROMPTBRIDGE_TEMPLATE_SERVICE_BASE_URL__?: string;
  }
}

export {};
