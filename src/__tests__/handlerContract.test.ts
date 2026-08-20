import type { ADTClient } from 'abap-adt-api';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import type { BaseHandler } from '../handlers/BaseHandler';
import type { ToolDefinition, ToolProperty } from '../types/tools';
import type { RfcBatchCall } from '../types/rfc';

import { AuthHandlers } from '../handlers/AuthHandlers';
import { TransportHandlers } from '../handlers/TransportHandlers';
import { ObjectHandlers } from '../handlers/ObjectHandlers';
import { ClassHandlers } from '../handlers/ClassHandlers';
import { CodeAnalysisHandlers } from '../handlers/CodeAnalysisHandlers';
import { ObjectLockHandlers } from '../handlers/ObjectLockHandlers';
import { ObjectSourceHandlers } from '../handlers/ObjectSourceHandlers';
import { ObjectDeletionHandlers } from '../handlers/ObjectDeletionHandlers';
import { ObjectManagementHandlers } from '../handlers/ObjectManagementHandlers';
import { ObjectRegistrationHandlers } from '../handlers/ObjectRegistrationHandlers';
import { NodeHandlers } from '../handlers/NodeHandlers';
import { DiscoveryHandlers } from '../handlers/DiscoveryHandlers';
import { UnitTestHandlers } from '../handlers/UnitTestHandlers';
import { PrettyPrinterHandlers } from '../handlers/PrettyPrinterHandlers';
import { GitHandlers } from '../handlers/GitHandlers';
import { DdicHandlers } from '../handlers/DdicHandlers';
import { ServiceBindingHandlers } from '../handlers/ServiceBindingHandlers';
import { QueryHandlers } from '../handlers/QueryHandlers';
import { FeedHandlers } from '../handlers/FeedHandlers';
import { DebugHandlers } from '../handlers/DebugHandlers';
import { RenameHandlers } from '../handlers/RenameHandlers';
import { AtcHandlers } from '../handlers/AtcHandlers';
import { TraceHandlers } from '../handlers/TraceHandlers';
import { RefactorHandlers } from '../handlers/RefactorHandlers';
import { RevisionHandlers } from '../handlers/RevisionHandlers';
import { JsonRemoteFunctionCallHandlers } from '../handlers/JsonRemoteFunctionCallHandlers';
import { DocsHandlers } from '../handlers/DocsHandlers';
import { SkillsHandlers } from '../handlers/SkillsHandlers';
import { BasisHandlers } from '../handlers/BasisHandlers';

/**
 * The contract every handler owes its caller, checked for every tool in the
 * catalogue rather than handler by handler.
 *
 * These handlers are thin wrappers over abap-adt-api, so the bugs that actually
 * occur are not in their logic but at their edges: an argument passed to the
 * wrong API method, a response wrapped twice, an error that escapes as a raw
 * TypeError, or a failure reported as `status:"success"`. Those are uniform
 * properties, so they are asserted uniformly — driven by each tool's own
 * inputSchema, which means a newly added tool is covered the moment it is
 * listed, with no fixture to write.
 *
 * The deep, behavioural suites live next door: jsonRpcHandlers.test.ts,
 * searchPackages.test.ts and objectAccess.test.ts.
 */

/** Properties of ADTClient that handlers read as values rather than call. */
const CLIENT_PROPERTIES: Record<string, any> = {
    language: 'EN',
    client: '100',
    baseUrl: 'https://sap.example.com:44301',
    username: 'TESTUSER',
    stateful: 'stateful',
    isStateful: true,
    loggedin: true,
    csrfToken: 'token',
    sessionID: 'session'
};

const SEARCH_HIT = {
    'adtcore:uri': '/sap/bc/adt/oo/classes/zcl_x',
    'adtcore:type': 'CLAS/OC',
    'adtcore:name': 'ZCL_X',
    'adtcore:packageName': 'ZPKG',
    'adtcore:description': 'A class'
};

const STRUCTURE = {
    objectUrl: '/sap/bc/adt/oo/classes/zcl_x',
    metaData: {
        'adtcore:type': 'CLAS/OC',
        'adtcore:name': 'ZCL_X',
        'adtcore:description': 'A class',
        'class:visibility': 'public',
        'abapsource:sourceUri': 'source/main'
    },
    includes: [{ 'class:includeType': 'main', links: [{ href: 'source/main', type: 'text/plain' }] }],
    links: [{ href: 'source/main', type: 'text/plain' }]
};

/**
 * What the fake ADTClient answers per method. Only the shapes handlers actually
 * index into need to be right; everything else gets a neutral object.
 */
const CANNED: Record<string, any> = {
    searchObject: [SEARCH_HIT],
    objectStructure: STRUCTURE,
    getObjectSource: 'REPORT zx.\nENDREPORT.',
    nodeContents: { nodes: [], categories: [], objectTypes: [] },
    mainPrograms: [{ 'adtcore:uri': '/sap/bc/adt/programs/programs/zx', 'adtcore:name': 'ZX' }],
    findObjectPath: [{ 'adtcore:name': 'ZPKG', 'adtcore:type': 'DEVC/K' }],
    objectTypes: [{ type: 'CLAS/OC', name: 'Class' }],
    transportInfo: { LOCKS: undefined, TRANSPORTS: [] },
    userTransports: { workbench: [], customizing: [] },
    transportsByConfig: { workbench: [], customizing: [] },
    lock: { LOCK_HANDLE: 'HANDLE', CORRNR: '', IS_LOCAL: 'X' },
    syntaxCheck: [],
    codeCompletion: [],
    unitTestRun: [],
    atcCustomizing: { properties: [], exemptionProposals: [] },
    gitRepos: [],
    revisions: [],
    feeds: [],
    dumps: { dumps: [] }
};

/**
 * What the injected RfcCaller answers per function module. Handlers that go over
 * JSON-RPC do not touch ADTClient at all, so without these they would have no
 * success path here and would silently escape the contract.
 */
const CANNED_RFC: Record<string, any> = {
    DDIF_FIELDINFO_GET: {
        DDOBJTYPE: 'TRANSP',
        DFIES_TAB: [{
            TABNAME: 'ZX', FIELDNAME: 'MANDT', POSITION: '0001', LENG: '000003', DECIMALS: '000000',
            DATATYPE: 'CLNT', ROLLNAME: 'MANDT', DOMNAME: 'MANDT', CHECKTABLE: '', CONVEXIT: '',
            FIELDTEXT: 'Client', KEYFLAG: 'X'
        }]
    },
    TH_USER_LIST: {
        LIST: [],
        USRLIST: [{
            TID: 1, MANDT: '100', BNAME: 'TESTUSER', TCODE: 'SE80', TERM: 'HOST', ZEIT: '120000',
            MASTER: '', TRACE: 0, EXTMODI: 1, INTMODI: 1, TYPE: 4, STAT: 2, PROTOCOL: -1,
            GUIVERSION: '800', RFC_TYPE: '', HOSTADDR: '10.0.0.1'
        }]
    }
};

/**
 * TH_GET_PARAMETER answers per parameter name, so the batch stub has to look at
 * the input rather than the function module alone. Anything not here answers
 * rc 4, which is how the kernel says it knows no such parameter.
 */
const CANNED_PROFILE: Record<string, { PARAMETER_VALUE: string; RC: number }> = {
    'icm/server_port_0': { PARAMETER_VALUE: 'PROT=HTTPS, PORT=44301, TIMEOUT=300, VCLIENT=1', RC: 0 },
    'icm/HTTPS/verify_client': { PARAMETER_VALUE: '0', RC: 0 },
    'login/certificate_mapping_rulebased': { PARAMETER_VALUE: '1', RC: 0 },
    'snc/enable': { PARAMETER_VALUE: '1', RC: 0 },
    'login/fails_to_user_lock': { PARAMETER_VALUE: '3', RC: 0 }
};

/** Recording stand-in for ADTClient: every method call is captured. */
function makeClient(options: { fail?: boolean } = {}) {
    const calls: { method: string; args: any[] }[] = [];

    const httpClient = {
        loggedin: true,
        request: async (...args: any[]) => {
            calls.push({ method: 'httpClient.request', args });
            if (options.fail) throw new Error('simulated transport failure');
            return {
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
                status: 200,
                statusText: 'OK',
                headers: {}
            };
        }
    };

    const client = new Proxy({} as any, {
        get(_target, property: string) {
            if (property === 'httpClient') return httpClient;
            // Must not look like a promise, or awaiting the proxy would hang.
            if (property === 'then' || property === 'catch' || property === 'finally') return undefined;
            if (property in CLIENT_PROPERTIES) return CLIENT_PROPERTIES[property];
            return async (...args: any[]) => {
                calls.push({ method: property, args });
                if (options.fail) throw new Error('simulated ADT failure');
                return CANNED[property] ?? {};
            };
        }
    }) as ADTClient;

    // Records into the same list and fails with the same switch, so an RFC-backed
    // tool is held to the delegation and failure contracts like any other.
    const rfcCaller = async (functionModuleName: string, input: Record<string, any>, output: string[]) => {
        calls.push({ method: `rfc:${functionModuleName}`, args: [input, output] });
        if (options.fail) throw new Error('simulated RFC failure');
        return { output: CANNED_RFC[functionModuleName] ?? {} };
    };

    // The batch route needs the same treatment, and for the same reason: without
    // it a tool that reads several function modules at once has no success path
    // here, so `delegates to the backend` returns early and the tool escapes.
    const rfcBatchCaller = async (batch: RfcBatchCall[]) => {
        calls.push({ method: `rfcBatch:${batch.map(c => c.functionModuleName).join('+')}`, args: [batch] });
        if (options.fail) throw new Error('simulated RFC batch failure');

        return {
            ok: true,
            calls: batch.map(call => ({
                functionModule: call.functionModuleName,
                ok: true,
                output: call.functionModuleName === 'TH_GET_PARAMETER'
                    ? (CANNED_PROFILE[String(call.inputParameters?.PARAMETER_NAME ?? '')]
                        ?? { PARAMETER_VALUE: '', RC: 4 })
                    : (CANNED_RFC[call.functionModuleName] ?? {})
            }))
        };
    };

    return { client, calls, rfcCaller, rfcBatchCaller };
}

const noop = async () => { };
type Stubs = ReturnType<typeof makeClient>;
type RfcStub = Stubs['rfcCaller'];
type RfcBatchStub = Stubs['rfcBatchCaller'];

function buildHandlers(client: ADTClient, rfcCaller: RfcStub, rfcBatchCaller: RfcBatchStub): BaseHandler[] {
    return [
        new AuthHandlers(client),
        new TransportHandlers(client),
        new ObjectHandlers(client),
        new ClassHandlers(client),
        new CodeAnalysisHandlers(client),
        new ObjectLockHandlers(client),
        new ObjectSourceHandlers(client),
        new ObjectDeletionHandlers(client),
        new ObjectManagementHandlers(client),
        new ObjectRegistrationHandlers(client),
        new NodeHandlers(client),
        new DiscoveryHandlers(client),
        new UnitTestHandlers(client),
        new PrettyPrinterHandlers(client),
        new GitHandlers(client),
        new DdicHandlers(client, rfcCaller),
        new ServiceBindingHandlers(client),
        new QueryHandlers(client),
        new FeedHandlers(client),
        new DebugHandlers(client),
        new RenameHandlers(client),
        new AtcHandlers(client),
        new TraceHandlers(client),
        new RefactorHandlers(client),
        new RevisionHandlers(client),
        new JsonRemoteFunctionCallHandlers(client, noop),
        new DocsHandlers(client),
        new SkillsHandlers(client),
        new BasisHandlers(client, rfcCaller, rfcBatchCaller)
    ];
}

/** Every handler, wired to one set of recording stubs. */
const handlersFrom = (stubs: Stubs) => buildHandlers(stubs.client, stubs.rfcCaller, stubs.rfcBatchCaller);

/** A plausible value for one declared argument, derived from its schema. */
function sampleValue(name: string, property: ToolProperty): any {
    if (property.enum?.length) return property.enum[0];
    switch (property.type) {
        case 'string':
            // URL-ish arguments get something URL-shaped; several handlers slice them.
            if (/url|uri/i.test(name)) return '/sap/bc/adt/oo/classes/zcl_x/source/main';
            if (/source|code/i.test(name)) return 'REPORT zx.';
            return 'ZX';
        case 'number': return 1;
        case 'boolean': return true;
        case 'array': return property.items ? [sampleValue(name, property.items)] : [];
        case 'object':
            return property.properties
                ? Object.fromEntries(
                    Object.entries(property.properties).map(([k, v]) => [k, sampleValue(k, v)]))
                : {};
        default: return 'ZX';
    }
}

function sampleArgs(tool: ToolDefinition): Record<string, any> {
    return Object.fromEntries(
        Object.entries(tool.inputSchema.properties).map(([name, property]) => [name, sampleValue(name, property)])
    );
}

/** Every (handler, tool) pair, for table-driven cases. */
const catalogue = handlersFrom(makeClient())
    .flatMap(handler => handler.getTools().map(tool => ({ handler: handler.constructor.name, tool })));

/**
 * Tools that legitimately answer without touching ADTClient. `login` drives the
 * SPNEGO bootstrap callback instead — the whole point of this fork is that no
 * credentials go through the ADT client.
 */
const NO_CLIENT_CALL_EXPECTED = new Set<string>([
    'login',
    // Serve documentation and skills off disk — there is no SAP call to make.
    'readServerGuide',
    'readSkill'
]);

/**
 * Tools whose failure shape is a payload rather than a thrown error, and what
 * that payload must say. `checkJsonRpcEndpoint` is a probe: "the node is
 * unreachable" is its answer, not its failure, which is exactly what makes it
 * useful for telling an inactive SICF node apart from a CSRF problem.
 */
const FAILURE_IN_PAYLOAD: Record<string, (payload: any) => void> = {
    checkJsonRpcEndpoint: payload => {
        expect(payload.endpoint.reachable).toBe(false);
        expect(payload.endpoint.problem).toMatch(/simulated transport failure/);
    }
};

let consoleError: jest.SpyInstance;
beforeAll(() => { consoleError = jest.spyOn(console, 'error').mockImplementation(() => { }); });
afterAll(() => { consoleError.mockRestore(); });

describe('every tool honours the response contract', () => {
    it.each(catalogue.map(c => [c.handler, c.tool.name, c.tool] as const))(
        '%s.%s returns one single-level MCP envelope',
        async (handlerName, _toolName, tool) => {
            const stubs = makeClient();
            const handler = handlersFrom(stubs).find(h => h.constructor.name === handlerName)!;

            let result: any;
            try {
                result = await handler.handle(tool.name, sampleArgs(tool));
            } catch (error) {
                // Rejecting is allowed; rejecting with something other than an
                // McpError is not — that reaches the client as "Internal error".
                expect(error).toBeInstanceOf(McpError);
                return;
            }

            expect(Array.isArray(result?.content)).toBe(true);
            expect(result.content.length).toBeGreaterThan(0);
            expect(result.content[0].type).toBe('text');
            expect(typeof result.content[0].text).toBe('string');

            // Exactly one level of JSON: parsing once must yield an object, not
            // another JSON string. That is the double-wrapping regression.
            const payload = JSON.parse(result.content[0].text);
            expect(typeof payload).toBe('object');
            expect(payload).not.toBeNull();
        }
    );
});

describe('every tool reports a backend failure as an McpError', () => {
    it.each(catalogue.map(c => [c.handler, c.tool.name, c.tool] as const))(
        '%s.%s surfaces the failure',
        async (handlerName, _toolName, tool) => {
            const stubs = makeClient({ fail: true });
            const handler = handlersFrom(stubs).find(h => h.constructor.name === handlerName)!;

            let result: any;
            try {
                result = await handler.handle(tool.name, sampleArgs(tool));
            } catch (error) {
                expect(error).toBeInstanceOf(McpError);
                return;
            }

            const payload = JSON.parse(result.content[0].text);

            // A tool may report the failure in its payload instead of throwing,
            // but only if that is its documented contract — and then the payload
            // has to actually say so.
            const documented = FAILURE_IN_PAYLOAD[tool.name];
            if (documented) {
                documented(payload);
                return;
            }

            // Otherwise: returning is fine, claiming success is not.
            expect(`${handlerName}.${tool.name}: ${JSON.stringify(payload).slice(0, 120)}`)
                .not.toMatch(/"status"\s*:\s*"success"/);
        }
    );
});

describe('every tool delegates to the ADT client', () => {
    it.each(catalogue.map(c => [c.handler, c.tool.name, c.tool] as const))(
        '%s.%s calls the backend',
        async (handlerName, toolName, tool) => {
            if (NO_CLIENT_CALL_EXPECTED.has(toolName)) return;

            const stubs = makeClient();
            const { calls } = stubs;
            const handler = handlersFrom(stubs).find(h => h.constructor.name === handlerName)!;

            try {
                await handler.handle(tool.name, sampleArgs(tool));
            } catch {
                // A tool that rejects the generated arguments still proves nothing
                // about delegation; only a successful call is evidence.
                return;
            }

            expect(`${handlerName}.${toolName} called: ${calls.map(c => c.method).join(',') || '<nothing>'}`)
                .not.toMatch(/<nothing>/);
        }
    );
});

describe('every tool survives being called with no arguments', () => {
    it.each(catalogue.map(c => [c.handler, c.tool.name, c.tool] as const))(
        '%s.%s fails cleanly without arguments',
        async (handlerName, _toolName, tool) => {
            const stubs = makeClient();
            const handler = handlersFrom(stubs).find(h => h.constructor.name === handlerName)!;

            try {
                const result = await handler.handle(tool.name, {});
                expect(Array.isArray(result?.content)).toBe(true);
            } catch (error) {
                // A missing mandatory argument must be an McpError, never a
                // TypeError from reading a property of undefined.
                expect(error).toBeInstanceOf(McpError);
            }
        }
    );

    it.each(catalogue.map(c => [c.handler, c.tool.name, c.tool] as const))(
        '%s.%s fails cleanly with undefined arguments',
        async (handlerName, _toolName, tool) => {
            const stubs = makeClient();
            const handler = handlersFrom(stubs).find(h => h.constructor.name === handlerName)!;

            try {
                const result = await handler.handle(tool.name, undefined);
                expect(Array.isArray(result?.content)).toBe(true);
            } catch (error) {
                expect(error).toBeInstanceOf(McpError);
            }
        }
    );
});

describe('argument mapping', () => {
    /**
     * Spot checks that pin the argument order handed to abap-adt-api. These are
     * the mappings a refactor silently breaks, because the wrapper keeps
     * compiling and the envelope keeps looking right.
     */
    const cases: { handler: string; tool: string; args: any; method: string; expected: any[] }[] = [
        {
            // Deliberately NOT a pass-through, and the exception is the point:
            // abap-adt-api truncates objType to its first segment, so sending
            // 'CLAS/OC' would ask the server for every CLAS and 'FUGR/FF' would
            // match function groups. The filter is withheld and applied to
            // adtcore:type in the handler, and `max` is over-fetched (x10, capped
            // at 1000) so that filtering client-side cannot return fewer results
            // than the caller asked for. See ObjectHandlers.handleSearchObject.
            handler: 'ObjectHandlers', tool: 'searchObject',
            args: { query: 'ZCL_X*', objType: 'CLAS/OC', max: 42 },
            method: 'searchObject', expected: ['ZCL_X*', undefined, 420]
        },
        {
            handler: 'ObjectHandlers', tool: 'objectStructure',
            args: { objectUrl: '/sap/bc/adt/oo/classes/zcl_x', version: 'active' },
            method: 'objectStructure', expected: ['/sap/bc/adt/oo/classes/zcl_x', 'active']
        },
        {
            handler: 'NodeHandlers', tool: 'nodeContents',
            args: { parent_type: 'DEVC/K', parent_name: 'ZPKG' },
            method: 'nodeContents', expected: ['DEVC/K', 'ZPKG', undefined, undefined, undefined, undefined]
        },
        {
            handler: 'ObjectSourceHandlers', tool: 'getObjectSource',
            args: { objectSourceUrl: '/sap/bc/adt/oo/classes/zcl_x/source/main', options: { version: 'inactive' } },
            method: 'getObjectSource', expected: ['/sap/bc/adt/oo/classes/zcl_x/source/main', { version: 'inactive' }]
        },
        {
            handler: 'ObjectLockHandlers', tool: 'lock',
            args: { objectUrl: '/sap/bc/adt/oo/classes/zcl_x', accessMode: 'MODIFY' },
            method: 'lock', expected: ['/sap/bc/adt/oo/classes/zcl_x', 'MODIFY']
        }
    ];

    it.each(cases.map(c => [`${c.handler}.${c.tool}`, c] as const))(
        '%s passes its arguments through in order',
        async (_label, testCase) => {
            const stubs = makeClient();
            const { calls } = stubs;
            const handler = handlersFrom(stubs).find(h => h.constructor.name === testCase.handler)!;

            await handler.handle(testCase.tool, testCase.args);

            const call = calls.find(c => c.method === testCase.method);
            expect(`${testCase.method} called: ${!!call}`).toBe(`${testCase.method} called: true`);
            expect(call!.args.slice(0, testCase.expected.length)).toEqual(testCase.expected);
        }
    );
});
