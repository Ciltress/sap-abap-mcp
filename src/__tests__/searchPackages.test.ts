import { vi, type MockInstance } from 'vitest';
import type { ADTClient } from 'abap-adt-api';
import { ObjectHandlers } from '../handlers/ObjectHandlers';

/**
 * Tests for the searchPackages tool, run against a fake ADT client.
 *
 * The fixtures reproduce what DEV/100 actually returned for ZPP_* and Z_PP*:
 * package hits carry the useless description "Package" and a VIT uri, and
 * nodeContents answers with `nodes` plus an `objectTypes` table that holds the
 * human label for each type ("Programs", "Structures", "Subpackages", …).
 */

interface Recorded {
    searches: { query: string; objType?: string; max?: number }[];
    expansions: string[];
}

/** One repository search hit for a package. */
const pkg = (name: string) => ({
    'adtcore:uri': `/sap/bc/adt/vit/wb/object_type/devck/object_name/${name}`,
    'adtcore:type': 'DEVC/K',
    'adtcore:name': name,
    'adtcore:packageName': name,
    'adtcore:description': 'Package'
});

const node = (type: string, name: string, uri: string, expandable = '') => ({
    OBJECT_TYPE: type,
    OBJECT_NAME: name,
    TECH_NAME: name,
    OBJECT_URI: uri,
    OBJECT_VIT_URI: `/sap/bc/adt/vit/wb/object_type/x/object_name/${name}`,
    EXPANDABLE: expandable,
    DESCRIPTION: ''
});

/** Contents of Z_PP_KPI as the live system returned them. */
const Z_PP_KPI_CONTENTS = {
    categories: [],
    nodes: [
        node('TABL/DS', 'ZPPKPI01', '/sap/bc/adt/ddic/structures/zppkpi01'),
        node('TABL/DS', 'ZPPKPI02', '/sap/bc/adt/ddic/structures/zppkpi02'),
        node('PROG/P', 'ZZ_PP_KPI_PLAF', '/sap/bc/adt/programs/programs/zz_pp_kpi_plaf', 'X'),
        node('TRAN/T', 'ZPP_KPIDISPO', '/sap/bc/adt/vit/wb/object_type/trant/object_name/ZPP_KPIDISPO')
    ],
    objectTypes: [
        { OBJECT_TYPE: 'PROG/P', CATEGORY_TAG: 'source_library', OBJECT_TYPE_LABEL: 'Programs', NODE_ID: '7' },
        { OBJECT_TYPE: 'TABL/DS', CATEGORY_TAG: 'dictionary', OBJECT_TYPE_LABEL: 'Structures', NODE_ID: '4' },
        { OBJECT_TYPE: 'TRAN/T', CATEGORY_TAG: 'transactions', OBJECT_TYPE_LABEL: 'Transactions', NODE_ID: '10' }
    ]
};

/** A package whose only child is another package. */
const SUBPACKAGE_ONLY_CONTENTS = {
    categories: [],
    nodes: [
        node('DEVC/K', 'ZPP_BYSOFT_CAM_PM', '/sap/bc/adt/vit/wb/object_type/devck/object_name/ZPP_BYSOFT_CAM_PM', 'X')
    ],
    objectTypes: [
        { OBJECT_TYPE: 'DEVC/K', CATEGORY_TAG: 'packages', OBJECT_TYPE_LABEL: 'Subpackages', NODE_ID: '3' }
    ]
};

function makeHandler(options: {
    hits?: Record<string, any[]>;
    contents?: Record<string, any>;
    contentsError?: Record<string, string>;
} = {}) {
    const recorded: Recorded = { searches: [], expansions: [] };

    const client = {
        searchObject: async (query: string, objType?: string, max?: number) => {
            recorded.searches.push({ query, objType, max });
            return options.hits?.[query] ?? [];
        },
        nodeContents: async (_type: string, name: string) => {
            recorded.expansions.push(name);
            const failure = options.contentsError?.[name];
            if (failure) throw new Error(failure);
            return options.contents?.[name] ?? { categories: [], nodes: [], objectTypes: [] };
        }
    } as unknown as ADTClient;

    return { handler: new ObjectHandlers(client), recorded };
}

/** Unwraps the MCP envelope the handler returns. */
async function search(handler: ObjectHandlers, args: any) {
    const envelope = await handler.handle('searchPackages', args);
    return JSON.parse(envelope.content[0].text);
}

let consoleError: MockInstance;
beforeAll(() => { consoleError = vi.spyOn(console, 'error').mockImplementation(() => { }); });
afterAll(() => { consoleError.mockRestore(); });

describe('searchPackages — pattern handling', () => {
    it('upper-cases and appends the wildcard the repository search does not add', async () => {
        // 'zpp_' finds nothing on a case-sensitive system; 'ZPP_*' finds everything.
        const { handler, recorded } = makeHandler({ hits: { 'ZPP_*': [pkg('ZPP_LABEL')] } });

        const result = await search(handler, { patterns: ['  zpp_  '], includeContents: false });

        expect(recorded.searches[0]).toEqual({ query: 'ZPP_*', objType: 'DEVC/K', max: 100 });
        expect(result.patterns[0]).toMatchObject({ requested: '  zpp_  ', pattern: 'ZPP_*', matches: 1 });
    });

    it('leaves a pattern that already has a wildcard alone', async () => {
        const { handler, recorded } = makeHandler();

        await search(handler, { patterns: ['Z*PP', 'ZPP_*'], includeContents: false });

        expect(recorded.searches.map(s => s.query)).toEqual(['Z*PP', 'ZPP_*']);
    });

    it('searches every pattern and merges the results', async () => {
        const { handler, recorded } = makeHandler({
            hits: {
                'ZPP_*': [pkg('ZPP_LABEL'), pkg('ZPP_KPI')],
                'Z_PP*': [pkg('Z_PP_ALE'), pkg('Z_PP_KPI')]
            }
        });

        const result = await search(handler, { patterns: ['ZPP_*', 'Z_PP*'], includeContents: false });

        expect(recorded.searches).toHaveLength(2);
        expect(result.packageCount).toBe(4);
        // Sorted by name, so the output order does not depend on the pattern order.
        expect(result.packages.map((p: any) => p.name))
            .toEqual(['ZPP_KPI', 'ZPP_LABEL', 'Z_PP_ALE', 'Z_PP_KPI']);
    });

    it('reports a package matched by two patterns once, listing both', async () => {
        const { handler } = makeHandler({
            hits: { 'ZPP_*': [pkg('ZPP_LABEL')], 'ZPP_L*': [pkg('ZPP_LABEL')] }
        });

        const result = await search(handler, { patterns: ['ZPP_*', 'ZPP_L*'], includeContents: false });

        expect(result.packageCount).toBe(1);
        expect(result.packages[0].matchedPatterns).toEqual(['ZPP_*', 'ZPP_L*']);
    });

    it('flags truncation when a pattern fills the cap', async () => {
        // ZPP_* really does exceed 30 on DEV — a capped result must not look complete.
        const { handler } = makeHandler({
            hits: { 'ZPP_*': [pkg('ZPP_A'), pkg('ZPP_B')], 'Z_PP*': [pkg('Z_PP_ALE')] }
        });

        const result = await search(handler, {
            patterns: ['ZPP_*', 'Z_PP*'], maxPerPattern: 2, includeContents: false
        });

        expect(result.patterns[0]).toMatchObject({ pattern: 'ZPP_*', matches: 2, truncated: true });
        expect(result.patterns[1]).toMatchObject({ pattern: 'Z_PP*', matches: 1, truncated: false });
    });

    it('ignores hits that are not packages', async () => {
        // objType only filters on the first segment, so the type is re-checked.
        const { handler } = makeHandler({
            hits: {
                'ZPP_*': [
                    pkg('ZPP_LABEL'),
                    { 'adtcore:uri': '/x', 'adtcore:type': 'CLAS/OC', 'adtcore:name': 'ZPP_CLASS' }
                ]
            }
        });

        const result = await search(handler, { patterns: ['ZPP_*'], includeContents: false });

        expect(result.packages.map((p: any) => p.name)).toEqual(['ZPP_LABEL']);
    });

    it('rejects a missing or empty pattern list', async () => {
        const { handler } = makeHandler();

        await expect(search(handler, {})).rejects.toThrow(/At least one package pattern is required/);
        await expect(search(handler, { patterns: [] })).rejects.toThrow(/At least one package pattern is required/);
        await expect(search(handler, { patterns: ['   '] })).rejects.toThrow(/must not be empty/);
    });
});

describe('searchPackages — contents', () => {
    it('groups objects by type and keeps the human label', async () => {
        const { handler, recorded } = makeHandler({
            hits: { 'Z_PP*': [pkg('Z_PP_KPI')] },
            contents: { Z_PP_KPI: Z_PP_KPI_CONTENTS }
        });

        const result = await search(handler, { patterns: ['Z_PP*'] });
        const found = result.packages[0];

        expect(recorded.expansions).toEqual(['Z_PP_KPI']);
        expect(found.objectCount).toBe(4);
        expect(Object.keys(found.objectsByType).sort()).toEqual(['PROG/P', 'TABL/DS', 'TRAN/T']);
        expect(found.objectsByType['TABL/DS']).toEqual({
            label: 'Structures',
            objects: [
                { name: 'ZPPKPI01', uri: '/sap/bc/adt/ddic/structures/zppkpi01', description: undefined, expandable: false },
                { name: 'ZPPKPI02', uri: '/sap/bc/adt/ddic/structures/zppkpi02', description: undefined, expandable: false }
            ]
        });
        expect(found.objectsByType['PROG/P'].objects[0].expandable).toBe(true);
    });

    it('lists sub-packages separately from objects', async () => {
        const { handler } = makeHandler({
            hits: { 'ZPP_*': [pkg('ZPP_BYSOFT_CAM')] },
            contents: { ZPP_BYSOFT_CAM: SUBPACKAGE_ONLY_CONTENTS }
        });

        const result = await search(handler, { patterns: ['ZPP_*'] });
        const found = result.packages[0];

        expect(found.subPackages).toEqual(['ZPP_BYSOFT_CAM_PM']);
        expect(found.objectCount).toBe(0);
        expect(found.objectsByType).toEqual({});
    });

    it('filters the contents by object type', async () => {
        const { handler } = makeHandler({
            hits: { 'Z_PP*': [pkg('Z_PP_KPI')] },
            contents: { Z_PP_KPI: Z_PP_KPI_CONTENTS }
        });

        const result = await search(handler, { patterns: ['Z_PP*'], objectTypes: ['prog/p'] });
        const found = result.packages[0];

        expect(Object.keys(found.objectsByType)).toEqual(['PROG/P']);
        expect(found.objectCount).toBe(1);
        // The filter never hides sub-packages — they are structure, not contents.
        expect(found.subPackages).toEqual([]);
    });

    it('skips expansion entirely when includeContents is false', async () => {
        const { handler, recorded } = makeHandler({
            hits: { 'Z_PP*': [pkg('Z_PP_KPI')] },
            contents: { Z_PP_KPI: Z_PP_KPI_CONTENTS }
        });

        const result = await search(handler, { patterns: ['Z_PP*'], includeContents: false });

        expect(recorded.expansions).toEqual([]);
        expect(result.packages[0]).not.toHaveProperty('objectsByType');
    });

    it('reports a package it cannot expand without failing the others', async () => {
        const { handler } = makeHandler({
            hits: { 'Z_PP*': [pkg('Z_PP_ALE'), pkg('Z_PP_KPI')] },
            contents: { Z_PP_KPI: Z_PP_KPI_CONTENTS },
            contentsError: { Z_PP_ALE: 'not authorised' }
        });

        const result = await search(handler, { patterns: ['Z_PP*'] });
        const [ale, kpi] = result.packages;

        expect(ale).toMatchObject({ name: 'Z_PP_ALE', error: 'Could not read contents: not authorised' });
        expect(kpi.objectCount).toBe(4);
    });

    it('handles a package with no contents at all', async () => {
        const { handler } = makeHandler({ hits: { 'ZPP_*': [pkg('ZPP_EMPTY')] } });

        const result = await search(handler, { patterns: ['ZPP_*'] });

        expect(result.packages[0]).toMatchObject({ objectCount: 0, subPackages: [], objectsByType: {} });
    });
});

describe('searchPackages — envelope', () => {
    it('returns one already-MCP-shaped envelope', async () => {
        const { handler } = makeHandler({ hits: { 'ZPP_*': [pkg('ZPP_LABEL')] } });

        const envelope = await handler.handle('searchPackages', {
            patterns: ['ZPP_*'], includeContents: false
        });

        expect(Array.isArray(envelope.content)).toBe(true);
        expect(envelope.content[0].type).toBe('text');
        expect(JSON.parse(envelope.content[0].text)).toMatchObject({
            status: 'success',
            packageCount: 1,
            message: 'Package search completed successfully'
        });
    });
});
