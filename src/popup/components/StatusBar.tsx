import { PIPELINE_STAGE_LABELS, POPUP_TEXT, getPipelineStatusMessage } from '../constants';
import { usePromptBridgeStore } from '../../store';

function getStatusToneClass(status: ReturnType<typeof usePromptBridgeStore.getState>['pipelineStatus']): string {
  switch (status) {
    case 'RUNNING':
      return 'text-[var(--pb-accent)] bg-[var(--pb-accent-soft)]';
    case 'WAITING_FOR_INPUT':
    case 'WAITING_FOR_CONFIRMATION':
      return 'text-[var(--pb-warning)] bg-[var(--pb-warning-bg)]';
    case 'COMPLETE':
      return 'text-[var(--pb-success)] bg-[var(--pb-success-bg)]';
    case 'ERROR':
      return 'text-[var(--pb-danger)] bg-[var(--pb-danger-bg)]';
    case 'IDLE':
    default:
      return 'text-[var(--pb-text-soft)] bg-[var(--pb-surface-muted)]';
  }
}

export default function StatusBar(): JSX.Element {
  const { pipelineStage, pipelineStatus, popupStatusMessage } = usePromptBridgeStore();

  return (
    <section className="pb-surface rounded-[24px] border px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pb-text-subtle)]">
            {POPUP_TEXT.statusBar.title}
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--pb-text-soft)]">
            {getPipelineStatusMessage(pipelineStatus, pipelineStage, popupStatusMessage)}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getStatusToneClass(pipelineStatus)}`}>
          {PIPELINE_STAGE_LABELS[pipelineStage]}
        </span>
      </div>
    </section>
  );
}
