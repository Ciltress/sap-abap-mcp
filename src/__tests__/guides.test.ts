import { vi, type MockInstance } from 'vitest';
import type { ADTClient } from 'abap-adt-api';
import { DocsHandlers } from '../handlers/DocsHandlers';
import {
    GUIDES,
    extractSection,
    guideById,
    guideByUri,
    guideIndex,
    guideUri,
    listSections,
    readGuideFile
} from '../lib/guides';

/**
 * The documentation the server serves to its clients, as MCP resources and
 * through readServerGuide.
 *
 * These run against the real files in docs/ on purpose: the point of the feature
 * is that what ships is what is served, so a guide that goes missing or loses a
 * section should fail here rather than at a client.
 */

const SAMPLE = [
    '# Title',
    '',
    'Intro prose.',
    '',
    '## 1. First',
    '',
    'First body.',
    '',
    '### 1.1 Nested',
    '',
    'Nested body.',
    '',
    '## 2. Second',
    '',
    'Second body.',
    '',
    '```markdown',
    '## Not a heading',
    'fenced content',
    '```',
    '',
    '## Unnumbered heading',
    '',
    'Trailing body.'
].join('\n');

let consoleError: MockInstance;
beforeAll(() => { consoleError = vi.spyOn(console, 'error').mockImplementation(() => { }); });
afterAll(() => { consoleError.mockRestore(); });

describe('listSections', () => {
    it('reads level 2 and 3 headings with their numbers', () => {
        expect(listSections(SAMPLE).map(s => `${s.level}:${s.number ?? '-'}:${s.title}`)).toEqual([
            '2:1:First',
            '3:1.1:Nested',
            '2:2:Second',
            '2:-:Unnumbered heading'
        ]);
    });

    it('ignores headings inside a fenced code block', () => {
        // Guides are full of markdown samples; '## Not a heading' is content.
        expect(listSections(SAMPLE).some(s => s.title === 'Not a heading')).toBe(false);
    });
});

describe('extractSection', () => {
    it('returns a section up to the next heading of the same level', () => {
        const found = extractSection(SAMPLE, '1')!;

        expect(found.section.number).toBe('1');
        expect(found.content).toContain('First body.');
        // A level-3 child belongs to it...
        expect(found.content).toContain('Nested body.');
        // ...but the next level-2 heading does not.
        expect(found.content).not.toContain('Second body.');
    });

    it('returns only the nested section when the nested number is asked for', () => {
        const found = extractSection(SAMPLE, '1.1')!;

        expect(found.section.title).toBe('Nested');
        expect(found.content).toContain('Nested body.');
        expect(found.content).not.toContain('First body.');
    });

    it('does not let a bare number match a longer one', () => {
        // '1' must not select '1.1'.
        expect(extractSection(SAMPLE, '1')!.section.number).toBe('1');
    });

    it('matches on a case-insensitive title fragment', () => {
        expect(extractSection(SAMPLE, 'unnumbered')!.section.title).toBe('Unnumbered heading');
        expect(extractSection(SAMPLE, 'NESTED')!.section.number).toBe('1.1');
    });

    it('matches on number and title together', () => {
        expect(extractSection(SAMPLE, '2. Second')?.section.title ?? extractSection(SAMPLE, 'second')!.section.title)
            .toBe('Second');
    });

    it('returns undefined for an unknown or empty section', () => {
        expect(extractSection(SAMPLE, 'nothing like this')).toBeUndefined();
        expect(extractSection(SAMPLE, '   ')).toBeUndefined();
    });
});

describe('the guide registry', () => {
    it('resolves every guide by id and by resource uri', () => {
        for (const guide of GUIDES) {
            expect(guideById(guide.id)).toBe(guide);
            expect(guideById(guide.id.toUpperCase())).toBe(guide);
            expect(guideByUri(guideUri(guide.id))).toBe(guide);
        }
        expect(guideById('nope')).toBeUndefined();
        expect(guideByUri('abap-adt://guides/nope')).toBeUndefined();
        expect(guideByUri('file:///etc/passwd')).toBeUndefined();
    });

    it('every registered guide actually exists and has sections', () => {
        // Guards the rename trap: a doc moved without updating the registry.
        for (const guide of GUIDES) {
            const text = readGuideFile(guide);
            expect(`${guide.id}: ${text.length > 500}`).toBe(`${guide.id}: true`);
            expect(`${guide.id}: ${listSections(text).length > 0}`).toBe(`${guide.id}: true`);
        }
    });

    it('indexes the guides cheaply', () => {
        const index = guideIndex();

        // Derived from the registry, so adding a guide does not break this.
        expect(index.map(g => g.id).sort()).toEqual(GUIDES.map(g => g.id).sort());
        for (const entry of index) {
            expect(entry.bytes).toBeGreaterThan(0);
            expect(entry.uri).toBe(guideUri(entry.id));
            expect(entry.sections.length).toBeGreaterThan(0);
        }
        // The index must stay far smaller than the documents it describes.
        const indexSize = JSON.stringify(index).length;
        const totalSize = index.reduce((n, g) => n + g.bytes, 0);
        expect(`index ${indexSize} < total ${totalSize}`).toBe(`index ${indexSize} < total ${totalSize}`);
        expect(indexSize).toBeLessThan(totalSize / 2);
    });
});

/** Unwraps the MCP envelope. */
async function readGuide(handler: DocsHandlers, args: any) {
    const envelope = await handler.handle('readServerGuide', args);
    return JSON.parse(envelope.content[0].text);
}

describe('readServerGuide', () => {
    const handler = () => new DocsHandlers({} as ADTClient);

    it('returns the index when no guide is named', async () => {
        const payload = await readGuide(handler(), {});

        expect(payload.status).toBe('success');
        expect(payload.guides.map((g: any) => g.id).sort()).toEqual(GUIDES.map(g => g.id).sort());
        expect(payload.hint).toMatch(/guide.*section/i);
        // The index must not carry the documents themselves.
        expect(payload.guides[0]).not.toHaveProperty('content');
    });

    it('returns one section of a guide', async () => {
        const payload = await readGuide(handler(), { guide: 'tools', section: '4.1' });

        expect(payload.guide).toBe('tools');
        expect(payload.section.number).toBe('4.1');
        expect(payload.content).toMatch(/^### 4\.1 /);
        expect(payload.content).toContain('readAbapObject');
    });

    it('finds a section by title as well as by number', async () => {
        const payload = await readGuide(handler(), { guide: 'json-rpc', section: 'error map' });
        expect(payload.section.title.toLowerCase()).toContain('error map');
    });

    it('returns a whole guide with its section list when no section is named', async () => {
        const payload = await readGuide(handler(), { guide: 'agents' });

        expect(payload.bytes).toBeGreaterThan(0);
        expect(payload.sections.length).toBeGreaterThan(0);
        expect(payload.content).toContain('AGENTS.md');
    });

    it('is much cheaper for a section than for the whole guide', async () => {
        // The reason the tool defaults to the index rather than the document.
        const whole = await readGuide(handler(), { guide: 'tools' });
        const section = await readGuide(handler(), { guide: 'tools', section: '4.1' });

        expect(section.content.length).toBeLessThan(whole.content.length / 10);
    });

    it('lists the available sections when the section is unknown', async () => {
        await expect(readGuide(handler(), { guide: 'tools', section: 'no such section' }))
            .rejects.toThrow(/has no section matching[\s\S]*Available sections:/);
    });

    it('rejects an unknown guide by name, listing the real ones', async () => {
        await expect(readGuide(handler(), { guide: 'handbook' }))
            .rejects.toThrow(/no guide 'handbook'[\s\S]*tools[\s\S]*json-rpc/);
    });

    it('rejects a section without a guide', async () => {
        await expect(readGuide(handler(), { section: '4.1' }))
            .rejects.toThrow(/section was requested without a guide/);
    });
});
