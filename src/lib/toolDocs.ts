import fs from 'fs';
import path from 'path';
import type { ToolDefinition, ToolProperty } from '../types/tools.js';

/**
 * The tool reference, rendered from the tool definitions themselves.
 *
 * It used to be section 5 of MCP-Tools.md: 24KB of hand-written tables restating
 * names, arguments and descriptions that already exist in `getTools()`. Two
 * copies of the same facts, and AGENTS.md asks that a contradiction between a doc
 * and the code be treated as a bug — which only works if someone notices. Deriving
 * the document removes the second copy instead of policing it.
 *
 * `toolDocs.test.ts` re-renders and compares against the committed file, so a tool
 * changed without running `npm run docs:tools` fails the build rather than
 * shipping a reference that quietly lies.
 */

export interface ToolFamily {
    /** Handler class name, e.g. 'TransportHandlers'. */
    handler: string;
    /** Display name, e.g. 'Transports'. */
    label: string;
    tools: ToolDefinition[];
}

/**
 * Names that de-camelising alone gets wrong or leaves unhelpful. Anything not
 * listed falls back to the split-and-capitalise below.
 */
const LABELS: Record<string, string> = {
    AtcHandlers: 'ATC (ABAP Test Cockpit)',
    AuthHandlers: 'Session',
    BasisHandlers: 'Basis and running system',
    CodeAnalysisHandlers: 'Code analysis and completion',
    DdicHandlers: 'Dictionary (DDIC)',
    DebugHandlers: 'Debugger',
    DiscoveryHandlers: 'ADT discovery',
    DocsHandlers: "This server's own guides",
    GitHandlers: 'abapGit',
    JsonRemoteFunctionCallHandlers: 'RFC function modules (JSON-RPC)',
    NodeHandlers: 'Repository tree',
    ObjectDeletionHandlers: 'Object deletion',
    ObjectLockHandlers: 'Locks',
    ObjectManagementHandlers: 'Activation',
    ObjectRegistrationHandlers: 'Object creation and registration',
    ObjectSourceHandlers: 'Source read and write',
    QueryHandlers: 'Table data and SQL',
    RefactorHandlers: 'Refactoring (extract method)',
    RevisionHandlers: 'Revision history',
    ServiceBindingHandlers: 'Service bindings',
    SkillsHandlers: 'Bundled skills',
    TraceHandlers: 'Runtime traces',
    UnitTestHandlers: 'ABAP Unit'
};

function labelFor(handler: string): string {
    if (LABELS[handler]) return LABELS[handler];
    const base = handler.replace(/Handlers$/, '');
    const words = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Every handler's tools, read from the handler classes beside this module —
 * `src/handlers` under ts-jest, `dist/handlers` at runtime, since this file sits
 * one level below both.
 */
export function collectToolFamilies(): ToolFamily[] {
    const dir = path.resolve(__dirname, '..', 'handlers');
    const families: ToolFamily[] = [];

    for (const entry of fs.readdirSync(dir).sort()) {
        if (!/Handlers\.(ts|js)$/.test(entry) || entry.endsWith('.d.ts')) continue;

        let module: Record<string, any>;
        try {
            module = require(path.join(dir, entry));
        } catch {
            continue;
        }

        for (const key of Object.keys(module)) {
            const ctor = module[key];
            if (typeof ctor !== 'function' || !ctor.prototype?.getTools) continue;

            let tools: ToolDefinition[];
            try {
                // getTools() returns a literal and touches no instance state, so a
                // bare prototype is enough — no ADT client, no session.
                tools = Object.create(ctor.prototype).getTools();
            } catch {
                continue;
            }
            if (!Array.isArray(tools) || !tools.length) continue;

            families.push({ handler: key, label: labelFor(key), tools });
        }
    }

    return families.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/** One line of markdown table, with the pipes that would break it escaped. */
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

/**
 * One argument, in a single clause.
 *
 * Deliberately without the argument's own description: a client that can call the
 * tool already has the full `inputSchema`, descriptions included, so repeating
 * them here costs tokens twice and tells nobody anything new. What this document
 * adds is the name, the shape, and what the tool is *for*.
 */
function describeProperty(name: string, property: ToolProperty, required: boolean): string {
    const bits: string[] = [property.type];
    if (property.enum?.length) bits.push(`one of ${property.enum.join('/')}`);
    if (property.default !== undefined) bits.push(`default \`${property.default}\``);
    return `\`${name}\`${required ? '**\\***' : ''} ${bits.join(', ')}`;
}

function renderTool(tool: ToolDefinition): string {
    const required = new Set(tool.inputSchema.required ?? []);
    const properties = Object.entries(tool.inputSchema.properties ?? {});
    const args = properties.length
        ? properties.map(([name, p]) => describeProperty(name, p, required.has(name))).join(' · ')
        : '_no arguments_';

    return [`**\`${tool.name}\`** — ${cell(tool.description)}`, '', args, ''].join('\n');
}

export const TOOL_REFERENCE_FILE = 'docs/Tool-Reference.md';

/**
 * Renders the whole reference. Deterministic — families and tools keep a stable
 * order — so the drift test compares cleanly and diffs stay readable.
 */
export function renderToolReference(families: ToolFamily[] = collectToolFamilies()): string {
    const total = families.reduce((n, f) => n + f.tools.length, 0);

    const head = [
        '# Tool reference',
        '',
        '<!-- GENERATED FILE - do not edit by hand.',
        '     Run `npm run docs:tools` after changing any getTools(). -->',
        '',
        `Every tool this server can expose: **${total} tools across ${families.length} families**, ` +
        'rendered from the tool definitions themselves so it cannot drift from the code.',
        '',
        '**How many you can actually call is smaller.** The active `ABAP_MCP_PROFILE` decides what is',
        'listed, and the server withholds anything this system\'s ADT release does not expose.',
        '`tools/list` is always the truth; `healthcheck` reports the profile and what was withheld.',
        '',
        'Looking for the tool that does a particular job? Start with',
        '[`Tool-Router.md`](./Tool-Router.md), which maps intent to tool. For workflows, URI rules and',
        'the error model, see [`MCP-Tools.md`](./MCP-Tools.md).',
        '',
        'An argument marked **\\*** is required. Argument *descriptions* are not repeated here: they',
        'reach you in the `inputSchema` of every tool you can call.',
        '',
        '## Families',
        '',
        ...families.map(f => `- [${f.label}](#${f.label.toLowerCase()
            .replace(/[^a-z0-9 -]/g, '').replace(/ +/g, '-')}) — ${f.tools.length} tool${f.tools.length === 1 ? '' : 's'}`),
        '',
        '---',
        ''
    ].join('\n');

    const body = families.map(family => [
        `## ${family.label}`,
        '',
        `From \`src/handlers/${family.handler}.ts\`.`,
        '',
        ...family.tools.map(renderTool)
    ].join('\n')).join('\n');

    return `${head}\n${body}`.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
