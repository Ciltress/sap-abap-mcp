import fs from 'fs';
import path from 'path';
import {
    collectToolFamilies,
    renderToolReference,
    TOOL_REFERENCE_FILE
} from '../lib/toolDocs';
import type { ToolDefinition } from '../types/tools';

const ROOT = path.resolve(__dirname, '..', '..');

const tool = (name: string, over: Partial<ToolDefinition> = {}): ToolDefinition => ({
    name,
    description: `does ${name}`,
    inputSchema: { type: 'object', properties: {} },
    ...over
});

describe('collectToolFamilies', () => {
    const families = collectToolFamilies();

    it('finds every handler that offers tools', () => {
        expect(families.length).toBeGreaterThan(25);
        expect(families.some(f => f.handler === 'TransportHandlers')).toBe(true);
        expect(families.some(f => f.handler === 'BaseHandler')).toBe(false);
    });

    it('gives every family a readable label and at least one tool', () => {
        for (const family of families) {
            expect(family.tools.length).toBeGreaterThan(0);
            expect(family.label).not.toMatch(/Handlers/);
            expect(family.label.length).toBeGreaterThan(2);
        }
    });

    it('is deterministic, so the generated file diffs cleanly', () => {
        expect(collectToolFamilies().map(f => f.handler)).toEqual(families.map(f => f.handler));
        expect(families.map(f => f.label)).toEqual([...families.map(f => f.label)].sort());
    });

    it('never lists a tool name twice across families', () => {
        const names = families.flatMap(f => f.tools.map(t => t.name));
        expect(new Set(names).size).toBe(names.length);
    });
});

describe('renderToolReference', () => {
    it('marks required arguments and omits their descriptions', () => {
        const rendered = renderToolReference([{
            handler: 'XHandlers',
            label: 'X',
            tools: [tool('doThing', {
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', description: 'this description belongs in the schema' },
                        deep: { type: 'boolean', default: false }
                    },
                    required: ['name']
                }
            })]
        }]);

        expect(rendered).toContain('`name`**\\*** string');
        expect(rendered).toContain('`deep` boolean, default `false`');
        // The schema already carries argument descriptions to every client that
        // can call the tool; repeating them here would pay for them twice.
        expect(rendered).not.toContain('belongs in the schema');
    });

    it('renders enums and no-argument tools', () => {
        const rendered = renderToolReference([{
            handler: 'XHandlers', label: 'X',
            tools: [
                tool('noArgs'),
                tool('withEnum', {
                    inputSchema: {
                        type: 'object',
                        properties: { version: { type: 'string', enum: ['active', 'inactive'] } }
                    }
                })
            ]
        }]);
        expect(rendered).toContain('_no arguments_');
        expect(rendered).toContain('one of active/inactive');
    });

    it('escapes a pipe in a description so the markdown survives', () => {
        const rendered = renderToolReference([{
            handler: 'XHandlers', label: 'X',
            tools: [tool('piped', { description: 'takes a | separated list' })]
        }]);
        expect(rendered).toContain('takes a \\| separated list');
    });

    it('says it is generated, and how to regenerate it', () => {
        const rendered = renderToolReference();
        expect(rendered).toMatch(/GENERATED FILE/);
        expect(rendered).toMatch(/npm run docs:tools/);
    });
});

describe('the committed reference', () => {
    const file = path.join(ROOT, TOOL_REFERENCE_FILE);

    it('exists', () => {
        expect(fs.existsSync(file)).toBe(true);
    });

    it('matches what the current tool definitions render', () => {
        // The point of generating it. If this fails, a tool changed and
        // `npm run build && npm run docs:tools` was not run — the reference is
        // lying about the code, which is exactly what AGENTS.md calls a bug.
        //
        // Line endings are normalised on both sides because they are not a
        // property of the content: `.gitattributes` sets `* text=auto`, so git
        // stores LF and checks the file out with CRLF on Windows, while the
        // generator always emits LF. Comparing raw bytes made every line differ
        // on a Windows checkout and said "stale reference" when nothing was stale.
        const lf = (text: string) => text.replace(/\r\n/g, '\n');
        const onDisk = fs.readFileSync(file, 'utf8');
        expect(lf(onDisk)).toBe(lf(renderToolReference()));
    });

    it('names every tool the handlers offer', () => {
        const onDisk = fs.readFileSync(file, 'utf8');
        for (const family of collectToolFamilies()) {
            for (const t of family.tools) {
                expect(`${t.name}: ${onDisk.includes(`\`${t.name}\``)}`).toBe(`${t.name}: true`);
            }
        }
    });
});
