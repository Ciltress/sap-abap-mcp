import { McpError } from '@modelcontextprotocol/sdk/types.js';
import type { ADTClient } from 'abap-adt-api';
import { ObjectHandlers } from '../handlers/ObjectHandlers';

/**
 * The composite edit cycle.
 *
 * What this tool exists for is the part of the old four-tool interface that was
 * not in any schema: the order, the lifetime of the lock handle, and that a
 * failure halfway through still obliges an unLock. So the tests that matter most
 * here are the ones about the lock being released — on success, after a failed
 * write, and after a failed activation.
 *
 * It writes to a real SAP system in production, so it is exercised only against
 * the fake client. Nothing here touches a live system.
 */

const PROGRAM = {
    'adtcore:uri': '/sap/bc/adt/programs/programs/zpp_label_druck',
    'adtcore:type': 'PROG/P',
    'adtcore:name': 'ZPP_LABEL_DRUCK',
    'adtcore:packageName': 'ZPP_LABEL',
    'adtcore:description': 'Label printing'
};

const TABLE = {
    'adtcore:uri': '/sap/bc/adt/vit/wb/object_type/tabldt/object_name/ZLABELHEAD',
    'adtcore:type': 'TABL/DT',
    'adtcore:name': 'ZLABELHEAD',
    'adtcore:packageName': 'ZPP_LABEL',
    'adtcore:description': 'A table'
};

const programStructure = {
    objectUrl: PROGRAM['adtcore:uri'],
    metaData: { 'adtcore:type': 'PROG/P', 'abapsource:sourceUri': 'source/main' },
    links: []
};

/** A table has no source link at all, which is how it is told apart from a program. */
const tableStructure = {
    objectUrl: TABLE['adtcore:uri'],
    metaData: { 'adtcore:type': 'TABL/DT' },
    links: []
};

const classStructure = {
    objectUrl: '/sap/bc/adt/oo/classes/zcl_thing',
    metaData: {
        'adtcore:type': 'CLAS/OC',
        'class:visibility': 'public',
        'abapsource:sourceUri': 'source/main'
    },
    includes: [
        { 'class:includeType': 'main', links: [{ href: 'source/main', type: 'text/plain' }] },
        { 'class:includeType': 'testclasses', links: [{ href: 'includes/testclasses', type: 'text/plain' }] }
    ],
    links: []
};

const CLASS_HIT = {
    'adtcore:uri': '/sap/bc/adt/oo/classes/zcl_thing',
    'adtcore:type': 'CLAS/OC',
    'adtcore:name': 'ZCL_THING',
    'adtcore:packageName': 'ZPKG',
    'adtcore:description': 'A class'
};

interface FakeOptions {
    hits?: any[];
    structure?: any;
    lock?: { LOCK_HANDLE: string; CORRNR?: string; IS_LOCAL?: string };
    failWrite?: Error;
    failActivate?: Error;
    failUnlock?: Error;
    activation?: any;
}

function makeHandler(options: FakeOptions = {}) {
    const calls: { method: string; args: any[] }[] = [];
    const record = (method: string, ...args: any[]) => calls.push({ method, args });

    const client = {
        searchObject: async (query: string, objType?: string, max?: number) => {
            record('searchObject', query, objType, max);
            return options.hits ?? [PROGRAM];
        },
        objectStructure: async (url: string) => {
            record('objectStructure', url);
            return options.structure ?? programStructure;
        },
        lock: async (url: string) => {
            record('lock', url);
            return options.lock ?? { LOCK_HANDLE: 'HANDLE-1', CORRNR: '', IS_LOCAL: 'X' };
        },
        setObjectSource: async (url: string, source: string, handle: string, transport?: string) => {
            record('setObjectSource', url, source, handle, transport);
            if (options.failWrite) throw options.failWrite;
        },
        activate: async (name: string, url: string) => {
            record('activate', name, url);
            if (options.failActivate) throw options.failActivate;
            return options.activation ?? { success: true, messages: [] };
        },
        unLock: async (url: string, handle: string) => {
            record('unLock', url, handle);
            if (options.failUnlock) throw options.failUnlock;
        }
    } as unknown as ADTClient;

    return { handler: new ObjectHandlers(client), calls };
}

const edit = async (handler: ObjectHandlers, args: any) => {
    const envelope = await handler.handle('editAbapSource', args);
    return JSON.parse(envelope.content[0].text);
};

const methodsOf = (calls: { method: string }[]) => calls.map(c => c.method);

let consoleError: jest.SpyInstance;
beforeAll(() => { consoleError = jest.spyOn(console, 'error').mockImplementation(() => { }); });
afterAll(() => { consoleError.mockRestore(); });

describe('editAbapSource', () => {
    it('performs the whole cycle in order, from a name alone', async () => {
        const { handler, calls } = makeHandler();

        const result = await edit(handler, {
            objectName: 'zpp_label_druck',
            source: 'REPORT zpp_label_druck.'
        });

        // The unlock comes BEFORE the activation, and that order is not a
        // preference. SAP refuses to activate an object its own editor still
        // holds — "User DE3190 is currently editing Z_MCP_LIVETEST" — verified
        // live on DEV/100, where activating inside the lock failed every time and
        // the same call succeeded the moment the lock was released.
        expect(methodsOf(calls)).toEqual([
            'searchObject', 'objectStructure', 'lock', 'setObjectSource', 'unLock', 'activate'
        ]);
        expect(result.status).toBe('success');
        expect(result.written).toBe(true);
        expect(result.activated).toBe(true);
        expect(result.unlocked).toBe(true);
        expect(result.object).toMatchObject({
            name: 'ZPP_LABEL_DRUCK',
            sourceUrl: '/sap/bc/adt/programs/programs/zpp_label_druck/source/main'
        });
    });

    it('never activates while still holding the lock', async () => {
        // The regression that live testing caught: with the activation inside the
        // lock, every single edit failed at the last step. Pinned separately from
        // the full-order test because this is the rule, not an artefact of it.
        const { handler, calls } = makeHandler();

        await edit(handler, { objectName: 'ZPP_LABEL_DRUCK', source: 'REPORT x.' });

        const methods = methodsOf(calls);
        expect(methods.indexOf('unLock')).toBeLessThan(methods.indexOf('activate'));
    });

    it('takes an objectUrl for an object the repository search cannot see yet', async () => {
        // A freshly created object is real and reachable but INACTIVE, and the
        // repository search only knows active objects — so resolving it by name
        // answered "no object named that was found", which was both wrong and
        // discouraging. This is the create-then-fill path.
        const { handler, calls } = makeHandler();

        const result = await edit(handler, {
            objectUrl: '/sap/bc/adt/programs/programs/z_brand_new',
            source: 'REPORT z_brand_new.'
        });

        expect(methodsOf(calls)).not.toContain('searchObject');
        expect(methodsOf(calls)).toEqual([
            'objectStructure', 'lock', 'setObjectSource', 'unLock', 'activate'
        ]);
        expect(result.object.objectUrl).toBe('/sap/bc/adt/programs/programs/z_brand_new');
    });

    it('asks for one of the two ways of naming the object when given neither', async () => {
        const { handler, calls } = makeHandler();

        await expect(edit(handler, { source: 'REPORT x.' }))
            .rejects.toThrow(/`objectName` for an active object, or `objectUrl`/);

        expect(calls).toHaveLength(0);
    });

    it('passes the lock handle from the lock to the write', async () => {
        const { handler, calls } = makeHandler({
            lock: { LOCK_HANDLE: 'HANDLE-XYZ', IS_LOCAL: 'X' }
        });

        await edit(handler, { objectName: 'ZPP_LABEL_DRUCK', source: 'REPORT x.' });

        const write = calls.find(c => c.method === 'setObjectSource')!;
        expect(write.args[2]).toBe('HANDLE-XYZ');
        const unlock = calls.find(c => c.method === 'unLock')!;
        expect(unlock.args[1]).toBe('HANDLE-XYZ');
    });

    describe('releases the lock', () => {
        it('after a failed write', async () => {
            // The reason this tool exists. A lock left behind is held by the
            // stateful session until dropSession or a restart, and on a shared
            // system that blocks other developers, not just this one.
            const { handler, calls } = makeHandler({ failWrite: new Error('object is in a foreign request') });

            await expect(edit(handler, { objectName: 'ZPP_LABEL_DRUCK', source: 'REPORT x.' }))
                .rejects.toBeInstanceOf(McpError);

            expect(methodsOf(calls)).toContain('unLock');
            expect(methodsOf(calls)).not.toContain('activate');
        });

        it('after a failed activation', async () => {
            const { handler, calls } = makeHandler({ failActivate: new Error('activation blew up') });

            await expect(edit(handler, { objectName: 'ZPP_LABEL_DRUCK', source: 'REPORT x.' }))
                .rejects.toBeInstanceOf(McpError);

            expect(methodsOf(calls)).toContain('unLock');
        });

        it('and says so plainly when it cannot', async () => {
            // Reported, never thrown: an unlock failure must not turn a successful
            // write into an error, nor mask a real failure.
            const { handler } = makeHandler({ failUnlock: new Error('session gone') });

            const result = await edit(handler, { objectName: 'ZPP_LABEL_DRUCK', source: 'REPORT x.' });

            expect(result.unlocked).toBe(false);
            expect(result.warning).toMatch(/NOT unlocked/);
            expect(result.warning).toMatch(/dropSession/);
            expect(result.written).toBe(true);
        });
    });

    describe('transports', () => {
        it('sends none for a local object', async () => {
            const { handler, calls } = makeHandler({
                lock: { LOCK_HANDLE: 'H', CORRNR: '', IS_LOCAL: 'X' }
            });

            const result = await edit(handler, { objectName: 'ZPP_LABEL_DRUCK', source: 'REPORT x.' });

            expect(calls.find(c => c.method === 'setObjectSource')!.args[3]).toBeUndefined();
            expect(result.local).toBe(true);
            expect(result.transport).toBeNull();
        });

        it('uses the request the object is already in, saving a transportInfo call', async () => {
            const { handler, calls } = makeHandler({
                lock: { LOCK_HANDLE: 'H', CORRNR: 'DEVK900123', IS_LOCAL: '' }
            });

            const result = await edit(handler, { objectName: 'ZPP_LABEL_DRUCK', source: 'REPORT x.' });

            expect(calls.find(c => c.method === 'setObjectSource')!.args[3]).toBe('DEVK900123');
            expect(result.transport).toBe('DEVK900123');
        });

        it('prefers the one the caller named', async () => {
            const { handler, calls } = makeHandler({
                lock: { LOCK_HANDLE: 'H', CORRNR: 'DEVK900123', IS_LOCAL: '' }
            });

            await edit(handler, {
                objectName: 'ZPP_LABEL_DRUCK',
                source: 'REPORT x.',
                transport: 'DEVK900999'
            });

            expect(calls.find(c => c.method === 'setObjectSource')!.args[3]).toBe('DEVK900999');
        });
    });

    describe('activation', () => {
        it('reports a syntax error as an unsuccessful activation, not as a failure', async () => {
            // An HTTP success does not mean it activated. A model that only checks
            // for an error would think a broken object went live.
            const { handler } = makeHandler({
                activation: { success: false, messages: [{ shortText: 'Field ZFOO is unknown', type: 'E' }] }
            });

            const result = await edit(handler, { objectName: 'ZPP_LABEL_DRUCK', source: 'REPORT x.' });

            expect(result.status).toBe('success');
            expect(result.written).toBe(true);
            expect(result.activated).toBe(false);
            expect(result.activation.messages[0].shortText).toMatch(/ZFOO/);
            expect(result.message).toMatch(/WRITTEN but NOT activated/);
        });

        it('can be skipped, for objects that have to be activated as a group', async () => {
            const { handler, calls } = makeHandler();

            const result = await edit(handler, {
                objectName: 'ZPP_LABEL_DRUCK',
                source: 'REPORT x.',
                activate: false
            });

            expect(methodsOf(calls)).not.toContain('activate');
            expect(result.written).toBe(true);
            expect(result.activated).toBe(false);
            expect(result.message).toMatch(/activateObjects/);
            // Still unlocked: leaving it inactive is not leaving it locked.
            expect(result.unlocked).toBe(true);
        });
    });

    describe('classes', () => {
        it('writes the main include by default', async () => {
            const { handler, calls } = makeHandler({ hits: [CLASS_HIT], structure: classStructure });

            await edit(handler, { objectName: 'ZCL_THING', source: 'CLASS zcl_thing DEFINITION.' });

            expect(calls.find(c => c.method === 'setObjectSource')!.args[0])
                .toBe('/sap/bc/adt/oo/classes/zcl_thing/source/main');
        });

        it('writes the include that was asked for', async () => {
            const { handler, calls } = makeHandler({ hits: [CLASS_HIT], structure: classStructure });

            await edit(handler, {
                objectName: 'ZCL_THING',
                source: 'CLASS ltcl_test DEFINITION.',
                include: 'testclasses'
            });

            expect(calls.find(c => c.method === 'setObjectSource')!.args[0])
                .toBe('/sap/bc/adt/oo/classes/zcl_thing/includes/testclasses');
        });

        it('names the includes it does have when asked for one it does not', async () => {
            const { handler } = makeHandler({ hits: [CLASS_HIT], structure: classStructure });

            await expect(edit(handler, {
                objectName: 'ZCL_THING',
                source: 'x',
                include: 'macros'
            })).rejects.toThrow(/has: main, testclasses/);
        });
    });

    describe('refuses rather than half-doing', () => {
        it('an object with no source, without locking it first', async () => {
            const { handler, calls } = makeHandler({ hits: [TABLE], structure: tableStructure });

            await expect(edit(handler, { objectName: 'ZLABELHEAD', source: 'anything' }))
                .rejects.toThrow(/no ADT source representation/);

            expect(methodsOf(calls)).not.toContain('lock');
        });

        it('a missing source argument, before touching the system at all', async () => {
            const { handler, calls } = makeHandler();

            await expect(edit(handler, { objectName: 'ZPP_LABEL_DRUCK' }))
                .rejects.toThrow(/complete `source` string is required/);

            expect(calls).toHaveLength(0);
        });

        it('a name that matches nothing', async () => {
            const { handler, calls } = makeHandler({ hits: [] });

            await expect(edit(handler, { objectName: 'ZNOPE', source: 'x' }))
                .rejects.toThrow(/No ABAP object named 'ZNOPE'/);

            expect(methodsOf(calls)).not.toContain('lock');
        });
    });
});
