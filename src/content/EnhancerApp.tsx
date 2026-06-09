import { ClarificationModal } from './components/ClarificationModal';
import { EnhancerButton } from './components/EnhancerButton';
import { StatusToast } from './components/StatusToast';
import { useComposerAnchor } from './hooks/useComposerAnchor';
import { useComposerObserver } from './hooks/useComposerObserver';
import { useContentPipeline } from './hooks/useContentPipeline';

export function EnhancerApp(): JSX.Element {
  const composer = useComposerObserver();
  const anchorStyle = useComposerAnchor(composer);
  const pipeline = useContentPipeline();

  return (
    <div className="pb-content-root" style={anchorStyle}>
      {pipeline.clarificationState ? (
        <ClarificationModal
          questions={pipeline.clarificationState.questions}
          onClose={pipeline.closeClarifications}
          onSubmit={pipeline.submitClarifications}
          onUseDefaults={pipeline.useDefaultClarifications}
        />
      ) : null}
      <StatusToast message={pipeline.statusMessage} isError={pipeline.isError} />
      <EnhancerButton
        isEnhancing={pipeline.isEnhancing}
        enhancedModeEnabled={pipeline.enhancedModeEnabled}
        onOptimize={() => {
          void pipeline.optimizeComposer(composer);
        }}
        onToggleEnhancedMode={(enabled) => {
          void pipeline.setEnhancedModeEnabled(enabled);
        }}
      />
    </div>
  );
}
