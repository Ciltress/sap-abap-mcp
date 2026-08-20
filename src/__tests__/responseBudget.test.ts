import {
    capToolResult,
    narrowingHint,
    resolveResponseBudget,
    toolResultBytes,
    toolResultText,
    GENERIC_NARROWING_HINT,
    PROFILE_RESPONSE_BUDGETS,
    ResponseBudgetError
} from '../lib/responseBudget';
import { PROFILE_NAMES } from '../lib/profiles';
import { collectToolFamilies } from '../lib/toolDocs';

const envelope = (text: string) => ({ content: [{ type: 'text', text }] });

/** The narrowing hint a real tool carries, read from the catalogue. */
const CATALOGUE = new Map(
    collectToolFamilies().flatMap(f => f.tools).map(tool => [tool.name, tool])
);
const hintOf = (name: string) => CATALOGUE.get(name)?.narrowingHint;

describe('resolveResponseBudget', () => {
    it('follows the profile when nothing is set', () => {
        expect(resolveResponseBudget('core', {})).toBe(PROFILE_RESPONSE_BUDGETS.core);
        expect(resolveResponseBudget('dev', {})).toBe(PROFILE_RESPONSE_BUDGETS.dev);
    });

    it('leaves `all` unlimited, because its clients handle large payloads', () => {
        expect(resolveResponseBudget('all', {})).toBe(0);
    });

    it('tightens as the profile gets smaller', () => {
        // The ordering is the whole point: a smaller profile means a client with
        // less room, so it must also mean a smaller answer.
        expect(PROFILE_RESPONSE_BUDGETS.core).toBeLessThan(PROFILE_RESPONSE_BUDGETS.analyst);
        expect(PROFILE_RESPONSE_BUDGETS.analyst).toBeLessThan(PROFILE_RESPONSE_BUDGETS.dev);
    });

    it('is defined for every profile', () => {
        for (const name of PROFILE_NAMES) {
            expect(PROFILE_RESPONSE_BUDGETS[name]).toBeGreaterThanOrEqual(0);
        }
    });

    it('honours an explicit override, including 0 for unlimited', () => {
        expect(resolveResponseBudget('core', { ABAP_MCP_MAX_RESPONSE_BYTES: '1000' })).toBe(1000);
        expect(resolveResponseBudget('core', { ABAP_MCP_MAX_RESPONSE_BYTES: '0' })).toBe(0);
        expect(resolveResponseBudget('all', { ABAP_MCP_MAX_RESPONSE_BYTES: '500' })).toBe(500);
    });

    it('rejects a value that is not a whole number of bytes', () => {
        for (const bad of ['lots', '-1', '1.5', '10kb']) {
            expect(() => resolveResponseBudget('core', { ABAP_MCP_MAX_RESPONSE_BYTES: bad }))
                .toThrow(ResponseBudgetError);
        }
    });
});

describe('measuring a result', () => {
    it('reads the text across content parts', () => {
        expect(toolResultText({ content: [{ text: 'a' }, { text: 'b' }] })).toBe('ab');
    });

    it('counts bytes, not characters', () => {
        // A truncation that counted characters would overrun on any German
        // object description, which is most of them here.
        expect(toolResultBytes(envelope('ü'))).toBe(2);
        expect(toolResultBytes(envelope('Prüfung'))).toBe(8);
    });

    it('survives a result with no content', () => {
        expect(toolResultBytes({})).toBe(0);
        expect(toolResultBytes(null)).toBe(0);
        expect(toolResultText({ content: 'not an array' })).toBe('');
    });
});

describe('capToolResult', () => {
    it('passes an under-budget answer through untouched', () => {
        const result = envelope('small');
        const capped = capToolResult('readAbapObject', result, 1000);
        expect(capped.truncated).toBe(false);
        expect(capped.result).toBe(result);
        expect(capped.bytes).toBe(5);
    });

    it('passes everything through when the budget is 0', () => {
        const result = envelope('x'.repeat(100_000));
        expect(capToolResult('adtDiscovery', result, 0).truncated).toBe(false);
    });

    it('treats exactly-at-budget as within budget', () => {
        expect(capToolResult('t', envelope('abcde'), 5).truncated).toBe(false);
        expect(capToolResult('t', envelope('abcdef'), 5).truncated).toBe(true);
    });

    it('replaces an over-budget answer with valid, parseable JSON', () => {
        // A cut-off fragment of the original would be unparseable, and a model
        // handed one retries the same call instead of narrowing it.
        const capped = capToolResult(
            'adtDiscovery',
            envelope(JSON.stringify({ big: 'x'.repeat(50_000) })),
            24_000,
            hintOf('adtDiscovery')
        );
        expect(capped.truncated).toBe(true);

        const parsed = JSON.parse(capped.result.content[0].text);
        expect(parsed.status).toBe('truncated');
        expect(parsed.tool).toBe('adtDiscovery');
        expect(parsed.budget).toBe(24_000);
        expect(parsed.bytes).toBeGreaterThan(24_000);
        expect(parsed.otherwise).toMatch(/ABAP_MCP_MAX_RESPONSE_BYTES/);
        expect(parsed.otherwise).toMatch(/Retrying this exact call/);
        // adtDiscovery has a specific move, so the generic advice must not appear.
        expect(parsed.nextStep).toMatch(/Drop full:true/);
        expect(typeof parsed.preview).toBe('string');
    });

    it('reports the original size, not the replacement size', () => {
        const capped = capToolResult('t', envelope('x'.repeat(50_000)), 1_000);
        expect(capped.bytes).toBe(50_000);
    });

    it('keeps the replacement far below the payload it replaced', () => {
        const capped = capToolResult('t', envelope('x'.repeat(200_000)), 24_000);
        expect(Buffer.byteLength(capped.result.content[0].text, 'utf8')).toBeLessThan(4_000);
    });
});

describe('narrowingHint', () => {
    it('uses the hint the tool carries', () => {
        expect(narrowingHint('Lower `rowNumber`, or narrow the SELECT.')).toMatch(/rowNumber/);
    });

    it('falls back to something generally true for a tool with no hint', () => {
        expect(narrowingHint(undefined)).toMatch(/filter, a name, or a row limit/);
        expect(narrowingHint('')).toBe(GENERIC_NARROWING_HINT);
        expect(narrowingHint('   ')).toBe(GENERIC_NARROWING_HINT);
    });
});

/**
 * The hints now live on the tool definitions, so what is worth asserting is that
 * the tools which actually overrun still carry specific advice. The old map here
 * could name a tool that had been renamed away and nobody would hear about it.
 */
describe('the hints the catalogue carries', () => {
    it('tells a guide reader to ask for a section, not to add a filter', () => {
        // The generic "add a filter" is useless to a model that asked for a
        // document: there is no filter, there is a section.
        expect(hintOf('readServerGuide')).toMatch(/section/);
        expect(hintOf('readServerGuide')).not.toMatch(/row limit/);
        expect(hintOf('readSkill')).toMatch(/one file/);
    });

    it('names the specific argument for the tools that overrun most', () => {
        expect(hintOf('adtDiscovery')).toMatch(/full:true/);
        expect(hintOf('getObjectSource')).toMatch(/mapSourceFragments/);
        expect(hintOf('searchPackages')).toMatch(/includeContents/);
        expect(hintOf('readAbapObject')).toMatch(/includeSource:false/);
    });

    it('carries a hint on every tool known to overrun the budget', () => {
        for (const name of ['readServerGuide', 'readSkill', 'adtDiscovery', 'tableContents', 'runQuery',
            'nodeContents', 'searchObject', 'searchPackages', 'getObjectSource', 'readAbapObject']) {
            expect(`${name}: ${hintOf(name) ? 'has a hint' : 'MISSING'}`).toBe(`${name}: has a hint`);
        }
    });
});
