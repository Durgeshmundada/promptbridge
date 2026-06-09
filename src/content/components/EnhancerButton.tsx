interface EnhancerButtonProps {
  isEnhancing: boolean;
  enhancedModeEnabled: boolean;
  onOptimize: () => void;
  onToggleEnhancedMode: (enabled: boolean) => void;
}

export function EnhancerButton({
  isEnhancing,
  enhancedModeEnabled,
  onOptimize,
  onToggleEnhancedMode,
}: EnhancerButtonProps): JSX.Element {
  return (
    <div className="pb-content-panel">
      <button
        className="pb-content-button"
        disabled={isEnhancing}
        type="button"
        onClick={onOptimize}
      >
        {isEnhancing ? 'Optimizing...' : 'Optimize Prompt'}
      </button>
      <label className="pb-content-toggle">
        <input
          checked={enhancedModeEnabled}
          type="checkbox"
          onChange={(event) => {
            onToggleEnhancedMode(event.target.checked);
          }}
        />
        <span>Enhanced mode</span>
      </label>
    </div>
  );
}
