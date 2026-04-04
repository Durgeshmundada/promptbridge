import { useDeferredValue, useEffect, useState } from 'react';
import { usePromptBridgeStore } from '../../store';
import { IntentType } from '../../types';
import type { PromptTemplate } from '../../types';
import { loadTemplateCatalogFromRuntime } from '../../utils/templateServiceRuntime';

export interface TemplateLibraryProps {}

interface TemplateFormState {
  name: string;
  intentType: IntentType;
  template: string;
  description: string;
  tags: string;
}

const SLOT_HELPERS = [
  '{{persona_context}}',
  '{{domain_context}}',
  '{{task}}',
  '{{context}}',
  '{{constraints}}',
  '{{output_format}}',
  '{{length_constraint}}',
] as const;

const SLOT_EXAMPLES: Record<string, string> = {
  persona_context: 'a senior product engineer',
  domain_context: 'an internal developer tooling migration',
  task: 'debug a failing React route',
  context: 'stack trace mentions an undefined loader',
  constraints: 'keep the API unchanged',
  output_format: 'a concise plan with code samples',
  length_constraint: 'under 500 words',
  file_name: 'src/router.tsx',
  language: 'TypeScript',
  framework: 'React',
  version: 'v18.3.1',
  question: 'What changed in the release?',
  topic: 'evidence-backed prompt evaluation',
};

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  name: '',
  intentType: IntentType.GENERAL,
  template: 'Persona: {{persona_context}}\nTask: {{task}}\nContext: {{context}}\nConstraints: {{constraints}}\nOutput format: {{output_format}}\nLength: {{length_constraint}}',
  description: '',
  tags: '',
};

type TemplateViewMode = 'live' | 'archive' | 'all';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function buildExampleInput(template: PromptTemplate): string {
  return truncate(
    template.template.replace(/{{\s*([\w-]+)\s*}}/g, (_match, slotKey: string) => {
      return SLOT_EXAMPLES[slotKey] ?? slotKey.replace(/_/g, ' ');
    }),
    180,
  );
}

function buildIntentBadge(intentType: IntentType): string {
  return intentType.replace(/_/g, ' ');
}

function isArchiveTemplate(template: PromptTemplate): boolean {
  return template.isActive === false || template.importGroup === 'claude_code_system_prompts';
}

function isLiveTemplate(template: PromptTemplate): boolean {
  return !isArchiveTemplate(template);
}

export default function TemplateLibrary(_props: TemplateLibraryProps): JSX.Element {
  const {
    pinnedTemplateIds,
    templates,
    saveTemplatesToStorage,
    togglePinnedTemplate,
  } = usePromptBridgeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Pinned templates float to the top and get priority during popup matching.',
  );
  const [templateCatalog, setTemplateCatalog] = useState<PromptTemplate[] | null>(null);
  const [viewMode, setViewMode] = useState<TemplateViewMode>('live');
  const [formState, setFormState] = useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
  const resolvedTemplateCatalog = templateCatalog ?? templates;
  const liveTemplates = resolvedTemplateCatalog.filter(isLiveTemplate);
  const archiveTemplates = resolvedTemplateCatalog.filter(isArchiveTemplate);

  useEffect(() => {
    let isCancelled = false;

    const hydrateTemplateCatalog = async (): Promise<void> => {
      const catalog = await loadTemplateCatalogFromRuntime(true);

      if (!isCancelled && catalog) {
        setTemplateCatalog(catalog);
      }
    };

    void hydrateTemplateCatalog();

    return () => {
      isCancelled = true;
    };
  }, []);

  const visibleTemplates = viewMode === 'archive'
    ? archiveTemplates
    : viewMode === 'all'
      ? resolvedTemplateCatalog
      : liveTemplates;

  const orderedTemplates = [...visibleTemplates]
    .filter((template) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        template.id,
        template.description,
        template.intentType,
        template.tags.join(' '),
        template.template,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .sort((left, right) => {
      const leftPinned = pinnedTemplateIds.includes(left.id);
      const rightPinned = pinnedTemplateIds.includes(right.id);

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      if (right.weight !== left.weight) {
        return right.weight - left.weight;
      }

      return left.id.localeCompare(right.id);
    });

  const handleCreateTemplate = async (): Promise<void> => {
    const normalizedName = formState.name.trim();
    const normalizedTemplate = formState.template.trim();
    const normalizedDescription = formState.description.trim();

    if (!normalizedName || !normalizedTemplate || !normalizedDescription) {
      setStatusMessage('Name, template body, and description are required.');
      return;
    }

    const baseId = slugify(normalizedName) || 'custom-template';
    let candidateId = baseId;
    let suffix = 2;

    while (templates.some((template) => template.id === candidateId)) {
      candidateId = `${baseId}-${suffix.toString()}`;
      suffix += 1;
    }

    const nextTemplate: PromptTemplate = {
      id: candidateId,
      intentType: formState.intentType,
      template: normalizedTemplate,
      description: normalizedDescription,
      tags: formState.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      weight: 1,
    };

    await saveTemplatesToStorage([nextTemplate, ...templates]);
    setTemplateCatalog((currentCatalog) =>
      currentCatalog ? [nextTemplate, ...currentCatalog.filter((template) => template.id !== nextTemplate.id)] : currentCatalog,
    );
    setFormState(EMPTY_TEMPLATE_FORM);
    setIsCreating(false);
    setStatusMessage(`Saved template "${candidateId}" to chrome.storage.local.`);
  };

  return (
    <section className="pb-surface rounded-[28px] border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pb-accent)]">
            Template Library
          </p>
          <h2 className="mt-2 font-[var(--pb-font-display)] text-2xl text-[var(--pb-text)]">
            Curate prompt building blocks
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--pb-text-soft)]">
            Search, pin, and extend the prompt-template catalog that powers the first stage of
            PromptBridge matching.
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--pb-text-subtle)]">
            Live templates stay active for matching. Imported archive templates are searchable here
            but excluded from live matching by default.
          </p>
        </div>
        <button
          className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
          onClick={() => {
            setIsCreating((currentValue) => !currentValue);
          }}
          type="button"
        >
          {isCreating ? 'Close form' : 'Create template'}
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full flex-col gap-3 lg:max-w-3xl">
          <input
            className="w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none transition placeholder:text-[var(--pb-text-subtle)] focus:border-[var(--pb-border-strong)]"
            onChange={(event) => {
              setSearchQuery(event.target.value);
            }}
            placeholder="Search by template, tag, or intent"
            type="search"
            value={searchQuery}
          />
          <div className="flex flex-wrap gap-2">
            {([
              {
                id: 'live',
                label: `Live library (${liveTemplates.length.toString()})`,
              },
              {
                id: 'archive',
                label: `Imported archive (${archiveTemplates.length.toString()})`,
              },
              {
                id: 'all',
                label: `All templates (${resolvedTemplateCatalog.length.toString()})`,
              },
            ] as const).map((option) => {
              const isSelected = option.id === viewMode;

              return (
                <button
                  className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                    isSelected
                      ? 'bg-[var(--pb-accent)] text-white'
                      : 'border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] text-[var(--pb-text-soft)]'
                  }`}
                  key={option.id}
                  onClick={() => {
                    setViewMode(option.id);
                    setStatusMessage(
                      option.id === 'archive'
                        ? 'Browsing imported archive prompts stored in MongoDB Atlas.'
                        : option.id === 'all'
                          ? 'Showing both live matching templates and imported archive prompts.'
                          : 'Pinned templates float to the top and get priority during popup matching.',
                    );
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="m-0 text-sm text-[var(--pb-text-soft)]">{statusMessage}</p>
      </div>

      {isCreating ? (
        <div className="mt-5 rounded-[24px] border border-[var(--pb-border-strong)] bg-[var(--pb-surface-strong)] p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-[var(--pb-text-soft)]">
              Template name
              <input
                className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    name: event.target.value,
                  }));
                }}
                type="text"
                value={formState.name}
              />
            </label>

            <label className="text-sm font-medium text-[var(--pb-text-soft)]">
              Intent
              <select
                className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    intentType: event.target.value as IntentType,
                  }));
                }}
                value={formState.intentType}
              >
                {Object.values(IntentType).map((intentType) => (
                  <option key={intentType} value={intentType}>
                    {buildIntentBadge(intentType)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 block text-sm font-medium text-[var(--pb-text-soft)]">
            Template body
            <textarea
              className="mt-2 min-h-[180px] w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
              onChange={(event) => {
                setFormState((currentValue) => ({
                  ...currentValue,
                  template: event.target.value,
                }));
              }}
              value={formState.template}
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            {SLOT_HELPERS.map((slotHelper) => (
              <button
                className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
                key={slotHelper}
                onClick={() => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    template: `${currentValue.template}${currentValue.template.endsWith('\n') ? '' : '\n'}${slotHelper}`,
                  }));
                }}
                type="button"
              >
                {slotHelper}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-[var(--pb-text-soft)]">
              Description
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    description: event.target.value,
                  }));
                }}
                value={formState.description}
              />
            </label>

            <label className="text-sm font-medium text-[var(--pb-text-soft)]">
              Tags
              <input
                className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    tags: event.target.value,
                  }));
                }}
                placeholder="debug, frontend, refactor"
                type="text"
                value={formState.tags}
              />
              <span className="mt-2 block text-xs text-[var(--pb-text-subtle)]">
                Separate tags with commas.
              </span>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
              onClick={() => {
                void handleCreateTemplate();
              }}
              type="button"
            >
              Save template
            </button>
            <button
              className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
              onClick={() => {
                setFormState(EMPTY_TEMPLATE_FORM);
              }}
              type="button"
            >
              Reset form
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orderedTemplates.map((template) => {
          const isArchiveEntry = isArchiveTemplate(template);
          const isPinned = pinnedTemplateIds.includes(template.id);

          return (
            <article
              className="rounded-[24px] border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--pb-border-strong)]"
              key={template.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-[var(--pb-accent-soft)] px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-[var(--pb-accent)]">
                    {buildIntentBadge(template.intentType)}
                  </span>
                  {isArchiveEntry ? (
                    <span className="ml-2 rounded-full border border-[var(--pb-border)] px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-[var(--pb-text-soft)]">
                      Archive
                    </span>
                  ) : null}
                  <h3 className="mt-3 text-lg font-semibold text-[var(--pb-text)]">
                    {template.originTitle ?? template.id}
                  </h3>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--pb-text-subtle)]">
                    {template.id}
                  </p>
                </div>
                {isArchiveEntry ? (
                  <span className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--pb-text-soft)]">
                    Read only
                  </span>
                ) : (
                  <button
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      isPinned
                        ? 'bg-[var(--pb-warning-bg)] text-[var(--pb-warning)]'
                        : 'border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] text-[var(--pb-text-soft)]'
                    }`}
                    onClick={() => {
                      void togglePinnedTemplate(template.id);
                      setStatusMessage(
                        isPinned
                          ? `Unpinned "${template.id}" and restored normal matching priority.`
                          : `Pinned "${template.id}" to the top of the library and prioritized matching.`,
                      );
                    }}
                    type="button"
                  >
                    {isPinned ? 'Pinned' : 'Pin'}
                  </button>
                )}
              </div>

              <p className="mt-3 text-sm leading-6 text-[var(--pb-text-soft)]">
                {template.description}
              </p>

              <div className="mt-4 rounded-[18px] bg-[var(--pb-surface-muted)] p-4 text-sm leading-6 text-[var(--pb-text)]">
                {buildExampleInput(template)}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {template.category ? (
                  <span className="rounded-full border border-[var(--pb-border)] px-3 py-1 text-xs text-[var(--pb-text-soft)]">
                    {template.category.replace(/_/g, ' ')}
                  </span>
                ) : null}
                {template.tags.map((tag) => (
                  <span
                    className="rounded-full border border-[var(--pb-border)] px-3 py-1 text-xs text-[var(--pb-text-soft)]"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {template.originUrl ? (
                <a
                  className="mt-4 inline-flex text-sm font-medium text-[var(--pb-accent)] hover:underline"
                  href={template.originUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open source prompt
                </a>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
