import { ImageType } from '../../../types';
import type { Layer4Error } from '../claudeVisionBridge';
import { Layer4ErrorCode } from '../claudeVisionBridge';
import { mapObjectRelationships } from '../objectRelationshipMapper';
import { installRuntimeMock } from './runtimeMock';

describe('mapObjectRelationships', () => {
  it('maps nodes, edges, and layout for a diagram image', async () => {
    installRuntimeMock(() => ({
      ok: true,
      model: 'claude-3-5-sonnet-20241022',
      stopReason: 'end_turn',
      content: JSON.stringify({
        elements: ['client node', 'API gateway', 'database'],
        relationships: ['client node sends requests to API gateway', 'API gateway queries database'],
        layout: 'left-to-right flowchart with three boxes',
        summary: 'A simple request flow from client to database',
      }),
    }));

    const result = await mapObjectRelationships({
      imageData: 'base64-image',
      imageType: ImageType.DIAGRAM,
    });

    expect(result.elements).toEqual(['client node', 'API gateway', 'database']);
    expect(result.relationships[0]).toContain('client node sends requests');
    expect(result.layout).toBe('left-to-right flowchart with three boxes');
    expect(result.summary).toBe('A simple request flow from client to database');
  });

  it('maps chart structure with axes and trends', async () => {
    installRuntimeMock(() => ({
      ok: true,
      model: 'claude-3-5-sonnet-20241022',
      stopReason: 'end_turn',
      content:
        '```json\n{"elements":["x-axis","y-axis","revenue series"],"relationships":["revenue rises from Q1 to Q4"],"layout":"single line chart with legend below","summary":"Quarterly revenue growth"}\n```',
    }));

    const result = await mapObjectRelationships({
      imageData: 'base64-image',
      imageType: ImageType.CHART_GRAPH,
    });

    expect(result.elements).toEqual(['x-axis', 'y-axis', 'revenue series']);
    expect(result.relationships).toEqual(['revenue rises from Q1 to Q4']);
    expect(result.summary).toBe('Quarterly revenue growth');
  });

  it('throws a typed error when the mapped response is not valid JSON', async () => {
    installRuntimeMock(() => ({
      ok: true,
      model: 'claude-3-5-sonnet-20241022',
      stopReason: 'end_turn',
      content: 'diagram summary only',
    }));

    await expect(
      mapObjectRelationships({
        imageData: 'base64-image',
        imageType: ImageType.DIAGRAM,
      }),
    ).rejects.toMatchObject({
      name: 'Layer4Error',
      code: Layer4ErrorCode.JSON_PARSE_FAILED,
    } satisfies Partial<Layer4Error>);
  });
});
