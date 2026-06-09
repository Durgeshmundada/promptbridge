import { scanForPii } from '../layer3/piiScanner';
import { requireContext, runStage } from './types';
import type { PipelineContext } from './types';

export async function runStageScanPii(ctx: PipelineContext) {
  return runStage(() => {
    const workingPrompt = requireContext(ctx.workingPrompt, 'Working prompt');
    const piiScanResult = scanForPii(workingPrompt);

    ctx.workingPrompt = piiScanResult.sanitized;
    ctx.piiRedactions = piiScanResult.redactions;
    return piiScanResult;
  });
}
