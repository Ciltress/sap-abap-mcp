import type { ADTClient } from 'abap-adt-api';
import { ObjectHandlers } from '../handlers/ObjectHandlers';

/**
 * Tests for the two traps searchObject used to carry, both documented in
 * AGENTS.md and both now handled in the tool rather than in a warning:
 *
 *  1. The repository search adds no wildcard, so a bare name matched only itself.
 *  2. abap-adt-api truncates objType to its first segment (search.js), so
 *     'FUGR/FF' asked the server for function GROUPS.
 */

interface Recorded {
    query: string;
    objType?: string;
    max?: number;
}

const hit = (name: string, type: string) => ({
    'adtcore:uri': `/sap/bc/adt/oo/classes/${name.toLowerCase()}`,
    'adtcore:type': type,
    'adtcore:name': name,
    'adtcore:description': ''
});

function harness(hits: any[]) {
    const calls: Recorded[] = [];
    const client = {
        searchObject: async (query: string, objType?: string, max?: number) => {
            calls.push({ query, objType, max });
            return hits;
        }
    } as unknown as ADTClient;
    return { calls, handlers: new ObjectHandlers(client) };
}

const payload = async (handlers: ObjectHandlers, args: any) =>
    JSON.parse((await handlers.handle('searchObject', args)).content[0].text);

describe('searchObject wildcard handling', () => {
    it('appends a * when the caller supplies none', async () => {
        const { calls, handlers } = harness([hit('ZCL_FOO_BAR', 'CLAS/OC')]);
        await payload(handlers, { query: 'ZCL_FOO' });
        expect(calls[0].query).toBe('ZCL_FOO*');
    });

    it('leaves an explicit pattern alone', async () => {
        const { calls, handlers } = harness([]);
        await payload(handlers, { query: 'ZCL_*_HELPER' });
        expect(calls[0].query).toBe('ZCL_*_HELPER');
    });

    it('upper-cases the query, because the search is case sensitive on older systems', async () => {
        const { calls, handlers } = harness([]);
        await payload(handlers, { query: 'zcl_foo' });
        expect(calls[0].query).toBe('ZCL_FOO*');
    });

    it('reports the normalisation, so a surprising result set is traceable', async () => {
        const { handlers } = harness([hit('ZCL_FOO_BAR', 'CLAS/OC')]);
        const result = await payload(handlers, { query: 'zcl_foo' });
        expect(result.queryNormalised).toBe("'zcl_foo' searched as 'ZCL_FOO*'");

        const untouched = await payload(harness([]).handlers, { query: 'ZCL_A*' });
        expect(untouched.queryNormalised).toBeUndefined();
    });

    it('rejects an empty query rather than searching for everything', async () => {
        const { handlers } = harness([]);
        await expect(handlers.handle('searchObject', { query: '   ' })).rejects.toThrow(/query is required/);
    });
});

describe('searchObject type filtering', () => {
    it('never sends objType to the library, which would truncate it', async () => {
        const { calls, handlers } = harness([]);
        await payload(handlers, { query: 'Z*', objType: 'FUGR/FF' });
        expect(calls[0].objType).toBeUndefined();
    });

    it('matches the full type, so FUGR/FF selects modules and not groups', async () => {
        const { handlers } = harness([
            hit('Z_MY_GROUP', 'FUGR/F'),
            hit('Z_MY_FUNCTION', 'FUGR/FF'),
            hit('Z_OTHER', 'FUGR/FF')
        ]);
        const result = await payload(handlers, { query: 'Z*', objType: 'FUGR/FF' });

        expect(result.results.map((r: any) => r['adtcore:name'])).toEqual(['Z_MY_FUNCTION', 'Z_OTHER']);
        expect(result.found).toBe(2);
    });

    it('matches the type case-insensitively', async () => {
        const { handlers } = harness([hit('ZCL_A', 'CLAS/OC')]);
        const result = await payload(handlers, { query: 'Z*', objType: 'clas/oc' });
        expect(result.found).toBe(1);
    });

    it('over-fetches when filtering, so a filter cannot starve the result set', async () => {
        // Filtering client-side out of `max` rows would return far fewer than the
        // caller asked for whenever the wanted type is a minority.
        const { calls, handlers } = harness([]);
        await payload(handlers, { query: 'Z*', objType: 'CLAS/OC', max: 42 });
        expect(calls[0].max).toBe(420);
    });

    it('caps the over-fetch, so a large max cannot ask for everything', async () => {
        const { calls, handlers } = harness([]);
        await payload(handlers, { query: 'Z*', objType: 'CLAS/OC', max: 5000 });
        expect(calls[0].max).toBe(1000);
    });

    it('does not over-fetch when no filter is applied', async () => {
        const { calls, handlers } = harness([]);
        await payload(handlers, { query: 'Z*', max: 42 });
        expect(calls[0].max).toBe(42);
    });
});

describe('searchObject truncation', () => {
    it('reports truncation explicitly and says what to do', async () => {
        const many = Array.from({ length: 30 }, (_, i) => hit(`ZCL_${i}`, 'CLAS/OC'));
        const { handlers } = harness(many);
        const result = await payload(handlers, { query: 'Z*', max: 10 });

        expect(result.shown).toBe(10);
        expect(result.found).toBe(30);
        expect(result.truncated).toBe(true);
        expect(result.message).toMatch(/Narrow the pattern or raise max/);
    });

    it('does not claim truncation when everything fits', async () => {
        const { handlers } = harness([hit('ZCL_A', 'CLAS/OC')]);
        const result = await payload(handlers, { query: 'Z*', max: 100 });
        expect(result.truncated).toBe(false);
        expect(result.shown).toBe(1);
    });

    it('defaults max to 100', async () => {
        const { calls, handlers } = harness([]);
        await payload(handlers, { query: 'Z*' });
        expect(calls[0].max).toBe(100);
    });
});
