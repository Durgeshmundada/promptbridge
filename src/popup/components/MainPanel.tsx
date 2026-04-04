import ABTester, { type AbTesterVariant } from './ABTester';
import ComplexityBadge from './ComplexityBadge';
import CommandGatePrompt from './CommandGatePrompt';
import DiffViewer from './DiffViewer';
import HistoryPreview from './HistoryPreview';
import InputArea from './InputArea';
import MicroQuestionPrompt from './MicroQuestionPrompt';
import ResponseView from './ResponseView';
import ScopeConfirmationPrompt from './ScopeConfirmationPrompt';
import StatusBar from './StatusBar';

export interface MainPanelProps {
  abComparisonVariants: AbTesterVariant[];
  isSubmitting: boolean;
  isWinnerSelectionPending: boolean;
  selectedWinnerHistoryEntryId: string | null;
  onAttachImage: (file: File) => void;
  onCancelCommandGate: () => void;
  onChooseAbWinner: (historyEntryId: string) => void;
  onConfirmCommandGate: () => void;
  onOpenOptions: () => void;
  onRemoveImage: () => void;
  onScopeSelection: (option: string) => void;
  onSubmit: () => void;
  onSubmitMicroQuestion: () => void;
  onToggleAbMode: (enabled: boolean) => void;
}

export default function MainPanel({
  abComparisonVariants,
  isSubmitting,
  isWinnerSelectionPending,
  onAttachImage,
  onCancelCommandGate,
  onChooseAbWinner,
  onConfirmCommandGate,
  onOpenOptions,
  onRemoveImage,
  onScopeSelection,
  selectedWinnerHistoryEntryId,
  onSubmit,
  onSubmitMicroQuestion,
  onToggleAbMode,
}: MainPanelProps): JSX.Element {
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <InputArea
          isSubmitting={isSubmitting}
          onAttachImage={onAttachImage}
          onRemoveImage={onRemoveImage}
          onSubmit={onSubmit}
          onToggleAbMode={onToggleAbMode}
        />
        <StatusBar />
        <MicroQuestionPrompt onSubmit={onSubmitMicroQuestion} />
        <CommandGatePrompt onCancel={onCancelCommandGate} onConfirm={onConfirmCommandGate} />
        <ScopeConfirmationPrompt onSelectOption={onScopeSelection} />
        {abComparisonVariants.length > 0 ? (
          <ABTester
            isWinnerSelectionPending={isWinnerSelectionPending}
            onChooseWinner={onChooseAbWinner}
            selectedWinnerHistoryEntryId={selectedWinnerHistoryEntryId}
            variants={abComparisonVariants}
          />
        ) : (
          <>
            <ComplexityBadge />
            <DiffViewer />
            <ResponseView />
          </>
        )}
        <HistoryPreview onViewAll={onOpenOptions} />
      </div>
    </section>
  );
}
