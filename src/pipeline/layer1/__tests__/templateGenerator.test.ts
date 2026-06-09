import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockedFunction } from 'vitest';
import type * as ExecutionEngineModule from '../../layer6/executionEngine';

vi.mock('../../layer6/executionEngine', async () => {
  const actual = await vi.importActual<typeof ExecutionEngineModule>(
    '../../layer6/executionEngine',
  );

  return {
    ...actual,
    execute: vi.fn(),
  };
});

import type { PromptTemplate } from '../../../types';
import {
  IntentType,
  ModelTarget,
} from '../../../types';
import { getFromLocal, saveToLocal } from '../../../utils/storage';
import {
  adaptTemplate,
  generateTemplate,
  saveTemplateToDatabase,
  validateTemplate,
} from '../templateGenerator';
import { getMatchZone } from '../templateMatcher';
import { execute } from '../../layer6/executionEngine';

const executeMock = execute as MockedFunction<typeof execute>;
const GENERATED_TEMPLATES_STORAGE_KEY = 'pb_templates_generated';

type StorageMap = Record<string, unknown>;

interface MockStorageAreaControls {
  clear: () => void;
}

/**
 * Provides a JSON-based structuredClone fallback for the test environment.
 */
function structuredClonePolyfill<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Creates an in-memory chrome.storage area for unit tests.
 */
function createMockStorageArea(
  runtime: { lastError?: chrome.runtime.LastError },
): { area: chrome.storage.StorageArea; controls: MockStorageAreaControls } {
  const store: StorageMap = {};

  const area = {
    get(
      keys: string | string[] | Record<string, unknown> | null,
      callback: (items: Record<string, unknown>) => void,
    ): void {
      runtime.lastError = undefined;

      if (typeof keys === 'string') {
        callback(keys in store ? { [keys]: store[keys] } : {});
        return;
      }

      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};

        keys.forEach((key) => {
          if (key in store) {
            result[key] = store[key];
          }
        });

        callback(result);
        return;
      }

      if (keys === null) {
        callback({ ...store });
        return;
      }

      const result: Record<string, unknown> = {};

      Object.keys(keys).forEach((key) => {
        result[key] = key in store ? store[key] : keys[key];
      });

      callback(result);
    },
    set(items: Record<string, unknown>, callback?: () => void): void {
      runtime.lastError = undefined;
      Object.assign(store, items);
      callback?.();
    },
  } as unknown as chrome.storage.StorageArea;

  return {
    area,
    controls: {
      clear: () => {
        Object.keys(store).forEach((key) => {
          delete store[key];
        });
      },
    },
  };
}

/**
 * Installs a minimal chrome.storage mock.
 */
function installMockChrome(): MockStorageAreaControls {
  const runtime: { lastError?: chrome.runtime.LastError } = {};
  const { area: localArea, controls } = createMockStorageArea(runtime);

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime,
      storage: {
        local: localArea,
      },
    } as unknown as typeof chrome,
  });

  return controls;
}

/**
 * Creates a valid reusable template fixture.
 */
function createValidTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: 'valid-template',
    intentType: IntentType.GENERAL,
    description: 'Reusable template for structured writing requests.',
    template:
      'Task: {{task}}\nAudience: {{audience}}\nConstraints: {{constraints}}\nOutput format: {{output_format}}',
    tags: ['general', 'writing'],
    weight: 1,
    ...overrides,
  };
}

describe('templateGenerator', () => {
  let storageControls: MockStorageAreaControls;

  beforeAll(() => {
    Object.defineProperty(globalThis, 'structuredClone', {
      configurable: true,
      value: structuredClonePolyfill,
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    storageControls = installMockChrome();
    executeMock.mockReset();
  });

  afterEach(() => {
    storageControls.clear();
  });

  it('validateTemplate returns false for templates without reusable slots', () => {
    expect(
      validateTemplate(
        createValidTemplate({
          template: 'Task: write this exactly as-is.',
        }),
      ),
    ).toBe(false);
  });

  it('validateTemplate returns false for invalid intent types', () => {
    expect(
      validateTemplate({
        ...createValidTemplate(),
        intentType: 'NOT_A_REAL_INTENT' as IntentType,
      }),
    ).toBe(false);
  });

  it('validateTemplate returns true for valid reusable templates', () => {
    expect(validateTemplate(createValidTemplate())).toBe(true);
  });

  it('getMatchZone returns DIRECT only for scores at or above 0.90', () => {
    expect(getMatchZone(0.9)).toBe('DIRECT');
  });

  it('getMatchZone returns PARTIAL for scores from 0.70 up to 0.90', () => {
    expect(getMatchZone(0.89)).toBe('PARTIAL');
    expect(getMatchZone(0.7)).toBe('PARTIAL');
  });

  it('getMatchZone keeps scores below 0.70 in GENERATE', () => {
    expect(getMatchZone(0.69)).toBe('GENERATE');
    expect(getMatchZone(0.3)).toBe('GENERATE');
  });

  it('generateTemplate saves a mocked LLM template response to the generated database', async () => {
    executeMock.mockResolvedValueOnce({
      response: JSON.stringify({
        id: 'generated-release-notes',
        intentType: IntentType.GENERAL,
        description: 'Reusable release notes template for product updates.',
        template:
          'Write release notes for {{product}} covering {{changes}} and {{impact}}.',
        tags: ['release-notes', 'product', 'updates'],
        weight: 1,
      }),
      executionTimeMs: 125,
    });

    const result = await generateTemplate(
      'Write release notes for the payments dashboard launch.',
      IntentType.GENERAL,
      ModelTarget.GPT4O,
      'Recent same-session turns:\n- previous prompt about payments dashboard scope',
    );
    const storedTemplates =
      (await getFromLocal<PromptTemplate[]>(GENERATED_TEMPLATES_STORAGE_KEY)) ?? [];

    expect(result.id).toBe('generated-release-notes');
    expect(result.description).toContain('release notes');
    expect(storedTemplates.map((template) => template.id)).toContain('generated-release-notes');
  });

  it('executor adapts the closest template when the best match is between 0.70 and 0.90', async () => {
    const templateMatcherModule = await import('../templateMatcher');
    const { default: PipelineExecutor } = await import('../../PipelineExecutor');
    const fallbackTemplate = createValidTemplate({
      id: 'fallback-general-template',
      description: 'Reusable fallback template for partly matched product communication requests.',
      template:
        'Write {{content_type}} for {{product}} about {{topic}} with {{constraints}} and {{output_format}}.',
      tags: ['product', 'communication'],
    });

    vi.spyOn(templateMatcherModule, 'getAllTemplates').mockResolvedValue([fallbackTemplate]);
    vi.spyOn(templateMatcherModule, 'getTopMatch').mockReturnValue({
      zone: 'PARTIAL',
      template: fallbackTemplate,
      score: 0.78,
      isNewTemplate: false,
    });
    executeMock
      .mockResolvedValueOnce({
        response: JSON.stringify({
          id: 'ignored-adapted-template-id',
          intentType: IntentType.GENERAL,
          description: 'Reusable adapted release notes template for product updates.',
          template:
            'Write {{content_type}} for {{product}} covering {{changes}}, {{impact}}, {{constraints}}, and {{output_format}}.',
          tags: ['adapted', 'release-notes'],
          weight: 1,
        }),
        executionTimeMs: 85,
      })
      .mockResolvedValueOnce({
        response: 'Generated template answer. [LIKELY]',
        executionTimeMs: 120,
      });

    const executor = new PipelineExecutor(
      {
        activePersonaId: 'default-persona',
        targetModel: ModelTarget.GPT4O,
        sessionMemoryDepth: 8,
        vaultTimeoutMinutes: 20,
        theme: 'system',
        abModeEnabled: false,
        enhancedModeEnabled: false,
      },
      {
        ensureReady: vi.fn().mockResolvedValue(undefined),
      },
    );

    const result = await executor.execute({
      rawInput: 'Write release notes for the payments dashboard launch.',
      targetModel: ModelTarget.GPT4O,
      sessionId: 'strict-threshold-session',
    });

    expect(result.matchZone).toBe('PARTIAL');
    expect(result.isNewTemplate).toBe(true);
    expect(result.template.id).toMatch(/^adapted-/);
    expect(result.template.template).toContain('{{changes}}');
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it('adaptTemplate returns a modified template from a mocked LLM response', async () => {
    const baseTemplate = createValidTemplate({
      id: 'coding-template-base',
      intentType: IntentType.CODING,
      description: 'Reusable debugging template for application issues.',
      template:
        'Debug {{issue}} in {{file_name}} for {{language}} applications with {{constraints}}.',
      tags: ['coding', 'debug'],
    });

    executeMock.mockResolvedValueOnce({
      response: JSON.stringify({
        id: 'ignored-adapted-id',
        intentType: IntentType.CODING,
        description: 'Reusable Spring transaction debugging template.',
        template:
          'Debug {{issue}} in {{file_name}} for {{language}} / Spring Boot services with {{constraints}} and {{output_format}}.',
        tags: ['coding', 'spring', 'transactions'],
        weight: 1,
      }),
      executionTimeMs: 118,
    });

    const result = await adaptTemplate(
      baseTemplate,
      'How do I handle database transactions in Spring Boot?',
      ModelTarget.GPT4O,
      'Relevant session context:\n- prior prompt discussed fintech backend consistency guarantees',
    );

    expect(result.id).not.toBe(baseTemplate.id);
    expect(result.intentType).toBe(IntentType.CODING);
    expect(result.template).toContain('Spring Boot services');
    expect(result.template).toContain('{{output_format}}');
  });

  it('falls back to a one-off API-optimized prompt when reusable template generation returns invalid JSON', async () => {
    const templateMatcherModule = await import('../templateMatcher');
    const { default: PipelineExecutor } = await import('../../PipelineExecutor');

    vi.spyOn(templateMatcherModule, 'getAllTemplates').mockResolvedValue([
      createValidTemplate({
        id: 'fallback-general-template',
      }),
    ]);
    vi.spyOn(templateMatcherModule, 'getTopMatch').mockReturnValue({
      zone: 'GENERATE',
      template: createValidTemplate({
        id: 'fallback-general-template',
      }),
      score: 0.32,
      isNewTemplate: false,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    executeMock
      .mockResolvedValueOnce({
        response: 'This is not valid JSON at all.',
        executionTimeMs: 90,
      })
      .mockResolvedValueOnce({
        response:
          'Answer the user directly about orbital salvage financing. Include risk allocation, compliance clauses, negotiation points, and practical caveats.',
        executionTimeMs: 105,
      })
      .mockResolvedValueOnce({
        response: 'Optimized prompt answer. [LIKELY]',
        executionTimeMs: 140,
      });

    const executor = new PipelineExecutor(
      {
        activePersonaId: 'default-persona',
        targetModel: ModelTarget.GPT4O,
        sessionMemoryDepth: 8,
        vaultTimeoutMinutes: 20,
        theme: 'system',
        abModeEnabled: false,
        enhancedModeEnabled: false,
      },
      {
        ensureReady: vi.fn().mockResolvedValue(undefined),
      },
    );

    const result = await executor.execute({
      rawInput:
        'Draft an orbital salvage financing covenant with compliance clauses and risk allocation.',
      targetModel: ModelTarget.GPT4O,
      sessionId: 'template-fallback-session',
    });

    expect(result.template.id.startsWith('api-optimized-')).toBe(true);
    expect(result.matchZone).toBe('GENERATE');
    expect(result.matchBadge).toBe('Optimized prompt generated via API');
    expect(result.enrichedPrompt).toContain('orbital salvage financing');
    expect(executeMock).toHaveBeenCalledTimes(3);
  });

  it('caps the generated template database at 500 entries by removing the lowest-weight templates first', async () => {
    const existingTemplates = Array.from({ length: 500 }, (_value, index) =>
      createValidTemplate({
        id: `generated-${index.toString()}`,
        description: `Generated template ${index.toString()} for regression testing.`,
        weight: 0.5 + index / 1000,
      }),
    );

    await saveToLocal(GENERATED_TEMPLATES_STORAGE_KEY, existingTemplates);
    await saveTemplateToDatabase(
      createValidTemplate({
        id: 'generated-new-top-template',
        description: 'High-value generated template for important future matches.',
        weight: 2,
      }),
    );

    const storedTemplates =
      (await getFromLocal<PromptTemplate[]>(GENERATED_TEMPLATES_STORAGE_KEY)) ?? [];

    expect(storedTemplates).toHaveLength(500);
    expect(storedTemplates.map((template) => template.id)).toContain('generated-new-top-template');
    expect(storedTemplates.map((template) => template.id)).not.toContain('generated-0');
  });
});
