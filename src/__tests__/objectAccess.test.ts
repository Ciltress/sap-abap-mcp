import type { ADTClient } from 'abap-adt-api';
import { ObjectHandlers } from '../handlers/ObjectHandlers';
import { DdicHandlers } from '../handlers/DdicHandlers';

/**
 * Tests for the by-name access tools, run against a fake ADT client.
 *
 * The fixtures reproduce what DEV/100 returned: a program with a real ADT uri, a
 * database table with a SAP GUI (vit) uri and no source link, and the genuine
 * FUGR/F + FUGR/FF collision on ZPP_EXT_LABEL_DATA.
 */

const hit = (name: string, type: string, uri: string, pkg = 'ZPP_LABEL') => ({
    'adtcore:uri': uri,
    'adtcore:type': type,
    'adtcore:name': name,
    'adtcore:packageName': pkg,
    'adtcore:description': type
});

const PROGRAM = hit('ZPP_LABEL_DRUCK', 'PROG/P', '/sap/bc/adt/programs/programs/zpp_label_druck');
const TABLE = hit('ZLABELHEAD', 'TABL/DT', '/sap/bc/adt/vit/wb/object_type/tabldt/object_name/ZLABELHEAD');
const FUGR_GROUP = hit('ZPP_EXT_LABEL_DATA', 'FUGR/F', '/sap/bc/adt/functions/groups/zpp_ext_label_data');
const FUGR_MODULE = hit('ZPP_EXT_LABEL_DATA', 'FUGR/FF', '/sap/bc/adt/functions/groups/zpp_ext_label_data/fmodules/zpp_ext_label_data');

/** A structure with a source link, the shape ADT returns for a program. */
const sourceStructure = (uri: string, description: string) => ({
    objectUrl: uri,
    metaData: {
        'adtcore:type': 'PROG/P',
        'adtcore:description': description,
        'adtcore:responsible': 'DEVUSER',
        'adtcore:changedBy': 'DEVUSER',
        'abapsource:sourceUri': 'source/main'
    },
    links: []
});

/** A vit structure: no source link at all, which is what a TABL/DT looks like. */
const tableStructure = (uri: string) => ({
    objectUrl: uri,
    metaData: {
        'adtcore:type': 'TABL/DT',
        'adtcore:description': 'Join-Table from ZLABELDATAHEAD to ZLABELDATA'
    },
    links: [{ href: '/sap/bc/adt/classifications?uri=x', rel: 'http://www.sap.com/adt/categories/classifications' }]
});

/**
 * A class structure. `class:visibility` is load-bearing: isClassStructure() keys
 * on exactly that attribute, so a fixture without it is treated as a plain object
 * and `includes` never appears.
 */
const classStructure = (uri: string) => ({
    objectUrl: uri,
    metaData: {
        'adtcore:type': 'CLAS/OC',
        'adtcore:description': 'A class',
        'class:visibility': 'public',
        'class:final': false,
        'abapsource:sourceUri': 'source/main'
    },
    includes: [
        { 'class:includeType': 'main', links: [{ href: 'source/main', type: 'text/plain' }] },
        { 'class:includeType': 'testclasses', links: [{ href: 'includes/testclasses', type: 'text/plain' }] }
    ],
    links: []
});

function makeObjectHandler(options: {
    hits?: any[];
    structures?: Record<string, any>;
    source?: string;
} = {}) {
    const recorded = { searches: [] as any[], structures: [] as string[], sources: [] as string[] };
    const client = {
        searchObject: async (query: string, objType?: string, max?: number) => {
            recorded.searches.push({ query, objType, max });
            return options.hits ?? [];
        },
        objectStructure: async (url: string) => {
            recorded.structures.push(url);
            const s = options.structures?.[url];
            if (!s) throw new Error(`no structure for ${url}`);
            return s;
        },
        getObjectSource: async (url: string) => {
            recorded.sources.push(url);
            return options.source ?? 'REPORT zpp_label_druck.';
        }
    } as unknown as ADTClient;
    return { handler: new ObjectHandlers(client), recorded };
}

async function readObject(handler: ObjectHandlers, args: any) {
    const envelope = await handler.handle('readAbapObject', args);
    return JSON.parse(envelope.content[0].text).object;
}

let consoleError: jest.SpyInstance;
beforeAll(() => { consoleError = jest.spyOn(console, 'error').mockImplementation(() => { }); });
afterAll(() => { consoleError.mockRestore(); });

describe('readAbapObject', () => {
    it('resolves a name to its source in one call', async () => {
        const { handler, recorded } = makeObjectHandler({
            hits: [PROGRAM],
            structures: { [PROGRAM['adtcore:uri']]: sourceStructure(PROGRAM['adtcore:uri'], 'Label printing') },
            source: 'REPORT zpp_label_druck.'
        });

        const object = await readObject(handler, { objectName: 'zpp_label_druck' });

        // The name is upper-cased and the type filter is left off — 'FUGR/FF' would
        // be truncated to 'FUGR' by the library and match groups instead.
        expect(recorded.searches[0]).toEqual({ query: 'ZPP_LABEL_DRUCK', objType: undefined, max: 50 });
        expect(object).toMatchObject({
            name: 'ZPP_LABEL_DRUCK',
            type: 'PROG/P',
            package: 'ZPP_LABEL',
            description: 'Label printing',
            hasSource: true,
            sourceUrl: '/sap/bc/adt/programs/programs/zpp_label_druck/source/main',
            source: 'REPORT zpp_label_druck.'
        });
        expect(recorded.sources).toEqual(['/sap/bc/adt/programs/programs/zpp_label_druck/source/main']);
    });

    it('skips the source read when includeSource is false', async () => {
        const { handler, recorded } = makeObjectHandler({
            hits: [PROGRAM],
            structures: { [PROGRAM['adtcore:uri']]: sourceStructure(PROGRAM['adtcore:uri'], 'Label printing') }
        });

        const object = await readObject(handler, { objectName: 'ZPP_LABEL_DRUCK', includeSource: false });

        expect(recorded.sources).toEqual([]);
        expect(object.hasSource).toBe(true);
        expect(object).not.toHaveProperty('source');
    });

    it('reports an object that has no source instead of inventing a source url', async () => {
        // mainInclude() would otherwise return '<vit uri>/source/main', which 404s.
        const { handler, recorded } = makeObjectHandler({
            hits: [TABLE],
            structures: { [TABLE['adtcore:uri']]: tableStructure(TABLE['adtcore:uri']) }
        });

        const object = await readObject(handler, { objectName: 'ZLABELHEAD' });

        expect(object.hasSource).toBe(false);
        expect(object).not.toHaveProperty('sourceUrl');
        expect(object.hint).toMatch(/describeAbapTable/);
        expect(recorded.sources).toEqual([]);
    });

    it('discloses a name that resolves to several objects', async () => {
        // ZPP_EXT_LABEL_DATA really is both a function group and a function module.
        const { handler } = makeObjectHandler({
            hits: [FUGR_GROUP, FUGR_MODULE],
            structures: {
                [FUGR_MODULE['adtcore:uri']]: sourceStructure(FUGR_MODULE['adtcore:uri'], 'The module')
            }
        });

        const object = await readObject(handler, { objectName: 'ZPP_EXT_LABEL_DATA' });

        // FUGR/FF outranks FUGR/F, and the alternative is always reported.
        expect(object.type).toBe('FUGR/FF');
        expect(object.ambiguous).toBe(true);
        expect(object.alternatives).toEqual([
            { name: 'ZPP_EXT_LABEL_DATA', type: 'FUGR/F', objectUrl: FUGR_GROUP['adtcore:uri'] }
        ]);
    });

    it('honours an explicit objectType', async () => {
        const { handler } = makeObjectHandler({
            hits: [FUGR_GROUP, FUGR_MODULE],
            structures: {
                [FUGR_GROUP['adtcore:uri']]: sourceStructure(FUGR_GROUP['adtcore:uri'], 'The group')
            }
        });

        const object = await readObject(handler, { objectName: 'ZPP_EXT_LABEL_DATA', objectType: 'fugr/f' });

        expect(object.type).toBe('FUGR/F');
        // One candidate remained after filtering, so it is no longer ambiguous —
        // but the other object of that name is still disclosed.
        expect(object.ambiguous).toBe(false);
        expect(object.alternatives).toHaveLength(1);
    });

    it('lists the includes of a class', async () => {
        const uri = '/sap/bc/adt/oo/classes/zcl_foo';
        const { handler } = makeObjectHandler({
            hits: [hit('ZCL_FOO', 'CLAS/OC', uri)],
            structures: { [uri]: classStructure(uri) },
            source: 'CLASS zcl_foo DEFINITION.'
        });

        const object = await readObject(handler, { objectName: 'ZCL_FOO' });

        expect(object.includes).toEqual({
            main: `${uri}/source/main`,
            testclasses: `${uri}/includes/testclasses`
        });
    });

    it('ignores hits whose name only partially matches', async () => {
        const { handler } = makeObjectHandler({ hits: [hit('ZPP_LABEL_DRUCK_V2', 'PROG/P', '/x')] });

        await expect(readObject(handler, { objectName: 'ZPP_LABEL_DRUCK' }))
            .rejects.toThrow(/No ABAP object named 'ZPP_LABEL_DRUCK' was found/);
    });

    it('says what the name is when the requested type does not exist', async () => {
        const { handler } = makeObjectHandler({ hits: [TABLE] });

        await expect(readObject(handler, { objectName: 'ZLABELHEAD', objectType: 'CLAS/OC' }))
            .rejects.toThrow(/exists, but not as CLAS\/OC. Found: TABL\/DT/);
    });

    it('requires a name', async () => {
        const { handler } = makeObjectHandler();
        await expect(readObject(handler, { objectName: '  ' })).rejects.toThrow(/An object name is required/);
    });
});

/** One DFIES row, trimmed to the columns the handler reads. */
const dfies = (row: Record<string, string>) => ({
    TABNAME: 'ZLABELHEAD', FIELDNAME: '', POSITION: '0000', LENG: '000000', DECIMALS: '000000',
    DATATYPE: '', ROLLNAME: '', DOMNAME: '', CHECKTABLE: '', CONVEXIT: '', FIELDTEXT: '', KEYFLAG: '',
    ...row
});

function makeDdicHandler(reply?: any, fail?: string) {
    const recorded: any[] = [];
    const client = { language: 'EN' } as unknown as ADTClient;
    const call = async (fm: string, input: Record<string, any>, output: string[]) => {
        recorded.push({ fm, input, output });
        if (fail) throw new Error(fail);
        return { output: reply ?? {} };
    };
    return { handler: new DdicHandlers(client, call), recorded };
}

async function describeTable(handler: DdicHandlers, args: any) {
    const envelope = await handler.handle('describeAbapTable', args);
    return JSON.parse(envelope.content[0].text).table;
}

describe('describeAbapTable', () => {
    const REPLY = {
        DDOBJTYPE: 'TRANSP',
        DFIES_TAB: [
            dfies({ FIELDNAME: 'MANDT', POSITION: '0001', DATATYPE: 'CLNT', LENG: '000003', KEYFLAG: 'X', ROLLNAME: 'MANDT', DOMNAME: 'MANDT', FIELDTEXT: 'Client' }),
            dfies({ FIELDNAME: 'WERK', POSITION: '0003', DATATYPE: 'CHAR', LENG: '000004', KEYFLAG: 'X', ROLLNAME: 'WERKS_D', DOMNAME: 'WERKS', FIELDTEXT: 'Plant', CHECKTABLE: 'T001W' }),
            dfies({ FIELDNAME: 'KDPOS', POSITION: '0007', DATATYPE: 'NUMC', LENG: '000006', ROLLNAME: 'CO_KDPOS', FIELDTEXT: 'Sales Order Item' }),
            dfies({ FIELDNAME: 'EQUNR', POSITION: '0005', DATATYPE: 'CHAR', LENG: '000018', ROLLNAME: 'EQUNR', CONVEXIT: 'ALPHA', FIELDTEXT: 'Equipment Number' })
        ]
    };

    it('condenses the dictionary rows and marks the key', async () => {
        const { handler, recorded } = makeDdicHandler(REPLY);

        const table = await describeTable(handler, { tableName: 'zlabelhead' });

        expect(recorded[0].fm).toBe('DDIF_FIELDINFO_GET');
        expect(recorded[0].input).toEqual({ TABNAME: 'ZLABELHEAD' });
        expect(table).toMatchObject({
            name: 'ZLABELHEAD',
            ddObjType: 'TRANSP',
            kind: 'Transparent table',
            fieldCount: 4,
            keyFields: ['MANDT', 'WERK']
        });
        expect(table.fields[0]).toEqual({
            name: 'MANDT', position: 1, key: true, type: 'CLNT', length: 3, decimals: undefined,
            text: 'Client', dataElement: 'MANDT', domain: 'MANDT',
            checkTable: undefined, conversionExit: undefined
        });
        // The foreign key target is the cheapest way to see how tables join.
        expect(table.fields[1].checkTable).toBe('T001W');
        expect(table.fields[3].conversionExit).toBe('ALPHA');
    });

    it('parses the zero-padded numeric columns', async () => {
        const { handler } = makeDdicHandler(REPLY);
        const table = await describeTable(handler, { tableName: 'ZLABELHEAD' });

        expect(table.fields.map((f: any) => f.position)).toEqual([1, 3, 7, 5]);
        expect(table.fields.map((f: any) => f.length)).toEqual([3, 4, 6, 18]);
    });

    it('sends an explicit language, truncated to the one character SYST-LANGU holds', async () => {
        // Passing the two-letter session language ('EN') makes the RFC layer fail
        // deserialization with -32602, so it is cut to a single character.
        const { handler, recorded } = makeDdicHandler(REPLY);

        await describeTable(handler, { tableName: 'ZLABELHEAD', language: 'D' });
        expect(recorded[0].input.LANGU).toBe('D');

        await describeTable(handler, { tableName: 'ZLABELHEAD', language: 'en' });
        expect(recorded[1].input.LANGU).toBe('E');
    });

    it('reports an unknown table rather than an empty field list', async () => {
        const { handler } = makeDdicHandler({ DDOBJTYPE: '', DFIES_TAB: [] });

        await expect(describeTable(handler, { tableName: 'ZZ_NOPE' }))
            .rejects.toThrow(/'ZZ_NOPE' is not a table, structure or view/);
    });

    it('requires a table name', async () => {
        const { handler } = makeDdicHandler(REPLY);
        await expect(describeTable(handler, {})).rejects.toThrow(/A table name is required/);
    });

    it('says so when the JSON-RPC route is not wired in', async () => {
        const handler = new DdicHandlers({ language: 'EN' } as unknown as ADTClient);

        await expect(describeTable(handler, { tableName: 'T000' }))
            .rejects.toThrow(/needs the JSON-RPC route, which is not wired/);
    });

    it('surfaces a failure from the RFC call', async () => {
        const { handler } = makeDdicHandler(undefined, 'JSON-RPC error -32601');

        await expect(describeTable(handler, { tableName: 'T000' }))
            .rejects.toThrow(/Failed to describe table: JSON-RPC error -32601/);
    });
});
