const { spawn }: typeof import('node:child_process') = require('node:child_process');
const { createWriteStream }: typeof import('node:fs') = require('node:fs');
const { access, readFile, readdir, rm, stat }: typeof import('node:fs/promises') = require('node:fs/promises');
const path: typeof import('node:path') = require('node:path');
const yazl: typeof import('yazl') = require('yazl');

const DIST_DIRECTORY = path.resolve('dist');
const REQUIRED_DIST_PATHS = [
  'manifest.json',
  'background/serviceWorker.js',
  'content/contentScript.js',
  'popup/index.html',
  'options/index.html',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
] as const;

interface PackageMetadata {
  version: string;
}

interface CommandDefinition {
  command: string;
  args: string[];
}

async function readPackageMetadata(): Promise<PackageMetadata> {
  const packageJsonPath = path.resolve('package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as PackageMetadata;

  return packageJson;
}

function getBuildCommands(): CommandDefinition[] {
  return process.platform === 'win32'
    ? [
        { command: 'corepack.cmd', args: ['pnpm', 'build'] },
        { command: 'pnpm.cmd', args: ['build'] },
      ]
    : [
        { command: 'corepack', args: ['pnpm', 'build'] },
        { command: 'pnpm', args: ['build'] },
      ];
}

async function runCommandSequence(commands: CommandDefinition[]): Promise<void> {
  let lastError: Error | null = null;

  for (const commandDefinition of commands) {
    try {
      await new Promise<void>((resolve, reject) => {
        const childProcess = spawn(commandDefinition.command, commandDefinition.args, {
          cwd: process.cwd(),
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });

        childProcess.on('error', (error) => {
          reject(error);
        });

        childProcess.on('exit', (exitCode) => {
          if (exitCode === 0) {
            resolve();
            return;
          }

          reject(
            new Error(
              `${commandDefinition.command} ${commandDefinition.args.join(' ')} exited with code ${String(exitCode)}.`,
            ),
          );
        });
      });

      return;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error('Unknown command execution failure.');
    }
  }

  throw lastError ?? new Error('PromptBridge packaging could not run the build command.');
}

async function verifyDistLayout(): Promise<void> {
  await Promise.all(
    REQUIRED_DIST_PATHS.map(async (relativePath) => {
      const absolutePath = path.resolve(DIST_DIRECTORY, relativePath);
      await access(absolutePath);
    }),
  );
}

async function addDirectoryToZip(
  zipFile: InstanceType<typeof yazl.ZipFile>,
  sourceDirectory: string,
  zipDirectory: string,
): Promise<void> {
  const directoryEntries = await readdir(sourceDirectory, { withFileTypes: true });

  for (const directoryEntry of directoryEntries) {
    const sourcePath = path.join(sourceDirectory, directoryEntry.name);
    const zipPath = path.posix.join(zipDirectory, directoryEntry.name);

    if (directoryEntry.isDirectory()) {
      await addDirectoryToZip(zipFile, sourcePath, zipPath);
      continue;
    }

    if (directoryEntry.isFile()) {
      if (directoryEntry.name.toLowerCase().endsWith('.zip')) {
        continue;
      }

      const fileStats = await stat(sourcePath);
      zipFile.addFile(sourcePath, zipPath, {
        mtime: fileStats.mtime,
        mode: fileStats.mode,
      });
    }
  }
}

async function createDistributionZip(zipFilePath: string): Promise<void> {
  await rm(zipFilePath, { force: true });

  const zipFile = new yazl.ZipFile();
  const outputStream = createWriteStream(zipFilePath);

  await new Promise<void>((resolve, reject) => {
    zipFile.outputStream.pipe(outputStream);
    outputStream.on('close', resolve);
    outputStream.on('error', reject);
    zipFile.outputStream.on('error', reject);

    void addDirectoryToZip(zipFile, DIST_DIRECTORY, 'dist')
      .then(() => {
        zipFile.end();
      })
      .catch(reject);
  });
}

async function main(): Promise<void> {
  const packageMetadata = await readPackageMetadata();
  const zipFilePath = path.resolve(`promptbridge-v${packageMetadata.version}.zip`);

  await runCommandSequence(getBuildCommands());
  await verifyDistLayout();
  await createDistributionZip(zipFilePath);

  console.log(`Created ${path.basename(zipFilePath)} from the dist/ directory.`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown packaging failure.';
  console.error(`PromptBridge packaging failed: ${message}`);
  process.exitCode = 1;
});
