import type { SessionNode } from '../../types';

const DEFAULT_MEMORY_DEPTH = 10;
const FILE_NAME_PATTERN =
  /\b(?:[\w-]+[\\/])*(?:[\w-]+\.)+(?:ts|tsx|js|jsx|json|md|py|java|kt|swift|go|rs|rb|php|css|scss|html|sql|yaml|yml|toml|sh)\b/gi;
const URL_PATTERN = /\bhttps?:\/\/[^\s)]+/gi;
const VERSION_PATTERN = /\bv?\d+(?:\.\d+){1,3}\b/g;
const ACRONYM_PATTERN = /\b[A-Z]{2,}\b/g;
const IDENTIFIER_PATTERN = /\b[A-Za-z]+(?:[A-Z][a-z0-9]+)+\b/g;
const PROPER_NAME_PATTERN =
  /\b(?:React|TypeScript|JavaScript|Python|Node\.js|Next\.js|Vue|Angular|OpenAI|Anthropic|Gemini|Postgres|MongoDB)\b/gi;
const QUOTED_PHRASE_PATTERN = /["']([^"']{3,60})["']/g;
const IGNORED_ENTITIES = new Set(['promptbridge']);

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractMatches(pattern: RegExp, value: string, captureGroup = 0): string[] {
  return unique(
    [...value.matchAll(pattern)].map((match) => {
      return match[captureGroup] ?? match[0];
    }),
  );
}

function normalizeEntity(entity: string): string {
  return entity.toLowerCase();
}

function stripPromptingBoilerplate(text: string): string {
  return text.replace(/\n{2,}PromptBridge Output Contract:[\s\S]*$/i, '').trim();
}

function extractKeyEntitiesFromText(text: string): string[] {
  const normalizedText = stripPromptingBoilerplate(text);
  const combinedEntities = [
    ...extractMatches(FILE_NAME_PATTERN, normalizedText),
    ...extractMatches(URL_PATTERN, normalizedText),
    ...extractMatches(VERSION_PATTERN, normalizedText),
    ...extractMatches(ACRONYM_PATTERN, normalizedText),
    ...extractMatches(IDENTIFIER_PATTERN, normalizedText),
    ...extractMatches(PROPER_NAME_PATTERN, normalizedText),
    ...extractMatches(QUOTED_PHRASE_PATTERN, normalizedText, 1),
  ];

  return unique(combinedEntities)
    .filter((entity) => !IGNORED_ENTITIES.has(normalizeEntity(entity)))
    .slice(0, 12);
}

function normalizeNode(node: SessionNode): SessionNode {
  const extractedEntities = extractKeyEntitiesFromText(`${node.enrichedPrompt} ${node.rawResponse}`);
  const keyEntities = unique([...node.keyEntities, ...extractedEntities]);

  return {
    ...node,
    keyEntities,
  };
}

function sortByTimestampDescending(left: SessionNode, right: SessionNode): number {
  return new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
}

function formatExcerpt(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= 140 ? normalized : `${normalized.slice(0, 137)}...`;
}

/**
 * Builds a lightweight memory graph by linking the new session node to prior nodes with overlapping entities.
 */
export function buildSessionMemoryGraph(
  newNode: SessionNode,
  existingNodes: SessionNode[],
  maxDepth = DEFAULT_MEMORY_DEPTH,
): { relevantContext: string; updatedNodes: SessionNode[] } {
  const normalizedNewNode = normalizeNode(newNode);
  const normalizedExistingNodes = existingNodes
    .filter((node) => node.promptId !== newNode.promptId)
    .map((node) => normalizeNode(node));

  const normalizedNewEntities = new Set(normalizedNewNode.keyEntities.map(normalizeEntity));

  const matchingNodes = normalizedExistingNodes
    .map((node) => {
      const sharedEntities = node.keyEntities.filter((entity) =>
        normalizedNewEntities.has(normalizeEntity(entity)),
      );

      return {
        node,
        sharedEntities: unique(sharedEntities),
      };
    })
    .filter((entry) => entry.sharedEntities.length > 0)
    .sort((left, right) => sortByTimestampDescending(left.node, right.node))
    .slice(0, 3);

  const relevantContext =
    matchingNodes.length === 0
      ? ''
      : [
          'Relevant session context:',
          ...matchingNodes.map(({ node, sharedEntities }) => {
            return `- [${node.timestamp}] ${node.intent} (${node.promptId}) shared entities: ${sharedEntities.join(
              ', ',
            )}. Prior prompt: ${formatExcerpt(node.enrichedPrompt)}`;
          }),
        ].join('\n');

  const updatedNodes = [normalizedNewNode, ...normalizedExistingNodes]
    .sort(sortByTimestampDescending)
    .slice(0, maxDepth);

  return {
    relevantContext,
    updatedNodes,
  };
}
