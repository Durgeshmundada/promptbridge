# PromptBridge

PromptBridge is a Chrome Manifest V3 extension that intercepts a user prompt before it reaches an LLM, enriches it through a multi-layer pipeline, and sends back a stronger, more structured prompt.

This project currently supports:

- React + TypeScript extension UI
- Manifest V3 background service worker
- MongoDB Atlas-backed template catalog through a local Node/Express service
- 3-zone template matching: `DIRECT`, `PARTIAL`, and `GENERATE`
- Enhanced Mode with dynamic 3-question clarification flow
- session-aware template adaptation and generation
- persona, history, ratings, theme, and vault-backed API key flows

## Current Architecture

PromptBridge does not connect to MongoDB Atlas directly from the extension.

The runtime flow is:

```text
Chrome page
  -> PromptBridge content script
  -> PromptBridge background service worker
  -> local template service
  -> MongoDB Atlas
```

LLM calls always go through the background service worker.

## Main Features

- Seven-layer prompt pipeline
- Intent classification and template matching
- 3-zone hybrid template flow
- Enhanced Mode with a draggable clarification modal
- Session-aware template retrieval context
- Persona-aware prompt shaping
- PII redaction, command gating, and scope confirmation
- Image-aware enrichment pipeline
- Hallucination guardrails and confidence extraction
- Popup UI, options UI, history, ratings, and template library
- Atlas-backed template storage with local caching

## Tech Stack

- Chrome Extension Manifest V3
- React 18
- TypeScript
- Zustand
- Tailwind CSS
- Vite
- Jest
- MongoDB Atlas
- Express

## Requirements

- Node.js 22 or newer
- pnpm 10 or newer

If `pnpm` is not installed globally, use `corepack pnpm ...`.

## Project Scripts

```bash
pnpm install
pnpm build
pnpm server
pnpm import:templates
pnpm test
pnpm lint
pnpm package
```

Windows one-click starter:

```text
start-all.bat
```

## Environment Files

### `.env.server.local`

Used only by the local template service.

Required values:

```env
PROMPTBRIDGE_SERVER_PORT=8787
MONGODB_URI="mongodb+srv://..."
MONGODB_DB_NAME="promptbridge"
MONGODB_TEMPLATES_COLLECTION="templates"
PROMPTBRIDGE_TEMPLATE_AUTO_SEED="true"
```

Create it by copying:

```text
.env.server.example
```

### `.env.local`

Used by the extension build, not by the local MongoDB service.

Do not put `MONGODB_URI` in `.env.local`.

## First-Time Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure MongoDB Atlas

1. Create or open an Atlas cluster.
2. Create a database user.
3. Add your current IP address in Atlas network access.
4. Copy the Node.js connection string.
5. Put it into `.env.server.local` as `MONGODB_URI`.

### 3. Start the local template service

```bash
pnpm server
```

The service runs by default at:

```text
http://127.0.0.1:8787
```

Keep this terminal open while using the extension.

### 4. Build the extension

```bash
pnpm build
```

The unpacked build is written to:

```text
dist/
```

### 5. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `d:\Hackbyte\promptbridge\dist`

### 6. Add API keys

1. Open the extension Options page
2. Go to `Settings`
3. Unlock the vault
4. Save the required provider API keys

## Start After Laptop Restart

If you shut down your laptop and come back later, do this:

### Fastest option on Windows

Double-click:

```text
start-all.bat
```

It will:

1. start the local template server if it is not already running
2. build the extension
3. print the Chrome reload steps

### Terminal 1

```bash
cd d:\Hackbyte\promptbridge
corepack pnpm server
```

### Terminal 2

```bash
cd d:\Hackbyte\promptbridge
corepack pnpm build
```

### Chrome

1. Open `chrome://extensions`
2. Click `Reload` on PromptBridge
3. Refresh any open ChatGPT, Claude, Gemini, or Perplexity tabs

After that, PromptBridge is ready to use again.

## Using PromptBridge

1. Open a supported site such as ChatGPT
2. Focus the prompt box
3. Type a prompt
4. Click `Optimize with PromptBridge`

PromptBridge will:

1. classify the prompt
2. load templates
3. choose a match zone
4. enrich the prompt
5. optionally execute the target model

### Standard Mode

With Enhanced Mode turned off, PromptBridge keeps the workflow simple:

1. one click on `Optimize with PromptBridge`
2. the prompt is enriched immediately
3. the improved prompt is written back into the page or popup

### Enhanced Mode

With Enhanced Mode turned on, PromptBridge uses a two-step enrichment flow:

1. it analyzes the prompt for missing context
2. it asks 3 targeted clarification questions
3. you answer only the questions that matter
4. blank answers fall back to `Best professional choice`
5. PromptBridge merges the answers into a stronger final prompt

On supported AI sites, the Enhanced Mode clarification UI appears as a draggable modal.

## Template Catalog

PromptBridge uses a database-backed template catalog.

Template sources include:

- built-in PromptBridge templates
- generated or adapted templates created by PromptBridge
- imported external prompt archive templates

### Importing templates into MongoDB

Run:

```bash
pnpm import:templates
```

This importer:

- upserts the built-in PromptBridge templates
- imports the external Claude Code system prompt archive
- stores everything in the Atlas templates collection

The import is safe to rerun because it uses upserts by template id.

## 3-Zone Template Matching

PromptBridge uses three template-resolution zones:

- `DIRECT`
  - score `>= 0.80`
  - use the matched template directly
- `PARTIAL`
  - score `0.50 - 0.79`
  - adapt the nearest template through the model
- `GENERATE`
  - score `< 0.50`
  - generate a new reusable template

Generated and adapted templates are validated before being saved.

## Performance Notes

Template loading is optimized with warm caches in:

- the local template service
- the extension background service worker
- the in-memory executor state

That means:

- first fetch after cold start may be slower
- repeated template loads should be much faster

## Build, Lint, and Test

```bash
pnpm build
pnpm lint
pnpm test
```

If you prefer Corepack:

```bash
corepack pnpm build
corepack pnpm lint
corepack pnpm test
```

## Packaging

To create a distributable zip:

```bash
pnpm package
```

This builds the extension and creates a zip from `dist/`.

## Important Paths

### Source

```text
src/
server/
scripts/
manifest.json
vite.config.ts
```

### Output

```text
dist/
  manifest.json
  background/serviceWorker.js
  content/contentScript.js
  popup/index.html
  options/index.html
```

## Troubleshooting

### `pnpm` is not recognized

Use:

```bash
corepack pnpm build
corepack pnpm server
```

### The extension loads but templates do not come from MongoDB

Check:

1. `pnpm server` is still running
2. `.env.server.local` has the correct Atlas values
3. the extension has been reloaded after the latest build
4. the site tab has been refreshed

### The button appears but optimize is slow

Check:

1. the local template server is running
2. the first request after restart has already warmed the cache
3. Chrome extension has been reloaded after rebuild

### Enhanced Mode modal does not update or feels stuck

Check:

1. reload the unpacked extension in `chrome://extensions`
2. refresh the already-open AI site tab after every rebuild
3. make sure the local template server is running
4. try the flow again after the tab is fully refreshed

Enhanced Mode uses the latest content script, so old open tabs can keep stale logic until refreshed.

### Atlas connection fails

Check:

1. database user credentials
2. network access IP allowlist
3. `MONGODB_URI`
4. cluster availability

### Chrome says the extension is invalid

Rebuild and load `dist/`, not the project root:

```bash
pnpm build
```

## Security Notes

- Keep MongoDB credentials in `.env.server.local`
- Do not put MongoDB credentials in `.env.local`
- Keep provider API keys in the PromptBridge vault when possible
- All provider calls should flow through the background service worker
