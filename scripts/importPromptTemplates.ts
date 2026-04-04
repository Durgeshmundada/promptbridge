import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MongoClient,
  ServerApiVersion,
  type Collection,
} from 'mongodb';
import { classifyIntent } from '../src/pipeline/layer1/intentClassifier';
import { TEMPLATE_LIBRARY } from '../src/pipeline/layer1/templateMatcher';
import { IntentType } from '../src/types';
import type { PromptTemplate } from '../src/types';

interface ImportedTemplateDocument extends PromptTemplate {
  category: string;
  createdAt: string;
  importGroup: 'claude_code_system_prompts' | 'promptbridge_builtin';
  isActive: boolean;
  originPath?: string;
  originRepo?: string;
  originTitle?: string;
  originUrl?: string;
  source: 'external' | 'seed';
  updatedAt: string;
}

interface PromptFileMetadata {
  description: string;
  title: string;
}

const CLAUDE_PROMPTS_REPOSITORY_URL =
  'https://github.com/Piebald-AI/claude-code-system-prompts.git';
const CLAUDE_PROMPTS_REPOSITORY_WEB_URL =
  'https://github.com/Piebald-AI/claude-code-system-prompts/tree/main/system-prompts';
const LOCAL_REPOSITORY_DIRECTORY = path.resolve(
  process.cwd(),
  '.tmp',
  'claude-code-system-prompts',
);
const LOCAL_PROMPTS_DIRECTORY = path.resolve(LOCAL_REPOSITORY_DIRECTORY, 'system-prompts');
const DEFAULT_DATABASE_NAME = 'promptbridge';
const DEFAULT_COLLECTION_NAME = 'templates';
const EXTERNAL_TEMPLATE_WEIGHT = 0.6;

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim() ?? '';

  if (!value) {
    throw new Error(`Missing required environment variable "${name}".`);
  }

  return value;
}

function buildCollection(client: MongoClient): Collection<ImportedTemplateDocument> {
  const databaseName = process.env.MONGODB_DB_NAME?.trim() || DEFAULT_DATABASE_NAME;
  const collectionName =
    process.env.MONGODB_TEMPLATES_COLLECTION?.trim() || DEFAULT_COLLECTION_NAME;

  return client.db(databaseName).collection<ImportedTemplateDocument>(collectionName);
}

async function ensurePromptRepository(): Promise<void> {
  if (existsSync(LOCAL_PROMPTS_DIRECTORY)) {
    return;
  }

  await mkdir(path.dirname(LOCAL_REPOSITORY_DIRECTORY), { recursive: true });
  execFileSync(
    'git',
    ['clone', '--depth', '1', CLAUDE_PROMPTS_REPOSITORY_URL, LOCAL_REPOSITORY_DIRECTORY],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
    },
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractMetadata(markdown: string, fallbackFileName: string): PromptFileMetadata {
  const metadataBlockMatch = markdown.match(/^<!--([\s\S]*?)-->/);
  const metadataBlock = metadataBlockMatch?.[1] ?? '';
  const titleMatch = metadataBlock.match(/name:\s*'([^']+)'/);
  const descriptionMatch = metadataBlock.match(/description:\s*([^\r\n]+)/);
  const fallbackTitle = fallbackFileName
    .replace(/\.md$/i, '')
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

  return {
    title: titleMatch?.[1]?.trim() || fallbackTitle,
    description:
      descriptionMatch?.[1]?.trim() ||
      `Imported external prompt template from ${fallbackFileName}.`,
  };
}

function detectCategory(fileName: string): string {
  if (fileName.startsWith('agent-prompt-')) {
    return 'agent_prompt';
  }

  if (fileName.startsWith('system-prompt-')) {
    return 'system_prompt';
  }

  if (fileName.startsWith('system-reminder-')) {
    return 'system_reminder';
  }

  if (fileName.startsWith('tool-description-')) {
    return 'tool_description';
  }

  if (fileName.startsWith('tool-parameter-')) {
    return 'tool_parameter';
  }

  if (fileName.startsWith('skill-')) {
    return 'skill';
  }

  if (fileName.startsWith('data-')) {
    return 'reference_data';
  }

  return 'external_prompt';
}

function mapCategoryToIntent(category: string): IntentType {
  switch (category) {
    case 'agent_prompt':
    case 'skill':
      return IntentType.CODING;
    case 'tool_description':
    case 'tool_parameter':
      return IntentType.COMMAND_SYSTEM;
    case 'reference_data':
      return IntentType.RESEARCH;
    case 'system_prompt':
    case 'system_reminder':
    case 'external_prompt':
    default:
      return IntentType.GENERAL;
  }
}

function buildTags(fileName: string, category: string): string[] {
  const tokens = fileName
    .replace(/\.md$/i, '')
    .split('-')
    .filter((token) => token.length > 2);

  return [...new Set(['external', 'claude-code', category, ...tokens])].slice(0, 12);
}

function stripLeadingMetadata(markdown: string): string {
  return markdown.replace(/^<!--[\s\S]*?-->\s*/, '').trim();
}

function inferExternalIntent(
  fileName: string,
  metadata: PromptFileMetadata,
  category: string,
  rawContent: string,
): IntentType {
  const inferenceInput = [
    `File name: ${fileName}`,
    `Category: ${category.replace(/_/g, ' ')}`,
    `Title: ${metadata.title}`,
    `Description: ${metadata.description}`,
    rawContent.slice(0, 2400),
  ].join('\n');
  const classifiedIntent = classifyIntent(inferenceInput).intent;

  if (classifiedIntent !== IntentType.GENERAL) {
    return classifiedIntent;
  }

  return mapCategoryToIntent(category);
}

function buildExternalTemplateBody(
  metadata: PromptFileMetadata,
  category: string,
  rawContent: string,
): string {
  return [
    'Persona: {{persona_context}}',
    'Domain context: {{domain_context}}',
    `Reference category: ${category.replace(/_/g, ' ')}`,
    'Task: Use this imported reference to help with {{task}}.',
    'Context: {{context}}',
    'Constraints: {{constraints}}',
    'Audience: {{audience}}',
    'Output format: {{output_format}}',
    'Length: {{length_constraint}}',
    '',
    `Reference title: ${metadata.title}`,
    `Reference summary: ${metadata.description}`,
    '',
    'Reference prompt content:',
    rawContent,
  ].join('\n');
}

function buildExternalTemplateDocument(
  fileName: string,
  markdown: string,
  now: string,
): ImportedTemplateDocument {
  const metadata = extractMetadata(markdown, fileName);
  const category = detectCategory(fileName);
  const promptBody = stripLeadingMetadata(markdown);
  const intentType = inferExternalIntent(fileName, metadata, category, promptBody);

  return {
    id: `claude-code-${slugify(fileName.replace(/\.md$/i, ''))}`,
    intentType,
    template: buildExternalTemplateBody(metadata, category, promptBody),
    description: `${metadata.description} Imported from the Claude Code system prompt archive.`,
    tags: buildTags(fileName, category),
    weight: EXTERNAL_TEMPLATE_WEIGHT,
    category,
    createdAt: now,
    importGroup: 'claude_code_system_prompts',
    isActive: true,
    originPath: `system-prompts/${fileName}`,
    originRepo: CLAUDE_PROMPTS_REPOSITORY_URL,
    originTitle: metadata.title,
    originUrl: `${CLAUDE_PROMPTS_REPOSITORY_WEB_URL}/${fileName}`,
    source: 'external',
    updatedAt: now,
  };
}

function buildBuiltinTemplateDocument(
  template: PromptTemplate,
  now: string,
): ImportedTemplateDocument {
  return {
    ...template,
    category: 'promptbridge_builtin',
    createdAt: now,
    importGroup: 'promptbridge_builtin',
    isActive: true,
    originRepo: 'local',
    originTitle: template.id,
    source: 'seed',
    updatedAt: now,
  };
}

async function readClaudePromptDocuments(now: string): Promise<ImportedTemplateDocument[]> {
  const fileNames = (await readdir(LOCAL_PROMPTS_DIRECTORY))
    .filter((fileName) => fileName.endsWith('.md'))
    .sort((left, right) => left.localeCompare(right));

  return await Promise.all(
    fileNames.map(async (fileName) => {
      const filePath = path.resolve(LOCAL_PROMPTS_DIRECTORY, fileName);
      const markdown = await readFile(filePath, 'utf8');
      return buildExternalTemplateDocument(fileName, markdown, now);
    }),
  );
}

async function upsertTemplates(
  collection: Collection<ImportedTemplateDocument>,
  templates: ImportedTemplateDocument[],
): Promise<void> {
  if (templates.length === 0) {
    return;
  }

  await collection.bulkWrite(
    templates.map((template) => {
      const { createdAt, ...updatableFields } = template;

      return {
        updateOne: {
          filter: { id: template.id },
          update: {
            $set: updatableFields,
            $setOnInsert: {
              createdAt,
            },
          },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );
}

async function countTemplates(
  collection: Collection<ImportedTemplateDocument>,
): Promise<{
  activeBuiltinCount: number;
  activeExternalCount: number;
  externalCount: number;
  inactiveExternalCount: number;
  totalCount: number;
}> {
  const [totalCount, externalCount, activeBuiltinCount, activeExternalCount, inactiveExternalCount] = await Promise.all([
    collection.countDocuments(),
    collection.countDocuments({ importGroup: 'claude_code_system_prompts' }),
    collection.countDocuments({
      importGroup: 'promptbridge_builtin',
      isActive: true,
    }),
    collection.countDocuments({
      importGroup: 'claude_code_system_prompts',
      isActive: true,
    }),
    collection.countDocuments({
      importGroup: 'claude_code_system_prompts',
      isActive: false,
    }),
  ]);

  return {
    totalCount,
    externalCount,
    activeBuiltinCount,
    activeExternalCount,
    inactiveExternalCount,
  };
}

async function main(): Promise<void> {
  await ensurePromptRepository();

  const mongoUri = requireEnvironmentValue('MONGODB_URI');
  const now = new Date().toISOString();
  const client = new MongoClient(mongoUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();

  try {
    const collection = buildCollection(client);
    const [externalTemplates, builtinTemplates] = await Promise.all([
      readClaudePromptDocuments(now),
      Promise.resolve(TEMPLATE_LIBRARY.map((template) => buildBuiltinTemplateDocument(template, now))),
    ]);
    const allTemplates = [...builtinTemplates, ...externalTemplates];

    await upsertTemplates(collection, allTemplates);

    const counts = await countTemplates(collection);

    console.info(
      JSON.stringify(
        {
          ok: true,
          importedBuiltinTemplates: builtinTemplates.length,
          importedExternalTemplates: externalTemplates.length,
          totalTemplatesInCollection: counts.totalCount,
          activeBuiltinTemplatesInCollection: counts.activeBuiltinCount,
          activeExternalTemplatesInCollection: counts.activeExternalCount,
          inactiveExternalTemplatesInCollection: counts.inactiveExternalCount,
          externalTemplatesInCollection: counts.externalCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown import error.';
  console.error(`[PromptBridge][TemplateImport] ${message}`);
  process.exitCode = 1;
});
