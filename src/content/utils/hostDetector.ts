export const SUPPORTED_LLM_HOSTS = [
  'chatgpt.com',
  'chat.openai.com',
  'claude.ai',
  'gemini.google.com',
  'aistudio.google.com',
  'perplexity.ai',
] as const;

export function isSupportedLlmHost(hostname: string): boolean {
  return SUPPORTED_LLM_HOSTS.some(
    (supportedHost) => hostname === supportedHost || hostname.endsWith(`.${supportedHost}`),
  );
}
