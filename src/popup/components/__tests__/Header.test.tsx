import { act, render, screen } from '@testing-library/react';
import Header from '../Header';
import { usePromptBridgeStore } from '../../../store';
import type { Persona } from '../../../types';

const DEV_MODE_PERSONA: Persona = {
  id: 'dev-mode-persona',
  name: 'Dev Mode',
  role: 'Senior Java Engineer',
  expertise: ['Spring Boot', 'transaction management', 'fintech backend'],
  preferredStyle: 'terse technical',
  domainContext: 'fintech backend',
};

describe('Header', () => {
  beforeEach(() => {
    act(() => {
      usePromptBridgeStore.getState().resetState();
      usePromptBridgeStore.getState().setPersonas([
        ...usePromptBridgeStore.getState().personas,
        DEV_MODE_PERSONA,
      ]);
      usePromptBridgeStore.getState().applySettings({
        ...usePromptBridgeStore.getState().settings,
        activePersonaId: DEV_MODE_PERSONA.id,
      });
      usePromptBridgeStore.getState().setPopupVersion('1.0.0');
    });
  });

  afterEach(() => {
    act(() => {
      usePromptBridgeStore.getState().resetState();
    });
  });

  it('shows the active persona badge in the popup header', () => {
    render(
      <Header
        onOpenOptions={() => undefined}
        onToggleTheme={() => undefined}
        onUpdatePersona={() => undefined}
        onUpdateTargetModel={() => undefined}
        resolvedTheme="light"
      />,
    );

    const devModeElements = screen.getAllByText('Dev Mode');
    expect(devModeElements.some((element) => element.tagName === 'SPAN')).toBe(true);
    expect(screen.getByDisplayValue('Dev Mode')).toBeTruthy();
  });
});
