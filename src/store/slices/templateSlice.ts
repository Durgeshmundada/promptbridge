import type { StateCreator } from 'zustand';
import type { PromptTemplate } from '../../types';
import { savePinnedTemplateIds, savePromptTemplates } from '../../utils/storage';
import { saveTemplateToRuntime } from '../../utils/templateServiceRuntime';
import { cloneTemplates, createInitialState, getChangedTemplates } from '../helpers';
import type { PromptBridgeState, TemplateSlice } from '../types';

export function createTemplateSlice(
  defaultTemplates: PromptTemplate[],
): StateCreator<PromptBridgeState, [], [], TemplateSlice> {
  const initialState = createInitialState(defaultTemplates);

  return (set, get) => ({
    templates: initialState.templates,
    pinnedTemplateIds: initialState.pinnedTemplateIds,
    setTemplates: (templates) => {
      set({ templates: cloneTemplates(templates) });
    },
    setPinnedTemplateIds: (pinnedTemplateIds) => {
      set({ pinnedTemplateIds: [...new Set(pinnedTemplateIds)] });
    },
    saveTemplatesToStorage: async (templates) => {
      const previousTemplates = get().templates;
      await savePromptTemplates(templates);
      const changedTemplates = getChangedTemplates(previousTemplates, templates);

      await Promise.all(
        changedTemplates.map(async (template) => {
          await saveTemplateToRuntime(template);
        }),
      );

      get().setTemplates(templates);
    },
    savePinnedTemplateIdsToStorage: async (templateIds) => {
      const nextPinnedTemplateIds = [...new Set(templateIds)];
      await savePinnedTemplateIds(nextPinnedTemplateIds);
      get().setPinnedTemplateIds(nextPinnedTemplateIds);
    },
    togglePinnedTemplate: async (templateId) => {
      const { pinnedTemplateIds, savePinnedTemplateIdsToStorage } = get();
      const nextPinnedTemplateIds = pinnedTemplateIds.includes(templateId)
        ? pinnedTemplateIds.filter((pinnedTemplateId) => pinnedTemplateId !== templateId)
        : [templateId, ...pinnedTemplateIds];

      await savePinnedTemplateIdsToStorage(nextPinnedTemplateIds);
    },
  });
}
