import cors from 'cors';
import express from 'express';
import {
  MongoClient,
  ServerApiVersion,
  type Collection,
  type OptionalUnlessRequiredId,
} from 'mongodb';
import { TEMPLATE_LIBRARY } from '../src/pipeline/layer1/templateMatcher';
import { IntentType } from '../src/types';
import type { PromptTemplate } from '../src/types';

interface StoredPromptTemplate extends PromptTemplate {
  createdAt: string;
  isActive: boolean;
  source: 'seed' | 'generated' | 'custom' | 'external';
  updatedAt: string;
}

type TemplateResponseCacheKey = 'active' | 'all';

interface TemplateResponseCacheEntry {
  templates: PromptTemplate[];
  updatedAt: number;
}

const DEFAULT_SERVER_PORT = 8787;
const DEFAULT_DATABASE_NAME = 'promptbridge';
const DEFAULT_COLLECTION_NAME = 'templates';
const TEMPLATE_ENDPOINT_PATH = '/api/templates';
const TEMPLATE_RESPONSE_CACHE_TTL_MS = 60_000;
const templateResponseCache = new Map<TemplateResponseCacheKey, TemplateResponseCacheEntry>();

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim() ?? '';

  if (!value) {
    throw new Error(`Missing required environment variable "${name}".`);
  }

  return value;
}

function parsePort(value: string | undefined): number {
  const parsedValue = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_SERVER_PORT;
  }

  return parsedValue;
}

function parseBoolean(value: string | undefined, fallbackValue: boolean): boolean {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) {
    return fallbackValue;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }

  return fallbackValue;
}

function clonePromptTemplate(template: PromptTemplate): PromptTemplate {
  return {
    ...template,
    tags: [...template.tags],
    ...(template.tfIdfVector ? { tfIdfVector: [...template.tfIdfVector] } : {}),
  };
}

function clonePromptTemplates(templates: PromptTemplate[]): PromptTemplate[] {
  return templates.map(clonePromptTemplate);
}

function getTemplateResponseCacheKey(includeInactive: boolean): TemplateResponseCacheKey {
  return includeInactive ? 'all' : 'active';
}

function isFreshTemplateResponseCache(entry: TemplateResponseCacheEntry | undefined): boolean {
  return Boolean(entry && Date.now() - entry.updatedAt < TEMPLATE_RESPONSE_CACHE_TTL_MS);
}

function readTemplateResponseCache(includeInactive: boolean): PromptTemplate[] | null {
  const cacheEntry = templateResponseCache.get(getTemplateResponseCacheKey(includeInactive));

  if (!isFreshTemplateResponseCache(cacheEntry) || !cacheEntry) {
    return null;
  }

  return clonePromptTemplates(cacheEntry.templates);
}

function writeTemplateResponseCache(
  includeInactive: boolean,
  templates: PromptTemplate[],
): void {
  const clonedTemplates = clonePromptTemplates(templates);
  const updatedAt = Date.now();

  templateResponseCache.set(getTemplateResponseCacheKey(includeInactive), {
    templates: clonedTemplates,
    updatedAt,
  });

  if (includeInactive) {
    templateResponseCache.set('active', {
      templates: clonePromptTemplates(
        clonedTemplates.filter((template) => template.isActive !== false),
      ),
      updatedAt,
    });
  }
}

function invalidateTemplateResponseCache(): void {
  templateResponseCache.clear();
}

function toPromptTemplate(document: StoredPromptTemplate): PromptTemplate {
  return {
    id: document.id,
    intentType: document.intentType,
    template: document.template,
    description: document.description,
    tags: [...document.tags],
    weight: document.weight,
    category: document.category,
    importGroup: document.importGroup,
    isActive: document.isActive,
    originTitle: document.originTitle,
    originUrl: document.originUrl,
    source: document.source,
  };
}

function normalizePromptTemplate(value: unknown): PromptTemplate | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const intentType = typeof candidate.intentType === 'string' ? candidate.intentType.trim() : '';
  const template = typeof candidate.template === 'string' ? candidate.template.trim() : '';
  const description =
    typeof candidate.description === 'string' ? candidate.description.trim() : '';
  const tags = Array.isArray(candidate.tags)
    ? candidate.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const weight = typeof candidate.weight === 'number' && Number.isFinite(candidate.weight)
    ? candidate.weight
    : 1;
  const normalizedIntentType = Object.values(IntentType).includes(intentType as IntentType)
    ? (intentType as IntentType)
    : null;

  if (!id || !normalizedIntentType || !template || !description || !template.includes('{{')) {
    return null;
  }

  return {
    id,
    intentType: normalizedIntentType,
    template,
    description,
    tags,
    weight,
  };
}

async function ensureSeedTemplates(
  collection: Collection<StoredPromptTemplate>,
): Promise<void> {
  const now = new Date().toISOString();
  const operations = TEMPLATE_LIBRARY.map((template) => ({
    updateOne: {
      filter: { id: template.id },
      update: {
        $setOnInsert: {
          ...template,
          createdAt: now,
          isActive: true,
          source: 'seed' as const,
          updatedAt: now,
        },
      },
      upsert: true,
    },
  }));

  if (operations.length === 0) {
    return;
  }

  await collection.bulkWrite(operations, { ordered: false });
}

async function createTemplateIndexes(
  collection: Collection<StoredPromptTemplate>,
): Promise<void> {
  await Promise.all([
    collection.createIndex({ id: 1 }, { unique: true }),
    collection.createIndex({ updatedAt: -1 }),
    collection.createIndex({ intentType: 1 }),
  ]);
}

function createTemplateServiceCollection(
  client: MongoClient,
): Collection<StoredPromptTemplate> {
  const databaseName = process.env.MONGODB_DB_NAME?.trim() || DEFAULT_DATABASE_NAME;
  const collectionName =
    process.env.MONGODB_TEMPLATES_COLLECTION?.trim() || DEFAULT_COLLECTION_NAME;

  return client.db(databaseName).collection<StoredPromptTemplate>(collectionName);
}

async function startServer(): Promise<void> {
  const app = express();
  const port = parsePort(process.env.PROMPTBRIDGE_SERVER_PORT);
  const mongoUri = requireEnvironmentValue('MONGODB_URI');
  const autoSeedTemplates = parseBoolean(process.env.PROMPTBRIDGE_TEMPLATE_AUTO_SEED, true);
  const mongoClient = new MongoClient(mongoUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await mongoClient.connect();
  const templateCollection = createTemplateServiceCollection(mongoClient);

  await createTemplateIndexes(templateCollection);

  if (autoSeedTemplates) {
    await ensureSeedTemplates(templateCollection);
  }

  app.use(
    cors({
      origin: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    response.json({
      ok: true,
      service: 'promptbridge-template-service',
      timestamp: new Date().toISOString(),
    });
  });

  app.get(TEMPLATE_ENDPOINT_PATH, async (_request, response) => {
    const includeInactive = _request.query.includeInactive === 'true';
    const cachedTemplates = readTemplateResponseCache(includeInactive);

    if (cachedTemplates) {
      response.json({
        ok: true,
        templates: cachedTemplates,
      });
      return;
    }

    const templates = await templateCollection
      .find(includeInactive ? {} : { isActive: true })
      .sort({ isActive: -1, weight: -1, updatedAt: -1, id: 1 })
      .toArray();
    const promptTemplates = templates.map(toPromptTemplate);

    writeTemplateResponseCache(includeInactive, promptTemplates);

    response.json({
      ok: true,
      templates: promptTemplates,
    });
  });

  app.post(TEMPLATE_ENDPOINT_PATH, async (request, response) => {
    const normalizedTemplate = normalizePromptTemplate(request.body);

    if (!normalizedTemplate) {
      response.status(400).json({
        ok: false,
        error: 'PromptBridge rejected the submitted template payload.',
      });
      return;
    }

    const now = new Date().toISOString();
    const storedTemplate: OptionalUnlessRequiredId<StoredPromptTemplate> = {
      ...normalizedTemplate,
      createdAt: now,
      isActive: true,
      source: normalizedTemplate.id.startsWith('generated-') || normalizedTemplate.id.startsWith('adapted-')
        ? 'generated'
        : 'custom',
      updatedAt: now,
    };

    await templateCollection.updateOne(
      { id: normalizedTemplate.id },
      {
        $set: {
          ...storedTemplate,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    );
    invalidateTemplateResponseCache();

    response.status(200).json({
      ok: true,
      template: normalizedTemplate,
    });
  });

  const server = app.listen(port, () => {
    console.info(
      `[PromptBridge][TemplateService] Listening on http://127.0.0.1:${port.toString()}`,
    );
  });

  const shutdown = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await mongoClient.close();
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
}

void startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown server startup error.';
  console.error(`[PromptBridge][TemplateService] ${message}`);
  process.exitCode = 1;
});
