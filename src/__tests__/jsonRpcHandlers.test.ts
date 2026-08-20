import { adtException } from 'abap-adt-api';
import type { ADTClient } from 'abap-adt-api';
import type { HttpClientResponse, RequestOptions } from 'abap-adt-api/build/AdtHTTP';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { JsonRemoteFunctionCallHandlers } from '../handlers/JsonRemoteFunctionCallHandlers';

/**
 * Integration tests for the JSON-RPC path, run against a fake SAP Gateway node
 * instead of a real system.
 *
 * They cover the same ground as the live checks in docs/JSON-RPC.md §8 —
 * signature lookup, request construction, error mapping, session handling — but
 * without a reachable SAP system or a Kerberos ticket, so they run in CI. The
 * live counterpart is scripts/live-jsonrpc-check.mjs, which needs both.
 *
 * The fixtures below reproduce what DEV/100 actually answered; see §3 of
 * docs/JSON-RPC.md for why the wire format looks the way it does (flat result
 * keyed by UPPERCASE ABAP parameter names, inputs echoed back).
 */

/** What the fake node answers for one call. */
type Reply =
    | { result: any }
    | { error: { code: number; message: string; data?: any } }
    | { body: string; status?: number }
    | { fail: unknown };

/**
 * Called with the request it answers, plus every request of the same round trip
 * so a test can build a whole batch envelope.
 */
type Script = Reply | ((request: any, requests: any[]) => Reply);

function httpResponse(body: string, status = 200): HttpClientResponse {
    return { body, status, statusText: status === 200 ? 'OK' : 'Error', headers: {} };
}

/**
 * Stands in for the AdtHTTP instance the handler talks to. It implements the
 * two members the handler uses — `loggedin` and `request()` — and records every
 * request, so the tests can assert on what actually went over the wire.
 */
class FakeJsonRpcNode {
    /** Mirrors AdtHTTP.loggedin: false until an SSO session has been injected. */
    loggedin = false;
    /** How often the SSO bootstrap callback ran. */
    bootstraps = 0;
    readonly calls: {
        path: string;
        config: RequestOptions;
        /** The parsed body: an object for a single request, an array for a batch. */
        payload: any;
        /** The same body normalised to a list, whichever form it took. */
        requests: any[];
        batch: boolean;
    }[] = [];
    private readonly scripts = new Map<string, Script[]>();

    /**
     * Queues the replies for one JSON-RPC method. With several, each call
     * consumes the next; the last one is reused for every further call.
     */
    on(method: string, ...replies: Script[]): this {
        this.scripts.set(method.toUpperCase(), replies);
        return this;
    }

    /** Stands in for index.ts's `() => this.ensureSsoSession()`. */
    readonly bootstrap = async (): Promise<void> => {
        this.bootstraps++;
        this.loggedin = true;
    };

    readonly request = async (path: string, config: RequestOptions): Promise<HttpClientResponse> => {
        const payload = JSON.parse(String(config.body));
        const batch = Array.isArray(payload);
        const requests: any[] = batch ? payload : [payload];
        this.calls.push({ path, config, payload, requests, batch });

        const replies: any[] = [];
        for (const request of requests) {
            const queue = this.scripts.get(String(request.method).toUpperCase());
            if (!queue?.length) throw new Error(`No reply scripted for JSON-RPC method '${request.method}'`);
            const script = queue.length > 1 ? queue.shift()! : queue[0];
            const reply = typeof script === 'function' ? script(request, requests) : script;

            if ('fail' in reply) throw reply.fail;
            // A scripted raw body replaces the whole envelope, batch included.
            if ('body' in reply) return httpResponse(reply.body, reply.status);
            replies.push({ jsonrpc: '2.0', id: request.id, ...reply });
        }

        return httpResponse(JSON.stringify(batch ? replies : replies[0]));
    };

    get lastCall() { return this.calls[this.calls.length - 1]; }
    /** Every method sent, flattened across round trips. */
    methodsCalled(): string[] { return this.calls.flatMap(c => c.requests.map(r => r.method)); }
}

interface AdtStubs {
    searchObject?: (...args: any[]) => Promise<any>;
    objectStructure?: (...args: any[]) => Promise<any>;
    getObjectSource?: (...args: any[]) => Promise<any>;
}

/** Only the members the handler touches; everything else stays unimplemented. */
function fakeClient(node: FakeJsonRpcNode, stubs: AdtStubs = {}): ADTClient {
    return {
        httpClient: node,
        client: '100',
        language: 'EN',
        searchObject: stubs.searchObject ?? (async () => []),
        objectStructure: stubs.objectStructure ?? (async () => { throw new Error('no ADT structure'); }),
        getObjectSource: stubs.getObjectSource ?? (async () => { throw new Error('no ADT source'); })
    } as unknown as ADTClient;
}

/** One row of the PARAMS table of RFC_GET_FUNCTION_INTERFACE (structure RFC_FUNINT). */
const paramRow = (row: Record<string, string>) => ({
    PARAMETER: '', PARAMCLASS: '', TABNAME: '', FIELDNAME: '',
    EXID: '', POSITION: '', OFFSET: '', DEFAULT: '', PARAMTEXT: '', OPTIONAL: '',
    ...row
});

const INTERFACES: Record<string, any> = {
    RFC_SYSTEM_INFO: {
        FUNCNAME: 'RFC_SYSTEM_INFO',
        PARAMS: [
            paramRow({ PARAMETER: 'RFCSI_EXPORT', PARAMCLASS: 'E', TABNAME: 'RFCSI', PARAMTEXT: 'System info' })
        ]
    },
    STFC_CONNECTION: {
        FUNCNAME: 'STFC_CONNECTION',
        PARAMS: [
            paramRow({ PARAMETER: 'REQUTEXT', PARAMCLASS: 'I', TABNAME: 'SY', FIELDNAME: 'LISEL' }),
            paramRow({ PARAMETER: 'ECHOTEXT', PARAMCLASS: 'E', TABNAME: 'SY', FIELDNAME: 'LISEL' }),
            paramRow({ PARAMETER: 'RESPTEXT', PARAMCLASS: 'E', TABNAME: 'SY', FIELDNAME: 'LISEL' })
        ]
    },
    RFC_READ_TABLE: {
        FUNCNAME: 'RFC_READ_TABLE',
        PARAMS: [
            paramRow({ PARAMETER: 'QUERY_TABLE', PARAMCLASS: 'I', TABNAME: 'DD02L', FIELDNAME: 'TABNAME' }),
            paramRow({ PARAMETER: 'DELIMITER', PARAMCLASS: 'I', TABNAME: 'SONV', FIELDNAME: 'FLAG', DEFAULT: 'SPACE' }),
            paramRow({ PARAMETER: 'ROWCOUNT', PARAMCLASS: 'I', TABNAME: 'SOID', FIELDNAME: 'ACCNT', OPTIONAL: 'X' }),
            paramRow({ PARAMETER: 'FIELDS', PARAMCLASS: 'T', TABNAME: 'RFC_DB_FLD' }),
            paramRow({ PARAMETER: 'DATA', PARAMCLASS: 'T', TABNAME: 'TAB512' }),
            paramRow({ PARAMETER: 'OPTIONS', PARAMCLASS: 'T', TABNAME: 'RFC_DB_OPT' }),
            paramRow({ PARAMETER: 'TABLE_NOT_AVAILABLE', PARAMCLASS: 'X' })
        ]
    },
    // The pairing the batch API exists for: an update BAPI and its commit have to
    // share one LUW, so they have to travel in one request.
    BAPI_USER_LOCK: {
        FUNCNAME: 'BAPI_USER_LOCK',
        PARAMS: [
            paramRow({ PARAMETER: 'USERNAME', PARAMCLASS: 'I', TABNAME: 'XUBNAME' }),
            paramRow({ PARAMETER: 'RETURN', PARAMCLASS: 'T', TABNAME: 'BAPIRET2' })
        ]
    },
    BAPI_TRANSACTION_COMMIT: {
        FUNCNAME: 'BAPI_TRANSACTION_COMMIT',
        PARAMS: [
            paramRow({ PARAMETER: 'WAIT', PARAMCLASS: 'I', TABNAME: 'BAPIRTGB', FIELDNAME: 'WAIT', OPTIONAL: 'X' }),
            paramRow({ PARAMETER: 'RETURN', PARAMCLASS: 'E', TABNAME: 'BAPIRET2' })
        ]
    }
};

const FUNCTION_GROUPS: Record<string, string> = {
    RFC_SYSTEM_INFO: 'SRFC',
    STFC_CONNECTION: 'SRFC',
    RFC_READ_TABLE: 'SDTX',
    BAPI_USER_LOCK: 'SU_USER',
    BAPI_TRANSACTION_COMMIT: 'BAPI'
};

/**
 * Scripts the two lookups every call makes first: RFC_GET_FUNCTION_INTERFACE for
 * the signature and RFC_FUNCTION_SEARCH for the ADT enrichment.
 */
function withInterfaces(node: FakeJsonRpcNode): FakeJsonRpcNode {
    return node
        .on('RFC_GET_FUNCTION_INTERFACE', payload => {
            const name = String(payload.params?.FUNCNAME ?? '').toUpperCase();
            const iface = INTERFACES[name];
            return iface
                ? { result: iface }
                : { error: { code: -32601, message: `Method '${name}' not found` } };
        })
        .on('RFC_FUNCTION_SEARCH', payload => {
            const name = String(payload.params?.FUNCNAME ?? '').toUpperCase();
            const group = FUNCTION_GROUPS[name];
            return {
                result: {
                    FUNCNAME: name,
                    FUNCTIONS: group ? [{ FUNCNAME: name, GROUPNAME: group, STEXT: `${name} short text` }] : []
                }
            };
        });
}

/** An ADT object structure shaped the way ADTClient.mainInclude() expects it. */
function adtStructure(uri: string, description: string) {
    return {
        objectUrl: uri,
        metaData: {
            'adtcore:type': 'FUGR/FF',
            'adtcore:description': description,
            'abapsource:sourceUri': 'source/main'
        },
        links: []
    };
}

/** A ready-to-call handler over a fake node that already has an SSO session. */
function handlerOver(node: FakeJsonRpcNode, stubs?: AdtStubs) {
    node.loggedin = true;
    return new JsonRemoteFunctionCallHandlers(fakeClient(node, stubs), node.bootstrap);
}

// Every handler logs to stderr via lib/logger; keep the test output readable.
let consoleError: jest.SpyInstance;
beforeAll(() => { consoleError = jest.spyOn(console, 'error').mockImplementation(() => { }); });
afterAll(() => { consoleError.mockRestore(); });

describe('signature lookup', () => {
    it('reads the interface from RFC_GET_FUNCTION_INTERFACE and enriches it from ADT', async () => {
        const node = withInterfaces(new FakeJsonRpcNode());
        const uri = '/sap/bc/adt/functions/groups/srfc/fmodules/rfc_system_info';
        const handler = handlerOver(node, {
            objectStructure: async () => adtStructure(uri, 'Provide System Information')
        });

        const metadata = await handler.readAbapFunctionModule('rfc_system_info');

        expect(metadata).toMatchObject({
            name: 'RFC_SYSTEM_INFO',
            metadataSource: 'RFC_INTERFACE',
            functionGroup: 'SRFC',
            objectUrl: uri,
            sourceUrl: `${uri}/source/main`,
            description: 'Provide System Information'
        });
        expect(metadata.parameters).toEqual([{
            name: 'RFCSI_EXPORT',
            kind: 'EXPORTING',
            type: 'RFCSI',
            optional: false,
            defaultValue: undefined,
            description: 'System info'
        }]);
        expect(node.methodsCalled()).toEqual(['RFC_GET_FUNCTION_INTERFACE', 'RFC_FUNCTION_SEARCH']);
    });

    it('maps every PARAMCLASS onto its kind and marks OPTIONAL/DEFAULT parameters optional', async () => {
        const node = withInterfaces(new FakeJsonRpcNode());
        const handler = handlerOver(node);

        const metadata = await handler.readAbapFunctionModule('RFC_READ_TABLE');
        const byName = Object.fromEntries(metadata.parameters.map(p => [p.name, p]));

        expect(byName['QUERY_TABLE']).toMatchObject({ kind: 'IMPORTING', type: 'DD02L-TABNAME', optional: false });
        // A DEFAULT implies optional even without the OPTIONAL flag.
        expect(byName['DELIMITER']).toMatchObject({ kind: 'IMPORTING', optional: true, defaultValue: 'SPACE' });
        expect(byName['ROWCOUNT']).toMatchObject({ kind: 'IMPORTING', optional: true, defaultValue: undefined });
        expect(byName['FIELDS']).toMatchObject({ kind: 'TABLES', type: 'RFC_DB_FLD' });
        // PARAMCLASS 'X' is a classic exception, not a parameter.
        expect(byName['TABLE_NOT_AVAILABLE']).toBeUndefined();
        expect(metadata.exceptions).toEqual(['TABLE_NOT_AVAILABLE']);
    });

    it('caches the interface per function module', async () => {
        const node = withInterfaces(new FakeJsonRpcNode());
        const handler = handlerOver(node);

        await handler.readAbapFunctionModule('STFC_CONNECTION');
        const callsAfterFirst = node.calls.length;
        await handler.readAbapFunctionModule('stfc_connection');

        expect(node.calls.length).toBe(callsAfterFirst);
    });

    it('keeps the interface when the ADT enrichment fails', async () => {
        // Enrichment is best effort — a missing function group must not fail a call.
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('RFC_FUNCTION_SEARCH', { error: { code: -32601, message: 'not authorised' } });
        const handler = handlerOver(node);

        const metadata = await handler.readAbapFunctionModule('STFC_CONNECTION');

        expect(metadata.metadataSource).toBe('RFC_INTERFACE');
        expect(metadata.parameters).toHaveLength(3);
        expect(metadata.functionGroup).toBeUndefined();
    });

    it('falls back to the ADT source when the RFC lookup fails', async () => {
        const uri = '/sap/bc/adt/functions/groups/zfg/fmodules/z_fallback';
        const source = [
            'FUNCTION Z_FALLBACK.',
            '*"----------------------------------------------------------------------',
            '*"*"Local Interface:',
            '*"  IMPORTING',
            '*"     VALUE(IV_IN) TYPE  STRING',
            '*"  EXPORTING',
            '*"     VALUE(EV_OUT) TYPE  STRING',
            '*"----------------------------------------------------------------------',
            'ENDFUNCTION.'
        ].join('\n');

        const node = new FakeJsonRpcNode()
            .on('RFC_GET_FUNCTION_INTERFACE', { error: { code: -32601, message: 'JSON-RPC node inactive' } });
        const handler = handlerOver(node, {
            searchObject: async () => [
                // The same-named DDIC object that shadows the quick search on a real system.
                { 'adtcore:type': 'TABL/DS', 'adtcore:name': 'Z_FALLBACK', 'adtcore:uri': '/sap/bc/adt/ddic/structures/z_fallback' },
                { 'adtcore:type': 'FUGR/FF', 'adtcore:name': 'Z_FALLBACK', 'adtcore:uri': uri, 'adtcore:description': 'Fallback' }
            ],
            objectStructure: async () => adtStructure(uri, 'Fallback'),
            getObjectSource: async () => source
        });

        const metadata = await handler.readAbapFunctionModule('Z_FALLBACK');

        expect(metadata).toMatchObject({
            metadataSource: 'ADT_SOURCE',
            objectUrl: uri,
            functionGroup: 'ZFG',
            sourceUrl: `${uri}/source/main`
        });
        expect(metadata.parameters.map(p => p.name)).toEqual(['IV_IN', 'EV_OUT']);
    });

    it('reports both routes when neither yields an interface', async () => {
        const node = new FakeJsonRpcNode()
            .on('RFC_GET_FUNCTION_INTERFACE', { error: { code: -32601, message: 'JSON-RPC node inactive' } });
        // searchObject returns the shadowing DDIC object only, so the ADT route fails too.
        const handler = handlerOver(node, {
            searchObject: async () => [
                { 'adtcore:type': 'TABL/DS', 'adtcore:name': 'Z_MISSING', 'adtcore:uri': '/sap/bc/adt/ddic/structures/z_missing' }
            ]
        });

        await expect(handler.readAbapFunctionModule('Z_MISSING')).rejects.toThrow(
            /JSON-RPC node inactive[\s\S]*ADT source lookup failed[\s\S]*TABL\/DS/
        );
    });

    it('rejects a name with a dot before any call', async () => {
        // /IWBEP/CL_JSRPC_PROCESSOR->get_method would read the dot as a namespace.
        const node = withInterfaces(new FakeJsonRpcNode());
        const handler = handlerOver(node);

        await expect(handler.readAbapFunctionModule('RFC.SYSTEM_INFO'))
            .rejects.toThrow(/namespace separator/);
        expect(node.calls).toHaveLength(0);
    });
});

describe('request construction', () => {
    it('sends POST application/json with the SAP client and language query parameters', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('RFC_SYSTEM_INFO', { result: { RFCSI_EXPORT: { RFCHOST: 'dev' } } });
        const handler = handlerOver(node);

        await handler.callFunctionViaJsonRpc('RFC_SYSTEM_INFO');

        const { path, config, payload } = node.lastCall;
        expect(path).toBe('/sap/gw/jsonrpc');
        expect(config.method).toBe('POST');
        // /IWBEP/IF_JSRPC_TRANSPORT~VALIDATE checks the first 16 characters.
        expect(String(config.headers?.['Content-Type']).slice(0, 16)).toBe('application/json');
        expect(config.qs).toEqual({ 'sap-client': '100', 'sap-language': 'EN' });
        expect(payload).toMatchObject({ jsonrpc: '2.0', method: 'RFC_SYSTEM_INFO' });
        expect(typeof payload.id).toBe('number');
    });

    it('never sets Cookie or x-csrf-token by hand', async () => {
        // AdtHTTP attaches both from the injected SSO session; setting them here
        // would override the live session with a stale copy.
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('RFC_SYSTEM_INFO', { result: { RFCSI_EXPORT: {} } });
        const handler = handlerOver(node);

        await handler.callFunctionViaJsonRpc('RFC_SYSTEM_INFO');

        for (const { config } of node.calls) {
            const headers = Object.keys(config.headers ?? {}).map(h => h.toLowerCase());
            expect(headers).not.toContain('cookie');
            expect(headers).not.toContain('x-csrf-token');
        }
    });

    it('upper-cases caller keys so CALL TRANSFORMATION id can match them', async () => {
        // A lower-case key is dropped silently by the server, so the function
        // module would run with an empty parameter. See handover §3.
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', payload => ({
                result: { ECHOTEXT: payload.params.REQUTEXT, RESPTEXT: 'SAP R/3', REQUTEXT: payload.params.REQUTEXT }
            }));
        const handler = handlerOver(node);

        const result = await handler.callFunctionViaJsonRpc('STFC_CONNECTION', { requtext: 'hello' });

        expect(node.lastCall.payload.params).toEqual({ REQUTEXT: 'hello' });
        expect(result.output.ECHOTEXT).toBe('hello');
    });

    it('omits params entirely when the function module takes no input', async () => {
        // /IWBEP/CL_JSRPC_PARSER accepts an object or null, never an array.
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('RFC_SYSTEM_INFO', { result: { RFCSI_EXPORT: {} } });
        const handler = handlerOver(node);

        await handler.callFunctionViaJsonRpc('RFC_SYSTEM_INFO');

        expect(node.lastCall.payload).not.toHaveProperty('params');
    });

    it('sends TABLES parameters as arrays of row objects', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('RFC_READ_TABLE', { result: { DATA: [{ WA: 'DEV' }], FIELDS: [{ FIELDNAME: 'SYSID' }], OPTIONS: [] } });
        const handler = handlerOver(node);

        const result = await handler.callFunctionViaJsonRpc(
            'RFC_READ_TABLE',
            { QUERY_TABLE: 'T000', FIELDS: [{ FIELDNAME: 'MANDT' }] },
            ['DATA']
        );

        expect(node.lastCall.payload.params).toEqual({
            QUERY_TABLE: 'T000',
            FIELDS: [{ FIELDNAME: 'MANDT' }]
        });
        expect(result.output).toEqual({ DATA: [{ WA: 'DEV' }] });
    });

    it('rejects an unknown input parameter and lists the accepted ones', async () => {
        const node = withInterfaces(new FakeJsonRpcNode());
        const handler = handlerOver(node);

        await expect(handler.callFunctionViaJsonRpc('STFC_CONNECTION', { NOPE: 'x' }))
            .rejects.toThrow(/'NOPE' is not an input parameter of STFC_CONNECTION[\s\S]*REQUTEXT \(IMPORTING\)/);
        expect(node.methodsCalled()).not.toContain('STFC_CONNECTION');
    });

    it('rejects a missing mandatory IMPORTING parameter', async () => {
        const node = withInterfaces(new FakeJsonRpcNode());
        const handler = handlerOver(node);

        await expect(handler.callFunctionViaJsonRpc('RFC_READ_TABLE', { FIELDS: [] }))
            .rejects.toThrow(/Mandatory IMPORTING parameter\(s\) of RFC_READ_TABLE missing: QUERY_TABLE/);
    });

    it('rejects an unknown output parameter', async () => {
        const node = withInterfaces(new FakeJsonRpcNode());
        const handler = handlerOver(node);

        await expect(handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'x' }, ['NOSUCH']))
            .rejects.toThrow(/'NOSUCH' is not an output parameter of STFC_CONNECTION[\s\S]*ECHOTEXT \(EXPORTING\)/);
    });
});

describe('response handling', () => {
    it('returns the requested outputs and keeps the whole result in raw', async () => {
        // The server echoes the inputs back alongside the outputs, with no wrapper.
        const echoed = { ECHOTEXT: 'hello', RESPTEXT: 'SAP R/3 Rel. 750', REQUTEXT: 'hello' };
        const node = withInterfaces(new FakeJsonRpcNode()).on('STFC_CONNECTION', { result: echoed });
        const handler = handlerOver(node);

        const result = await handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'hello' }, ['ECHOTEXT']);

        expect(result.functionModule).toBe('STFC_CONNECTION');
        expect(result.output).toEqual({ ECHOTEXT: 'hello' });
        expect(result.raw).toEqual(echoed);
    });

    it('defaults to every EXPORTING, CHANGING and TABLES parameter', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', { result: { ECHOTEXT: 'a', RESPTEXT: 'b', REQUTEXT: 'a' } });
        const handler = handlerOver(node);

        const result = await handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'a' });

        // REQUTEXT is IMPORTING, so it stays out of `output` even though the server echoes it.
        expect(Object.keys(result.output).sort()).toEqual(['ECHOTEXT', 'RESPTEXT']);
    });

    it('skips an output parameter the server did not return instead of failing', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', { result: { ECHOTEXT: 'a' } });
        const handler = handlerOver(node);

        const result = await handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'a' });

        expect(result.output).toEqual({ ECHOTEXT: 'a' });
    });

    it('picks the matching response out of a batch array', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', payload => ({
                body: JSON.stringify([
                    { jsonrpc: '2.0', id: payload.id + 99, result: { ECHOTEXT: 'wrong' } },
                    { jsonrpc: '2.0', id: payload.id, result: { ECHOTEXT: 'right', RESPTEXT: 'ok' } }
                ])
            }));
        const handler = handlerOver(node);

        const result = await handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'a' });

        expect(result.output.ECHOTEXT).toBe('right');
    });

    it('reports a non-JSON body with the SICF hint', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', { body: '<html><body>404 Not Found</body></html>', status: 404 });
        const handler = handlerOver(node);

        await expect(handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'a' }))
            .rejects.toThrow(/non-JSON body \(HTTP 404\)[\s\S]*SICF node[\s\S]*SAP_JSONRPC_PATH/);
    });

    it('maps -32601 onto a request error that names S_RFC', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', { error: { code: -32601, message: "Method 'STFC_CONNECTION' not found" } });
        const handler = handlerOver(node);

        await expect(handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'a' }))
            .rejects.toThrow(/JSON-RPC error -32601[\s\S]*not RFC-enabled, or you lack S_RFC/);
    });

    it.each([-32600, -32602])('maps %i onto an invalid-params error', async code => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', { error: { code, message: 'Invalid request' } });
        const handler = handlerOver(node);

        await expect(handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'a' }))
            .rejects.toThrow(new RegExp(`JSON-RPC error ${code}`));
    });

    it('reports a raised ABAP exception as an exception, not a transport failure', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('RFC_READ_TABLE', {
                error: {
                    code: -31000,
                    message: 'Function module raised an exception',
                    data: { EXCEPTION: { NAME: 'TABLE_NOT_AVAILABLE', MESSAGE: 'Table ZNOPE does not exist' } }
                }
            });
        const handler = handlerOver(node);

        await expect(handler.callFunctionViaJsonRpc('RFC_READ_TABLE', { QUERY_TABLE: 'ZNOPE' }))
            .rejects.toThrow(
                "Function module 'RFC_READ_TABLE' raised exception TABLE_NOT_AVAILABLE: Table ZNOPE does not exist."
            );
    });
});

describe('batch calls', () => {
    /** Scripts the BAPI pair used throughout this block. */
    const bapiNode = () => withInterfaces(new FakeJsonRpcNode())
        .on('BAPI_USER_LOCK', { result: { USERNAME: 'DEVUSER', RETURN: [] } })
        .on('BAPI_TRANSACTION_COMMIT', { result: { RETURN: { TYPE: 'S', MESSAGE: 'Commit executed' } } });

    it('sends an update BAPI and its commit in one round trip, in order', async () => {
        // The whole point: both members share one ABAP session and therefore one
        // LUW, so the commit applies the BAPI's changes. Two separate calls would not.
        const node = bapiNode();
        const handler = handlerOver(node);

        const result = await handler.callFunctionsViaJsonRpc([
            { functionModuleName: 'BAPI_USER_LOCK', inputParameters: { USERNAME: 'DEVUSER' } },
            { functionModuleName: 'BAPI_TRANSACTION_COMMIT', inputParameters: { WAIT: 'X' } }
        ]);

        const sent = node.calls.filter(c => c.requests.some(r => r.method.startsWith('BAPI_')));
        expect(sent).toHaveLength(1);
        expect(sent[0].batch).toBe(true);
        expect(sent[0].requests.map(r => r.method)).toEqual(['BAPI_USER_LOCK', 'BAPI_TRANSACTION_COMMIT']);
        expect(sent[0].requests.map(r => r.params)).toEqual([{ USERNAME: 'DEVUSER' }, { WAIT: 'X' }]);

        expect(result.ok).toBe(true);
        expect(result.calls.map(c => c.functionModule)).toEqual(['BAPI_USER_LOCK', 'BAPI_TRANSACTION_COMMIT']);
        expect(result.calls[1].output).toEqual({ RETURN: { TYPE: 'S', MESSAGE: 'Commit executed' } });
    });

    it('sends a batch as an array and a single call as a bare object', async () => {
        // /IWBEP/CL_JSRPC_PROCESSOR->process distinguishes on exactly this.
        const node = bapiNode();
        const handler = handlerOver(node);

        await handler.callFunctionsViaJsonRpc([{ functionModuleName: 'BAPI_TRANSACTION_COMMIT' }]);
        const single = node.lastCall;
        expect(Array.isArray(single.payload)).toBe(false);
        expect(single.payload).toMatchObject({ jsonrpc: '2.0', method: 'BAPI_TRANSACTION_COMMIT' });

        await handler.callFunctionsViaJsonRpc([
            { functionModuleName: 'BAPI_USER_LOCK', inputParameters: { USERNAME: 'X' } },
            { functionModuleName: 'BAPI_TRANSACTION_COMMIT' }
        ]);
        expect(Array.isArray(node.lastCall.payload)).toBe(true);
        expect(node.lastCall.payload).toHaveLength(2);
    });

    it('gives every member of a batch its own id', async () => {
        const node = bapiNode();
        const handler = handlerOver(node);

        await handler.callFunctionsViaJsonRpc([
            { functionModuleName: 'BAPI_USER_LOCK', inputParameters: { USERNAME: 'A' } },
            { functionModuleName: 'BAPI_USER_LOCK', inputParameters: { USERNAME: 'B' } },
            { functionModuleName: 'BAPI_TRANSACTION_COMMIT' }
        ]);

        const ids = node.lastCall.requests.map(r => r.id);
        expect(new Set(ids).size).toBe(3);
    });

    it('matches replies by id when the server answers out of order', async () => {
        const results: Record<string, any> = {
            BAPI_USER_LOCK: { USERNAME: 'DEVUSER', RETURN: [] },
            BAPI_TRANSACTION_COMMIT: { RETURN: { TYPE: 'S' } }
        };
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('BAPI_USER_LOCK', (_request, requests) => ({
                body: JSON.stringify(
                    requests
                        .map(r => ({ jsonrpc: '2.0', id: r.id, result: results[r.method] }))
                        .reverse()
                )
            }))
            .on('BAPI_TRANSACTION_COMMIT', { result: results.BAPI_TRANSACTION_COMMIT });
        const handler = handlerOver(node);

        const result = await handler.callFunctionsViaJsonRpc([
            { functionModuleName: 'BAPI_USER_LOCK', inputParameters: { USERNAME: 'DEVUSER' } },
            { functionModuleName: 'BAPI_TRANSACTION_COMMIT' }
        ]);

        // Reported in the order asked for, not the order answered.
        expect(result.calls.map(c => c.functionModule)).toEqual(['BAPI_USER_LOCK', 'BAPI_TRANSACTION_COMMIT']);
        expect(result.calls[0].raw).toEqual(results.BAPI_USER_LOCK);
        expect(result.calls[1].raw).toEqual(results.BAPI_TRANSACTION_COMMIT);
    });

    it('keeps a failing member local instead of aborting the batch', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('BAPI_USER_LOCK', {
                error: {
                    code: -31000,
                    message: 'Function module raised an exception',
                    data: { EXCEPTION: { NAME: 'USER_NOT_FOUND', MESSAGE: 'User NOBODY does not exist' } }
                }
            })
            .on('BAPI_TRANSACTION_COMMIT', { result: { RETURN: { TYPE: 'S' } } });
        const handler = handlerOver(node);

        const result = await handler.callFunctionsViaJsonRpc([
            { functionModuleName: 'BAPI_USER_LOCK', inputParameters: { USERNAME: 'NOBODY' } },
            { functionModuleName: 'BAPI_TRANSACTION_COMMIT' }
        ]);

        expect(result.ok).toBe(false);
        expect(result.calls[0]).toMatchObject({
            functionModule: 'BAPI_USER_LOCK',
            ok: false,
            error: {
                code: -31000,
                message: "Function module 'BAPI_USER_LOCK' raised exception USER_NOT_FOUND: User NOBODY does not exist."
            }
        });
        // The second member still ran and is reported normally.
        expect(result.calls[1]).toMatchObject({ ok: true, output: { RETURN: { TYPE: 'S' } } });
    });

    it('validates every member before sending anything', async () => {
        // A batch shares one LUW, so a bad last member must not leave the first applied.
        const node = bapiNode();
        const handler = handlerOver(node);

        await expect(handler.callFunctionsViaJsonRpc([
            { functionModuleName: 'BAPI_USER_LOCK', inputParameters: { USERNAME: 'DEVUSER' } },
            { functionModuleName: 'BAPI_TRANSACTION_COMMIT', inputParameters: { NOPE: 'X' } }
        ])).rejects.toThrow(/'NOPE' is not an input parameter of BAPI_TRANSACTION_COMMIT/);

        expect(node.methodsCalled()).not.toContain('BAPI_USER_LOCK');
        expect(node.methodsCalled()).not.toContain('BAPI_TRANSACTION_COMMIT');
    });

    it('reads a repeated signature only once', async () => {
        const node = bapiNode();
        const handler = handlerOver(node);

        await handler.callFunctionsViaJsonRpc([
            { functionModuleName: 'BAPI_USER_LOCK', inputParameters: { USERNAME: 'A' } },
            { functionModuleName: 'BAPI_USER_LOCK', inputParameters: { USERNAME: 'B' } }
        ]);

        expect(node.methodsCalled().filter(m => m === 'RFC_GET_FUNCTION_INTERFACE')).toHaveLength(1);
    });

    it('rejects an empty or missing batch', async () => {
        const handler = handlerOver(bapiNode());

        await expect(handler.callFunctionsViaJsonRpc([]))
            .rejects.toThrow(/At least one function module call is required/);
        await expect(handler.callFunctionsViaJsonRpc(undefined as any))
            .rejects.toThrow(/At least one function module call is required/);
    });

    it('behaves like callFunctionViaJsonRpc for a single entry', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', { result: { ECHOTEXT: 'hi', RESPTEXT: 'ok', REQUTEXT: 'hi' } });
        const handler = handlerOver(node);

        const single = await handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'hi' });
        const batched = await handler.callFunctionsViaJsonRpc([
            { functionModuleName: 'STFC_CONNECTION', inputParameters: { REQUTEXT: 'hi' } }
        ]);

        expect(batched.calls[0].output).toEqual(single.output);
        expect(batched.calls[0].raw).toEqual(single.raw);
    });

    it('is reachable through handle()', async () => {
        const node = bapiNode();
        const handler = handlerOver(node);

        const envelope = await handler.handle('callFunctionsViaJsonRpc', {
            calls: [
                { functionModuleName: 'BAPI_USER_LOCK', inputParameters: { USERNAME: 'DEVUSER' } },
                { functionModuleName: 'BAPI_TRANSACTION_COMMIT' }
            ]
        });

        const payload = JSON.parse(envelope.content[0].text);
        expect(payload).toMatchObject({ status: 'success', ok: true });
        expect(payload.calls).toHaveLength(2);
    });
});

describe('session handling', () => {
    it('bootstraps the SSO session before the first call', async () => {
        const node = new FakeJsonRpcNode()
            .on('JSONRPC.INIT', { result: { ENDPOINT: '/sap/gw/jsonrpc', SESSION: { STATEFUL: '' } } });
        // Not logged in: AdtHTTP would otherwise Basic-Auth with the placeholder password.
        const handler = new JsonRemoteFunctionCallHandlers(fakeClient(node), node.bootstrap);

        const status = await handler.checkJsonRpcEndpoint();

        expect(node.bootstraps).toBe(1);
        expect(status.reachable).toBe(true);
    });

    it('re-bootstraps once and retries after the session expired', async () => {
        // The library's own re-login-on-401 is skipped for stateful clients, so
        // the handler has to do this itself.
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION',
                { fail: adtException('Forbidden', 403) },
                { result: { ECHOTEXT: 'after retry', RESPTEXT: 'ok' } });
        const handler = handlerOver(node);

        const result = await handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'a' });

        expect(node.bootstraps).toBe(1);
        expect(result.output.ECHOTEXT).toBe('after retry');
    });

    it('gives up after one retry', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', { fail: adtException('Forbidden', 403) });
        const handler = handlerOver(node);

        await expect(handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'a' }))
            .rejects.toThrow(/Forbidden/);
        expect(node.bootstraps).toBe(1);
    });

    it('does not retry an error that is not a session problem', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', { fail: adtException('Internal Server Error', 500) });
        const handler = handlerOver(node);

        await expect(handler.callFunctionViaJsonRpc('STFC_CONNECTION', { REQUTEXT: 'a' })).rejects.toThrow();
        expect(node.bootstraps).toBe(0);
    });

    it('says so when there is no session and no bootstrap callback', async () => {
        const node = new FakeJsonRpcNode(); // loggedin stays false
        const handler = new JsonRemoteFunctionCallHandlers(fakeClient(node));

        const status = await handler.checkJsonRpcEndpoint();

        expect(status.reachable).toBe(false);
        expect(status.problem).toMatch(/No SSO session established and no SSO bootstrap available/);
        expect(node.calls).toHaveLength(0);
    });
});

describe('checkJsonRpcEndpoint', () => {
    it('reports the endpoint from the CSRF-exempt JSONRPC.INIT probe', async () => {
        const node = new FakeJsonRpcNode()
            .on('JSONRPC.INIT', { result: { ENDPOINT: '/sap/gw/jsonrpc', SESSION: { STATEFUL: 'X' } } });
        const handler = handlerOver(node);

        const status = await handler.checkJsonRpcEndpoint();

        expect(status).toEqual({
            path: '/sap/gw/jsonrpc',
            reachable: true,
            endpoint: '/sap/gw/jsonrpc',
            session: { STATEFUL: 'X' }
        });
        // INIT is the one method the server exempts from the CSRF guard, and it
        // takes no parameters.
        expect(node.lastCall.payload).not.toHaveProperty('params');
    });

    it('reports a problem instead of throwing when the node is inactive', async () => {
        const node = new FakeJsonRpcNode()
            .on('JSONRPC.INIT', { body: '<html>Not Found</html>', status: 404 });
        const handler = handlerOver(node);

        const status = await handler.checkJsonRpcEndpoint();

        expect(status.reachable).toBe(false);
        expect(status.problem).toMatch(/non-JSON body \(HTTP 404\)/);
    });
});

describe('MCP envelope', () => {
    it('returns one already-MCP-shaped envelope, not a nested JSON string', async () => {
        // index.ts serializeResult() passes a result through when it is already
        // MCP-shaped; that check is `Array.isArray(result.content)`.
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('STFC_CONNECTION', { result: { ECHOTEXT: 'hi', RESPTEXT: 'ok', REQUTEXT: 'hi' } });
        const handler = handlerOver(node);

        const envelope = await handler.handle('callFunctionViaJsonRpc', {
            functionModuleName: 'STFC_CONNECTION',
            inputParameters: { REQUTEXT: 'hi' }
        });

        expect(Array.isArray(envelope.content)).toBe(true);
        expect(envelope.content).toHaveLength(1);
        expect(envelope.content[0].type).toBe('text');

        const payload = JSON.parse(envelope.content[0].text);
        expect(payload).toMatchObject({
            status: 'success',
            functionModule: 'STFC_CONNECTION',
            output: { ECHOTEXT: 'hi', RESPTEXT: 'ok' }
        });
    });

    it('routes readAbapFunctionModule and checkJsonRpcEndpoint through handle()', async () => {
        const node = withInterfaces(new FakeJsonRpcNode())
            .on('JSONRPC.INIT', { result: { ENDPOINT: '/sap/gw/jsonrpc' } });
        const handler = handlerOver(node);

        const metadata = await handler.handle('readAbapFunctionModule', { functionModuleName: 'STFC_CONNECTION' });
        expect(JSON.parse(metadata.content[0].text).functionModule).toMatchObject({ name: 'STFC_CONNECTION' });

        const probe = await handler.handle('checkJsonRpcEndpoint', {});
        expect(JSON.parse(probe.content[0].text).endpoint).toMatchObject({ reachable: true });
    });

    it('rejects an unknown tool name', async () => {
        const handler = handlerOver(new FakeJsonRpcNode());
        // The wording is BaseHandler's now rather than this handler's, since
        // dispatch moved there. What has to survive is the code and the fact that
        // the message names what was asked for.
        await expect(handler.handle('nosuchtool', {})).rejects.toMatchObject({
            code: ErrorCode.MethodNotFound
        });
        await expect(handler.handle('nosuchtool', {})).rejects.toThrow(/nosuchtool/);
    });
});
