const { mkdir, readFile }: typeof import('node:fs/promises') = require('node:fs/promises');
const path: typeof import('node:path') = require('node:path');
const sharp: typeof import('sharp') = require('sharp');

const ICON_SIZES = [16, 48, 128] as const;
const DEFAULT_INPUT_SVG = path.resolve('src', 'assets', 'icons', 'icon-source.svg');
const DEFAULT_OUTPUT_DIRECTORY = path.resolve('src', 'assets', 'icons');

function resolveCliPath(inputPath: string | undefined, fallbackPath: string): string {
  if (!inputPath) {
    return path.resolve(fallbackPath);
  }

  return path.resolve(inputPath);
}

async function generateIcons(inputSvgPath: string, outputDirectory: string): Promise<void> {
  const svgBuffer = await readFile(inputSvgPath);

  await mkdir(outputDirectory, { recursive: true });

  await Promise.all(
    ICON_SIZES.map(async (size) => {
      const outputPath = path.join(outputDirectory, `icon${size.toString()}.png`);

      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(outputPath);
    }),
  );
}

async function main(): Promise<void> {
  const inputSvgPath = resolveCliPath(process.argv[2], DEFAULT_INPUT_SVG);
  const outputDirectory = resolveCliPath(process.argv[3], DEFAULT_OUTPUT_DIRECTORY);

  await generateIcons(inputSvgPath, outputDirectory);

  const generatedFiles = ICON_SIZES.map((size) => `icon${size.toString()}.png`).join(', ');
  console.log(
    `Generated ${generatedFiles} from ${inputSvgPath} into ${outputDirectory}.`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown icon generation failure.';
  console.error(`PromptBridge icon generation failed: ${message}`);
  process.exitCode = 1;
});
