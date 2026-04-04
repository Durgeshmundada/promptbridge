import { act, fireEvent, render, screen } from '@testing-library/react';
import TemplateLibrary from '../TemplateLibrary';
import { usePromptBridgeStore } from '../../../store';
import { IntentType } from '../../../types';
import type { PromptTemplate } from '../../../types';
import * as templateServiceRuntime from '../../../utils/templateServiceRuntime';

jest.mock('../../../utils/templateServiceRuntime', () => ({
  ...jest.requireActual('../../../utils/templateServiceRuntime'),
  loadTemplateCatalogFromRuntime: jest.fn(),
}));

const loadTemplateCatalogFromRuntimeMock =
  templateServiceRuntime.loadTemplateCatalogFromRuntime as jest.MockedFunction<
    typeof templateServiceRuntime.loadTemplateCatalogFromRuntime
  >;

function createArchivedTemplate(): PromptTemplate {
  return {
    id: 'claude-code-agent-prompt-explore',
    intentType: IntentType.CODING,
    template:
      'Persona: {{persona_context}}\nTask: {{task}}\nContext: {{context}}\nReference prompt content:\nYou are a file search specialist.',
    description: 'Imported archive prompt for exploring codebases.',
    tags: ['external', 'claude-code', 'agent_prompt'],
    weight: 0.6,
    category: 'agent_prompt',
    importGroup: 'claude_code_system_prompts',
    isActive: false,
    originTitle: 'Agent Prompt: Explore',
    originUrl:
      'https://github.com/Piebald-AI/claude-code-system-prompts/tree/main/system-prompts/agent-prompt-explore.md',
    source: 'external',
  };
}

describe('TemplateLibrary', () => {
  beforeEach(() => {
    loadTemplateCatalogFromRuntimeMock.mockResolvedValue(null);
    act(() => {
      usePromptBridgeStore.getState().resetState();
    });
  });

  afterEach(() => {
    act(() => {
      usePromptBridgeStore.getState().resetState();
    });
  });

  it('renders all 15 default templates in the library grid', () => {
    const { container } = render(<TemplateLibrary />);

    expect(screen.getAllByText('coding-debug').length).toBeGreaterThan(0);
    expect(screen.getAllByText('step-by-step-explain').length).toBeGreaterThan(0);
    expect(screen.getAllByText('research-synthesis').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('article')).toHaveLength(15);
  });

  it('shows imported archive templates in the archive view without replacing the live library', async () => {
    loadTemplateCatalogFromRuntimeMock.mockResolvedValue([
      ...usePromptBridgeStore.getState().templates,
      createArchivedTemplate(),
    ]);

    render(<TemplateLibrary />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('Live library (15)')).toBeTruthy();
    expect(screen.getByText('Imported archive (1)')).toBeTruthy();

    fireEvent.click(screen.getByText('Imported archive (1)'));

    expect(screen.getByText('Agent Prompt: Explore')).toBeTruthy();
    expect(screen.getByText('Archive')).toBeTruthy();
    expect(screen.getByText('Read only')).toBeTruthy();
    expect(screen.getByText('Open source prompt')).toBeTruthy();
  });
});
