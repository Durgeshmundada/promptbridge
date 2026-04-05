import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import manifest from './manifest.json';

const ICON_FILE_NAMES = ['icon16.png', 'icon48.png', 'icon128.png'] as const;
const STABLE_CONTENT_RUNTIME_PATH = ['assets', 'src', 'content', 'contentScript.runtime.js'] as const;
const DIST_ENTRY_MAPPINGS = [
  {
    source: ['serviceWorker.js'],
    target: ['background', 'serviceWorker.js'],
  },
  {
    source: ['src', 'content', 'contentScript.js'],
    target: ['content', 'contentScript.js'],
  },
  {
    source: ['src', 'popup', 'index.html'],
    target: ['popup', 'index.html'],
  },
  {
    source: ['src', 'options', 'index.html'],
    target: ['options', 'index.html'],
  },
] as const;

function normalizeServiceOrigin(rawValue: string): string | null {
  const normalizedValue = rawValue.trim();

  if (!normalizedValue) {
    return null;
  }

  try {
    return new URL(normalizedValue).origin;
  } catch {
    return null;
  }
}

function getTemplateServiceOrigins(templateServiceBaseUrl: string): string[] {
  const serviceOrigins = new Set<string>([
    'http://127.0.0.1:8787',
    'http://localhost:8787',
  ]);
  const configuredOrigin = normalizeServiceOrigin(templateServiceBaseUrl);

  if (configuredOrigin) {
    serviceOrigins.add(configuredOrigin);
  }

  return [...serviceOrigins];
}

function updateConnectSrcDirective(
  contentSecurityPolicy: string,
  origins: string[],
): string {
  const connectSrcMatch = contentSecurityPolicy.match(/connect-src\s+([^;]+)/);

  if (!connectSrcMatch) {
    return `${contentSecurityPolicy}; connect-src 'self' ${origins.join(' ')}`.trim();
  }

  const existingTokens = connectSrcMatch[1]?.split(/\s+/).filter(Boolean) ?? [];
  const nextDirective = `connect-src ${[...new Set([...existingTokens, ...origins])].join(' ')}`;

  return contentSecurityPolicy.replace(connectSrcMatch[0], nextDirective);
}

function createRuntimeManifest(
  manifestContents: chrome.runtime.ManifestV3,
  templateServiceBaseUrl: string,
): chrome.runtime.ManifestV3 {
  const serviceOrigins = getTemplateServiceOrigins(templateServiceBaseUrl);
  const hostPermissions = new Set(manifestContents.host_permissions ?? []);
  const contentSecurityPolicy =
    manifestContents.content_security_policy?.extension_pages ??
    "script-src 'self'; object-src 'none'; connect-src 'self'";

  serviceOrigins.forEach((origin) => {
    hostPermissions.add(`${origin}/*`);
  });

  return {
    ...manifestContents,
    host_permissions: [...hostPermissions],
    content_security_policy: {
      ...manifestContents.content_security_policy,
      extension_pages: updateConnectSrcDirective(contentSecurityPolicy, serviceOrigins),
    },
  };
}

function createIconPathMap(baseDirectory: string): Record<'16' | '48' | '128', string> {
  return {
    '16': `${baseDirectory}/icon16.png`,
    '48': `${baseDirectory}/icon48.png`,
    '128': `${baseDirectory}/icon128.png`,
  };
}

function rewriteManifestForDistribution(
  manifestContents: chrome.runtime.ManifestV3,
): chrome.runtime.ManifestV3 {
  const existingWebAccessibleResources = manifestContents.web_accessible_resources ?? [];
  const distributedManifest: chrome.runtime.ManifestV3 = {
    ...manifestContents,
    icons: createIconPathMap('icons'),
    action: manifestContents.action
      ? {
          ...manifestContents.action,
          default_popup: 'popup/index.html',
          default_icon: createIconPathMap('icons'),
        }
      : undefined,
    background: manifestContents.background
      ? {
          ...manifestContents.background,
          service_worker: 'background/serviceWorker.js',
        }
      : undefined,
    options_ui: manifestContents.options_ui
      ? {
          ...manifestContents.options_ui,
          page: 'options/index.html',
        }
      : undefined,
    content_scripts: manifestContents.content_scripts?.map((contentScript) => ({
      ...contentScript,
      js: contentScript.js?.map((filePath) =>
        filePath.endsWith('contentScript.js') ? 'content/contentScript.js' : filePath,
      ),
    })),
    web_accessible_resources: [
      ...existingWebAccessibleResources,
      {
        resources: [STABLE_CONTENT_RUNTIME_PATH.join('/')],
        matches: ['<all_urls>'],
      },
    ],
  };

  return distributedManifest;
}

function finalizeDistribution(): Plugin {
  return {
    name: 'finalize-distribution',
    apply: 'build',
    async closeBundle(): Promise<void> {
      const projectRoot = process.cwd();
      const distDirectory = path.resolve(projectRoot, 'dist');
      const nestedIconDirectory = path.resolve(distDirectory, 'src', 'assets', 'icons');
      const rootIconDirectory = path.resolve(distDirectory, 'icons');

      await mkdir(nestedIconDirectory, { recursive: true });
      await mkdir(rootIconDirectory, { recursive: true });

      await Promise.all(
        ICON_FILE_NAMES.map(async (fileName) => {
          const source = path.resolve(projectRoot, 'src', 'assets', 'icons', fileName);
          await Promise.all([
            copyFile(source, path.resolve(nestedIconDirectory, fileName)),
            copyFile(source, path.resolve(rootIconDirectory, fileName)),
          ]);
        }),
      );

      await Promise.all(
        DIST_ENTRY_MAPPINGS.map(async ({ source, target }) => {
          const sourcePath = path.resolve(distDirectory, ...source);
          const targetPath = path.resolve(distDirectory, ...target);

          await mkdir(path.dirname(targetPath), { recursive: true });
          await copyFile(sourcePath, targetPath);
        }),
      );

      const contentLoaderPath = path.resolve(distDirectory, 'content', 'contentScript.js');
      const contentLoaderSource = await readFile(contentLoaderPath, 'utf8');
      const contentRuntimeMatch = contentLoaderSource.match(/chrome\.runtime\.getURL\("([^"]+)"\)/);

      if (contentRuntimeMatch?.[1]) {
        const hashedRuntimePath = path.resolve(distDirectory, contentRuntimeMatch[1]);
        const stableRuntimePath = path.resolve(distDirectory, ...STABLE_CONTENT_RUNTIME_PATH);

        await mkdir(path.dirname(stableRuntimePath), { recursive: true });
        await copyFile(hashedRuntimePath, stableRuntimePath);
        await writeFile(
          contentLoaderPath,
          `(async()=>{await import(chrome.runtime.getURL("${STABLE_CONTENT_RUNTIME_PATH.join('/')}"))})();\n`,
          'utf8',
        );
      }

      const manifestPath = path.resolve(distDirectory, 'manifest.json');
      const manifestContents = JSON.parse(
        await readFile(manifestPath, 'utf8'),
      ) as chrome.runtime.ManifestV3;
      const distributedManifest = rewriteManifestForDistribution(manifestContents);

      await writeFile(manifestPath, `${JSON.stringify(distributedManifest, null, 2)}\n`, 'utf8');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const templateServiceBaseUrl =
    env.PROMPTBRIDGE_TEMPLATE_SERVICE_BASE_URL ||
    env.VITE_PROMPTBRIDGE_TEMPLATE_SERVICE_BASE_URL ||
    'http://127.0.0.1:8787';
  const geminiKeyDefines = Object.fromEntries(
    Array.from({ length: 7 }, (_, index) => {
      const slot = index + 1;
      const envValue =
        env[`PROMPTBRIDGE_GEMINI_API_KEY_${slot}`] ||
        env[`VITE_PROMPTBRIDGE_GEMINI_API_KEY_${slot}`] ||
        '';

      return [
        [`__PROMPTBRIDGE_GEMINI_API_KEY_${slot}__`, JSON.stringify(envValue)],
        [
          `globalThis.__PROMPTBRIDGE_GEMINI_API_KEY_${slot}__`,
          JSON.stringify(envValue),
        ],
      ];
    }).flat(),
  );

  return {
    define: {
      ...geminiKeyDefines,
      __PROMPTBRIDGE_TEMPLATE_SERVICE_BASE_URL__: JSON.stringify(templateServiceBaseUrl),
      'globalThis.__PROMPTBRIDGE_TEMPLATE_SERVICE_BASE_URL__': JSON.stringify(
        templateServiceBaseUrl,
      ),
    },
    plugins: [
      react(),
      webExtension({
        manifest: createRuntimeManifest(
          manifest as chrome.runtime.ManifestV3,
          templateServiceBaseUrl,
        ),
      }),
      finalizeDistribution(),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
