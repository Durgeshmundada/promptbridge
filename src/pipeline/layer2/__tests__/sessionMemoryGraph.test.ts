import { IntentType } from '../../../types';
import type { SessionNode } from '../../../types';
import { buildSessionMemoryGraph } from '../sessionMemoryGraph';

function createNode(overrides: Partial<SessionNode>): SessionNode {
  return {
    promptId: 'node-default',
    intent: IntentType.CODING,
    keyEntities: [],
    timestamp: '2026-04-04T00:00:00.000Z',
    responseQuality: 0.9,
    enrichedPrompt: 'Review React behavior in src/App.tsx.',
    rawResponse: 'Prior diagnosis.',
    ...overrides,
  };
}

describe('sessionMemoryGraph', () => {
  it('extracts new entities and links relevant prior nodes', () => {
    const newNode = createNode({
      promptId: 'new-node',
      timestamp: '2026-04-05T10:00:00.000Z',
      enrichedPrompt: 'Debug React rendering in src/App.tsx after OAuth v2.1 changes.',
      rawResponse: 'Current issue summary.',
    });
    const existingNodes = [
      createNode({
        promptId: 'prior-match',
        timestamp: '2026-04-04T09:00:00.000Z',
        enrichedPrompt: 'Review React routing in src/App.tsx.',
        rawResponse: 'Prior React diagnosis.',
      }),
      createNode({
        promptId: 'prior-other',
        timestamp: '2026-04-03T09:00:00.000Z',
        enrichedPrompt: 'Analyze legal clauses in the vendor contract.',
        rawResponse: 'Contract notes.',
      }),
    ];

    const result = buildSessionMemoryGraph(newNode, existingNodes);

    expect(result.updatedNodes[0].promptId).toBe('new-node');
    expect(result.updatedNodes[0].keyEntities).toEqual(
      expect.arrayContaining(['React', 'src/App.tsx', 'OAuth', 'v2.1']),
    );
    expect(result.relevantContext).toContain('prior-match');
    expect(result.relevantContext).toContain('React');
  });

  it('prunes nodes to the configured depth', () => {
    const newNode = createNode({
      promptId: 'node-4',
      timestamp: '2026-04-04T04:00:00.000Z',
    });
    const existingNodes = [
      createNode({ promptId: 'node-1', timestamp: '2026-04-04T01:00:00.000Z' }),
      createNode({ promptId: 'node-2', timestamp: '2026-04-04T02:00:00.000Z' }),
      createNode({ promptId: 'node-3', timestamp: '2026-04-04T03:00:00.000Z' }),
    ];

    const result = buildSessionMemoryGraph(newNode, existingNodes, 2);

    expect(result.updatedNodes).toHaveLength(2);
    expect(result.updatedNodes.map((node) => node.promptId)).toEqual(['node-4', 'node-3']);
  });

  it('returns an empty context string when there are no shared entities', () => {
    const result = buildSessionMemoryGraph(
      createNode({
        promptId: 'fresh-node',
        timestamp: '2026-04-05T12:00:00.000Z',
        enrichedPrompt: 'Assess SvelteKit deployment on Vercel.',
        rawResponse: 'Deployment request.',
      }),
      [
        createNode({
          promptId: 'history-node',
          enrichedPrompt: 'Review indemnity language in the reseller agreement.',
          rawResponse: 'Legal summary.',
        }),
      ],
    );

    expect(result.relevantContext).toBe('');
  });
});
