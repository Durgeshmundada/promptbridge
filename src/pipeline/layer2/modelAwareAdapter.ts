import { ModelTarget } from '../../types';

function compactPrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function adaptForGpt4o(prompt: string): string {
  return [
    '### SYSTEM',
    'You are PromptBridge. Follow the request carefully and produce a polished answer in Markdown.',
    '',
    '### USER',
    prompt.trim(),
    '',
    '### MARKDOWN_HINTS',
    '- Use headings, bullets, and fenced code blocks when they improve clarity.',
    '- Surface assumptions explicitly if any part of the request is underspecified.',
  ].join('\n');
}

function adaptForClaude(prompt: string): string {
  return [
    '<promptbridge_request>',
    '  <constitutional_principles>',
    '    Be helpful, honest, cautious about uncertainty, and avoid overclaiming.',
    '  </constitutional_principles>',
    `  <user_request>${escapeXml(prompt.trim())}</user_request>`,
    '  <response_style>Use calm, structured sections and note uncertainties explicitly.</response_style>',
    '</promptbridge_request>',
  ].join('\n');
}

function adaptForGemini(prompt: string): string {
  return [
    'respond_request({',
    `  "prompt": ${JSON.stringify(compactPrompt(prompt))},`,
    '  "output_mode": "structured_markdown",',
    '  "instruction": "Be concise, schema-friendly, and return only the requested structure."',
    '})',
  ].join('\n');
}

function adaptForLlama(prompt: string): string {
  return `[INST] Follow the request directly and efficiently.\n${compactPrompt(
    prompt,
  )}\nRespond with only the requested content and avoid unnecessary filler. [/INST]`;
}

function adaptForGroq(prompt: string): string {
  return [
    '### GROQ_EXECUTION',
    'Use the request below exactly, answer in polished Markdown, and avoid unnecessary filler.',
    '',
    compactPrompt(prompt),
  ].join('\n');
}

/**
 * Rewrites a prompt into model-specific framing that better matches the target model's preferred prompting style.
 */
export function adaptPromptForModel(prompt: string, modelTarget: ModelTarget): string {
  switch (modelTarget) {
    case ModelTarget.GROQ:
      return adaptForGroq(prompt);
    case ModelTarget.GPT4O:
      return adaptForGpt4o(prompt);
    case ModelTarget.CLAUDE:
      return adaptForClaude(prompt);
    case ModelTarget.GEMINI:
      return adaptForGemini(prompt);
    case ModelTarget.LLAMA:
      return adaptForLlama(prompt);
    case ModelTarget.CUSTOM:
      return prompt;
    default: {
      const unreachableModel: never = modelTarget;
      return unreachableModel;
    }
  }
}
