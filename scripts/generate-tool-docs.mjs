#!/usr/bin/env node
/**
 * Writes docs/Tool-Reference.md from the tool definitions.
 *
 *   npm run build && npm run docs:tools
 *
 * Reads the compiled handlers, so it needs a build first. toolDocs.test.ts holds
 * the committed file to the same output, which is what stops the reference from
 * drifting away from the code between runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let toolDocs;
try {
    // An ESM build, so this is a dynamic import rather than a require — and the
    // specifier has to be a file:// URL for it to work on Windows.
    toolDocs = await import(pathToFileURL(path.join(root, 'dist', 'lib', 'toolDocs.js')).href);
} catch (error) {
    console.error('Could not load dist/lib/toolDocs.js — run `npm run build` first.');
    console.error(String(error?.message ?? error));
    process.exit(1);
}

const { renderToolReference, TOOL_REFERENCE_FILE } = toolDocs;
const target = path.join(root, TOOL_REFERENCE_FILE);
const rendered = renderToolReference();
const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';

fs.writeFileSync(target, rendered);

const size = Buffer.byteLength(rendered, 'utf8');
console.log(
    `${previous === rendered ? 'unchanged' : 'written'}: ${TOOL_REFERENCE_FILE} ` +
    `(${Math.round(size / 1024)}KB, ~${Math.round(size / 3600)}k tokens)`
);
