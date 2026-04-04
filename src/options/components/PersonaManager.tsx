import { useEffect, useRef, useState } from 'react';
import { usePromptBridgeStore } from '../../store';
import type { Persona } from '../../types';

export interface PersonaManagerProps {}

interface PersonaFormState {
  id: string;
  name: string;
  role: string;
  expertise: string;
  preferredStyle: string;
  domainContext: string;
}

const EMPTY_PERSONA_FORM: PersonaFormState = {
  id: '',
  name: '',
  role: '',
  expertise: '',
  preferredStyle: '',
  domainContext: '',
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'PromptBridge could not update the persona library.';
}

function createFormState(persona: Persona | null): PersonaFormState {
  if (!persona) {
    return EMPTY_PERSONA_FORM;
  }

  return {
    id: persona.id,
    name: persona.name,
    role: persona.role,
    expertise: persona.expertise.join(', '),
    preferredStyle: persona.preferredStyle,
    domainContext: persona.domainContext,
  };
}

function downloadTextFile(fileName: string, content: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  URL.revokeObjectURL(url);
}

function isPersona(value: unknown): value is Persona {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.role === 'string' &&
    Array.isArray(candidate.expertise) &&
    candidate.expertise.every((expertiseItem) => typeof expertiseItem === 'string') &&
    typeof candidate.preferredStyle === 'string' &&
    typeof candidate.domainContext === 'string'
  );
}

function isPersonaArray(value: unknown): value is Persona[] {
  return Array.isArray(value) && value.every((item) => isPersona(item));
}

export default function PersonaManager(_props: PersonaManagerProps): JSX.Element {
  const {
    activePersona,
    personas,
    settings,
    savePersonasToStorage,
    saveSettingsToStorage,
  } = usePromptBridgeStore();
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(activePersona?.id ?? personas[0]?.id ?? '');
  const [formState, setFormState] = useState<PersonaFormState>(createFormState(activePersona ?? personas[0] ?? null));
  const [statusMessage, setStatusMessage] = useState(
    'Create focused personas for different domains and switch them instantly.',
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const selectedPersona =
      personas.find((persona) => persona.id === selectedPersonaId) ?? activePersona ?? personas[0] ?? null;

    setFormState(createFormState(selectedPersona));
  }, [activePersona, personas, selectedPersonaId]);

  const handleSavePersona = async (): Promise<void> => {
    const normalizedId = formState.id.trim();
    const normalizedName = formState.name.trim();
    const normalizedRole = formState.role.trim();

    if (!normalizedId || !normalizedName || !normalizedRole) {
      setStatusMessage('Persona id, name, and role are required.');
      return;
    }

    const nextPersona: Persona = {
      id: normalizedId,
      name: normalizedName,
      role: normalizedRole,
      expertise: formState.expertise
        .split(',')
        .map((expertiseItem) => expertiseItem.trim())
        .filter(Boolean),
      preferredStyle: formState.preferredStyle.trim() || 'clear and helpful',
      domainContext: formState.domainContext.trim() || 'General PromptBridge assistance.',
    };

    const nextPersonas = personas.some((persona) => persona.id === normalizedId)
      ? personas.map((persona) => (persona.id === normalizedId ? nextPersona : persona))
      : [nextPersona, ...personas];

    try {
      await savePersonasToStorage(nextPersonas);
      setSelectedPersonaId(nextPersona.id);
      setStatusMessage(`Saved persona "${nextPersona.name}".`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  };

  const handleDeletePersona = async (personaId: string): Promise<void> => {
    const nextPersonas = personas.filter((persona) => persona.id !== personaId);
    const fallbackPersona = nextPersonas[0] ?? null;

    try {
      await savePersonasToStorage(nextPersonas);

      if (settings.activePersonaId === personaId && fallbackPersona) {
        await saveSettingsToStorage({
          ...settings,
          activePersonaId: fallbackPersona.id,
        });
      }

      setSelectedPersonaId(fallbackPersona?.id ?? '');
      setFormState(createFormState(fallbackPersona));
      setStatusMessage(`Deleted persona "${personaId}".`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  };

  const handleQuickSwitch = async (persona: Persona): Promise<void> => {
    try {
      await saveSettingsToStorage({
        ...settings,
        activePersonaId: persona.id,
      });
      setSelectedPersonaId(persona.id);
      setStatusMessage(`Switched active persona to "${persona.name}".`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsedJson: unknown = JSON.parse(await file.text());

      if (!isPersonaArray(parsedJson)) {
        throw new Error('The selected file does not contain a valid Persona array.');
      }

      await savePersonasToStorage(parsedJson);
      setSelectedPersonaId(parsedJson[0]?.id ?? '');
      setStatusMessage(`Imported ${parsedJson.length.toString()} persona records.`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      event.target.value = '';
    }
  };

  return (
    <section className="pb-surface rounded-[28px] border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pb-accent)]">
            Persona Manager
          </p>
          <h2 className="mt-2 font-[var(--pb-font-display)] text-2xl text-[var(--pb-text)]">
            Tailor PromptBridge collaborators
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--pb-text-soft)]">
            Build specialized personas for engineering, research, operations, or your own domain
            workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
            onClick={() => {
              setSelectedPersonaId('');
              setFormState(EMPTY_PERSONA_FORM);
            }}
            type="button"
          >
            New persona
          </button>
          <button
            className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
            onClick={() => {
              downloadTextFile(
                'promptbridge-personas.json',
                JSON.stringify(personas, null, 2),
                'application/json',
              );
            }}
            type="button"
          >
            Export JSON
          </button>
          <button
            className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
            onClick={() => {
              fileInputRef.current?.click();
            }}
            type="button"
          >
            Import JSON
          </button>
          <input
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              void handleImportFile(event);
            }}
            ref={fileInputRef}
            type="file"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="grid gap-4">
          {personas.map((persona) => {
            const isActive = activePersona?.id === persona.id;

            return (
              <article
                className={`rounded-[24px] border p-5 ${
                  isActive
                    ? 'border-[var(--pb-accent)] bg-[var(--pb-accent-soft)]'
                    : 'border-[var(--pb-border)] bg-[var(--pb-surface-strong)]'
                }`}
                key={persona.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="m-0 text-lg font-semibold text-[var(--pb-text)]">
                      {persona.name}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--pb-text-soft)]">{persona.role}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-full border border-[var(--pb-border)] px-3 py-2 text-xs font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
                      onClick={() => {
                        setSelectedPersonaId(persona.id);
                        setFormState(createFormState(persona));
                      }}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-full bg-[var(--pb-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
                      onClick={() => {
                        void handleQuickSwitch(persona);
                      }}
                      type="button"
                    >
                      Quick switch
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {persona.expertise.map((expertiseItem) => (
                    <span
                      className="rounded-full border border-[var(--pb-border)] px-3 py-1 text-xs text-[var(--pb-text-soft)]"
                      key={`${persona.id}-${expertiseItem}`}
                    >
                      {expertiseItem}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="m-0 text-sm leading-6 text-[var(--pb-text-soft)]">
                    {persona.domainContext}
                  </p>
                  <button
                    className="rounded-full bg-[var(--pb-danger-bg)] px-3 py-2 text-xs font-semibold text-[var(--pb-danger)] transition hover:opacity-80"
                    onClick={() => {
                      void handleDeletePersona(persona.id);
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="rounded-[26px] border border-[var(--pb-border-strong)] bg-[var(--pb-surface-strong)] p-5">
          <h3 className="m-0 text-xl font-semibold text-[var(--pb-text)]">Edit persona</h3>
          <p className="mt-2 text-sm text-[var(--pb-text-soft)]">{statusMessage}</p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-medium text-[var(--pb-text-soft)]">
              Id
              <input
                className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    id: event.target.value,
                  }));
                }}
                type="text"
                value={formState.id}
              />
            </label>
            <label className="text-sm font-medium text-[var(--pb-text-soft)]">
              Name
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
              Role
              <input
                className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    role: event.target.value,
                  }));
                }}
                type="text"
                value={formState.role}
              />
            </label>
            <label className="text-sm font-medium text-[var(--pb-text-soft)]">
              Expertise tags
              <input
                className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
                onChange={(event) => {
                  setFormState((currentValue) => ({
                    ...currentValue,
                    expertise: event.target.value,
                  }));
                }}
                placeholder="debugging, architecture, research"
                type="text"
                value={formState.expertise}
              />
            </label>
          </div>

          <label className="mt-4 block text-sm font-medium text-[var(--pb-text-soft)]">
            Preferred style
            <input
              className="mt-2 w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
              onChange={(event) => {
                setFormState((currentValue) => ({
                  ...currentValue,
                  preferredStyle: event.target.value,
                }));
              }}
              type="text"
              value={formState.preferredStyle}
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-[var(--pb-text-soft)]">
            Domain context
            <textarea
              className="mt-2 min-h-[160px] w-full rounded-[18px] border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--pb-text)] outline-none focus:border-[var(--pb-border-strong)]"
              onChange={(event) => {
                setFormState((currentValue) => ({
                  ...currentValue,
                  domainContext: event.target.value,
                }));
              }}
              value={formState.domainContext}
            />
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-[var(--pb-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--pb-accent-strong)]"
              onClick={() => {
                void handleSavePersona();
              }}
              type="button"
            >
              Save persona
            </button>
            <button
              className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-muted)] px-4 py-2 text-sm font-semibold text-[var(--pb-text)] transition hover:border-[var(--pb-border-strong)]"
              onClick={() => {
                setSelectedPersonaId('');
                setFormState(EMPTY_PERSONA_FORM);
              }}
              type="button"
            >
              Clear form
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
