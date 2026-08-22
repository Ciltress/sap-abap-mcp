import { vi, type MockInstance } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { adtException } from 'abap-adt-api';
import type { ADTClient } from 'abap-adt-api';
import { AbapAdtServer } from '../server';
import { fixedSessionSource } from '../session';
import type { EstablishedSession, SessionSource } from '../session';
import type { HttpProbe, ProbeTransport } from '../reachability';

/**
 * The server itself: routing, the collection gate, the response budget, and the
 * session recovery that keeps a long-idle process working.
 *
 * None of this could be tested before. The class lived in index.ts, which built
 * and connected a server the moment it was imported, so a test that imported it
 * tried to log on to a real SAP system. Splitting the entry point off and letting
 * the constructor take its dependencies is what made this file possible — and
 * these are the paths that decide whether a cold session succeeds first try.
 */

const SESSION: EstablishedSession = {
    cookies: new Map([['SAP_SESSIONID_DEV_100', 'SAP_SESSIONID_DEV_100=abc']]),
    csrfToken: 'token'
};

const BASE_ENV: NodeJS.ProcessEnv = {
    SAP_URL: 'https://sap.example.com:44301',
    SAP_USER: 'TESTUSER',
    SAP_CLIENT: '100',
    SAP_LANGUAGE: 'EN',
    ABAP_MCP_GATE: 'off'
};

/** Discovery documents shaped like the real one. */
const discoveryWith = (...hrefs: string[]) => [
    { title: 'Category', collection: hrefs.map(href => ({ href, title: href, templateLinks: [] })) }
];
const FULL_DISCOVERY = discoveryWith(
    '/sap/bc/adt/oo/classes',
    '/sap/bc/adt/abapgit/repos',
    '/sap/bc/adt/businessservices/odatav'
);

interface FakeOptions {
    /** What adtDiscovery does. */
    discovery?: () => Promise<any>;
    /** Fails the next N calls to any tool method with this error, then succeeds. */
    failWith?: { error: any; times: number };
    /** What a tool call returns. */
    result?: any;
    /** The reachability probe. Absent by default, so no test reaches the network. */
    probe?: ProbeTransport;
}

/**
 * A stand-in ADTClient. `loggedin` starts false so the first tool call has to
 * establish a session, which is the behaviour under test.
 */
function makeAdtClient(options: FakeOptions = {}) {
    const calls: string[] = [];
    let discoveryCount = 0;
    let remaining = options.failWith?.times ?? 0;

    const state = { loggedin: false, csrfToken: 'fetch', cookie: new Map<string, string>() };

    const client = new Proxy({} as any, {
        get(_target, property: string) {
            switch (property) {
                case 'httpClient': return state;
                case 'loggedin': return state.loggedin;
                case 'isStateful': return true;
                case 'baseUrl': return BASE_ENV.SAP_URL;
                case 'client': return '100';
                case 'username': return 'TESTUSER';
                case 'stateful': return 'stateful';
                case 'then': case 'catch': case 'finally': return undefined;
                case 'adtDiscovery':
                    return async () => {
                        discoveryCount++;
                        return options.discovery ? options.discovery() : FULL_DISCOVERY;
                    };
            }
            return async (...args: any[]) => {
                calls.push(property);
                if (remaining > 0) {
                    remaining--;
                    throw options.failWith!.error;
                }
                return options.result ?? {};
            };
        },
        set(_target, property: string, value: any) {
            (state as any)[property] = value;
            return true;
        }
    }) as ADTClient;

    return { client, calls, state, discoveryCount: () => discoveryCount };
}

interface Harness {
    client: Client;
    server: AbapAdtServer;
    established: () => number;
    calls: string[];
    discoveryCount: () => number;
}

async function connect(
    env: NodeJS.ProcessEnv = {},
    fake: FakeOptions = {}
): Promise<Harness> {
    let established = 0;
    const adt = makeAdtClient(fake);

    const server = new AbapAdtServer({
        env: { ...BASE_ENV, ...env },
        adtClient: adt.client,
        sessionSource: fixedSessionSource(SESSION, {
            onEstablish: () => {
                established++;
                adt.state.loggedin = true;
            },
            probe: fake.probe
        })
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    return {
        client,
        server,
        established: () => established,
        calls: adt.calls,
        discoveryCount: adt.discoveryCount
    };
}

let consoleError: MockInstance;
beforeAll(() => { consoleError = vi.spyOn(console, 'error').mockImplementation(() => { }); });
afterAll(() => { consoleError.mockRestore(); });

describe('a credential SAP has rejected', () => {
    /**
     * The retry treats 401 as "the session went stale", which is right for a
     * Kerberos ticket and ruinous for a password: SAP counts every rejected
     * Basic logon against login/fails_to_user_lock, so a server that re-tried on
     * each tool call would walk a shared technical user into a lock.
     *
     * The contract is that a failure marked `permanent` is latched and re-thrown
     * without touching SAP again.
     */
    function connectWithFailingLogon(permanent: boolean) {
        let attempts = 0;
        const failure = Object.assign(new Error('SAP rejected the password'), { permanent });
        // `loggedin` starts false, so every tool call reaches the logon before it
        // reaches the handler — which is the path the latch guards.
        const adt = makeAdtClient({});

        const server = new AbapAdtServer({
            env: BASE_ENV,
            adtClient: adt.client,
            sessionSource: {
                mode: 'password',
                establish: async () => { attempts++; throw failure; }
            }
        });

        return { server, adt, attempts: () => attempts };
    }

    async function clientFor(server: AbapAdtServer) {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'test', version: '1.0.0' });
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        return client;
    }

    it('is tried once and never again, however many tools are called', async () => {
        const { server, attempts } = connectWithFailingLogon(true);
        const client = await clientFor(server);

        for (let i = 0; i < 5; i++) {
            await client.callTool({ name: 'searchPackages', arguments: { patterns: ['Z*'] } });
        }

        // Five tool calls, one logon attempt. Without the latch this is five
        // failed logons and a locked user.
        expect(attempts()).toBe(1);
    });

    it('still reports the reason on every call, rather than going quiet', async () => {
        const { server } = connectWithFailingLogon(true);
        const client = await clientFor(server);

        const result: any = await client.callTool({
            name: 'searchPackages', arguments: { patterns: ['Z*'] }
        });
        expect(JSON.parse(result.content[0].text).error).toMatch(/rejected the password/);
    });

    it('keeps retrying a failure that is not permanent, which is the Kerberos case', async () => {
        // An expired ticket costs nothing to retry, and re-establishing is the
        // whole point of the self-healing path.
        const { server, attempts } = connectWithFailingLogon(false);
        const client = await clientFor(server);

        for (let i = 0; i < 3; i++) {
            await client.callTool({ name: 'searchPackages', arguments: { patterns: ['Z*'] } });
        }

        expect(attempts()).toBe(3);
    });
});

describe('tools/list', () => {
    it('lists the profile, plus healthcheck, which sits outside every profile', async () => {
        const { client } = await connect({ ABAP_MCP_PROFILE: 'core' });
        const { tools } = await client.listTools();
        const names = tools.map(t => t.name);

        // core is 8 tools now that the write cycle is one; healthcheck is how a client
        // finds out which profile is active, so it has to be present in all of them.
        expect(names).toContain('healthcheck');
        expect(names).toContain('readAbapObject');
        expect(names).not.toContain('debuggerListen');
        expect(tools.length).toBe(9);
    });

    it('lists everything on the default profile', async () => {
        const { client } = await connect();
        const { tools } = await client.listTools();
        expect(tools.length).toBe(129);
    });
});

describe('the collection gate', () => {
    it('withholds the tools a system cannot serve', async () => {
        const { client } = await connect(
            { ABAP_MCP_GATE: 'on' },
            { discovery: async () => discoveryWith('/sap/bc/adt/oo/classes') }
        );
        const names = (await client.listTools()).tools.map(t => t.name);

        expect(names).not.toContain('gitRepos');
        expect(names).not.toContain('publishServiceBinding');
        expect(names).toContain('readAbapObject');
    });

    it('lists everything when the system does expose the collections', async () => {
        const { client } = await connect({ ABAP_MCP_GATE: 'on' });
        expect((await client.listTools()).tools.map(t => t.name)).toContain('gitRepos');
    });

    it.each([
        ['discovery throws', async () => { throw new Error('no ticket'); }],
        ['discovery is empty', async () => []],
        ['discovery is nonsense', async () => 'not a document']
    ])('leaves the list COMPLETE when %s', async (_label, discovery) => {
        // The important one. Hiding a tool that would have worked is invisible;
        // offering one that errors is not. Every failure path fails open.
        const { client } = await connect({ ABAP_MCP_GATE: 'on' }, { discovery });
        const names = (await client.listTools()).tools.map(t => t.name);

        expect(names).toContain('gitRepos');
        expect(names.length).toBe(129);
    });

    it('reads the discovery document at most once per process', async () => {
        const { client, discoveryCount } = await connect({ ABAP_MCP_GATE: 'on' });

        await client.listTools();
        await client.listTools();
        await client.callTool({ name: 'healthcheck', arguments: {} });

        expect(discoveryCount()).toBe(1);
    });

    it('does not read discovery at all when gating is switched off', async () => {
        const { client, discoveryCount } = await connect({ ABAP_MCP_GATE: 'off' });
        await client.listTools();
        expect(discoveryCount()).toBe(0);
    });

    it('explains a withheld tool instead of letting it answer 400', async () => {
        const { client } = await connect(
            { ABAP_MCP_GATE: 'on' },
            { discovery: async () => discoveryWith('/sap/bc/adt/oo/classes') }
        );
        const result: any = await client.callTool({ name: 'gitRepos', arguments: {} });
        const payload = JSON.parse(result.content[0].text);

        expect(payload.error).toMatch(/does not expose/);
        // The message has to stop a retry, not merely report a failure.
        expect(payload.error).toMatch(/calling it again will not help/);
    });
});

describe('routing', () => {
    it('tells a model a tool exists but is out of profile, rather than denying it', async () => {
        // Without this a model that knows the tool exists is told it does not,
        // and retries.
        const { client } = await connect({ ABAP_MCP_PROFILE: 'analyst' });
        const result: any = await client.callTool({ name: 'setObjectSource', arguments: {} });
        const payload = JSON.parse(result.content[0].text);

        expect(payload.error).toMatch(/exists but is not in the active profile 'analyst'/);
        expect(payload.error).toMatch(/ABAP_MCP_PROFILE=all/);
    });

    it('says plainly when there is no such tool', async () => {
        const { client } = await connect();
        const result: any = await client.callTool({ name: 'noSuchToolAnywhere', arguments: {} });
        expect(JSON.parse(result.content[0].text).error).toMatch(/Unknown tool: noSuchToolAnywhere/);
    });

    it('makes analyst a boundary rather than a suggestion', async () => {
        // Filtering only tools/list would leave every tool callable by a client
        // that guessed a name.
        const { client, calls } = await connect({ ABAP_MCP_PROFILE: 'analyst' });
        await client.callTool({ name: 'setObjectSource', arguments: { objectSourceUrl: '/x', source: 'x', lockHandle: 'h' } });
        expect(calls).not.toContain('setObjectSource');
    });
});

describe('session handling', () => {
    it('establishes a session before the first tool call', async () => {
        const { client, established } = await connect();
        expect(established()).toBe(0);

        await client.callTool({ name: 'objectTypes', arguments: {} });
        expect(established()).toBe(1);
    });

    it('does not re-establish a session that is still good', async () => {
        const { client, established } = await connect();
        await client.callTool({ name: 'objectTypes', arguments: {} });
        await client.callTool({ name: 'objectTypes', arguments: {} });
        expect(established()).toBe(1);
    });

    it.each([
        ['a CSRF rejection', adtException('CSRF token validation failed')],
        ['a plain CSRF message', new Error('CSRF token validation failed')],
        ['a bare 401', new Error('Request failed with status code 401 Unauthorized')]
    ])('re-establishes the session and retries once after %s', async (_label, error) => {
        // `loggedin` is only `csrfToken !== "fetch"`, so it stays true forever once
        // a token has been injected — even after SAP has dropped the session on its
        // own 30 minute timeout. Without the retry every POST fails until restart.
        const { client, established, calls } = await connect({}, { failWith: { error, times: 1 } });

        const result: any = await client.callTool({ name: 'objectTypes', arguments: {} });

        expect(established()).toBe(2);
        expect(calls.filter(c => c === 'objectTypes').length).toBe(2);
        expect(result.isError).toBeFalsy();
    });

    it('does NOT retry an error that might have been applied', async () => {
        // Retrying is safe only for errors that mean SAP refused the request before
        // running it. Anything else could be applied twice.
        const { client, established, calls } = await connect(
            {},
            { failWith: { error: new Error('object is locked by another user'), times: 1 } }
        );

        const result: any = await client.callTool({ name: 'objectTypes', arguments: {} });

        expect(established()).toBe(1);
        expect(calls.filter(c => c === 'objectTypes').length).toBe(1);
        expect(result.isError).toBe(true);
    });

    it('gives up rather than looping when the retry fails too', async () => {
        const { client, calls } = await connect(
            {},
            { failWith: { error: new Error('CSRF token validation failed'), times: 5 } }
        );

        const result: any = await client.callTool({ name: 'objectTypes', arguments: {} });

        expect(calls.filter(c => c === 'objectTypes').length).toBe(2);
        expect(result.isError).toBe(true);
    });
});

describe('healthcheck', () => {
    it('answers without establishing a session, so it can report on a broken one', async () => {
        const { client, established } = await connect();
        const result: any = await client.callTool({ name: 'healthcheck', arguments: {} });

        expect(established()).toBe(0);
        expect(JSON.parse(result.content[0].text).status).toBe('healthy');
    });

    it('reports the active profile and the budget that follows it', async () => {
        const { client } = await connect({ ABAP_MCP_PROFILE: 'core' });
        const result: any = await client.callTool({ name: 'healthcheck', arguments: {} });
        const payload = JSON.parse(result.content[0].text);

        expect(payload.tools.profile).toBe('core');
        expect(payload.tools.responseBudgetBytes).toBe(24_000);
        // The gap between listed and available is what the profile is holding back.
        expect(payload.tools.listed).toBe(9);
        expect(payload.tools.available).toBe(129);
    });

    it('names the system it is bound to, so a client can tell several apart', async () => {
        const { client } = await connect({ SAP_SYSTEM_ID: 'DEV' });
        const result: any = await client.callTool({ name: 'healthcheck', arguments: {} });
        expect(JSON.parse(result.content[0].text).system.id).toBe('DEV');
    });

    it('lists what this system cannot serve once the gate has run', async () => {
        const { client } = await connect(
            { ABAP_MCP_GATE: 'on' },
            { discovery: async () => discoveryWith('/sap/bc/adt/oo/classes') }
        );
        await client.listTools();

        const result: any = await client.callTool({ name: 'healthcheck', arguments: {} });
        const payload = JSON.parse(result.content[0].text);

        expect(payload.tools.systemMissing).toEqual(expect.arrayContaining(['abapgit']));
        expect(payload.tools.withheldForSystem).toContain('gitRepos');
    });
});

/**
 * The probe inside healthcheck. What it must never do is throw, or claim a
 * verdict it did not earn — this tool is called precisely when everything else
 * has stopped working.
 */
describe('healthcheck reachability', () => {
    const answered = (status: number, headers: Record<string, string> = {}): HttpProbe =>
        ({ status, headers, cookies: [] });

    /** Answers per ICF path, so a test can serve one node and refuse the other. */
    const probeFor = (byPath: Record<string, HttpProbe>): ProbeTransport =>
        async url => byPath[new URL(url).pathname] ?? answered(0);

    it('says it did not check, rather than implying health, when there is no transport', async () => {
        const { client } = await connect();
        const payload = JSON.parse((await client.callTool({ name: 'healthcheck', arguments: {} }) as any)
            .content[0].text);

        expect(payload.reachability).toEqual({ checked: false });
        expect(payload.status).toBe('healthy');
    });

    it('pings both layers and reports the system as healthy when both answer', async () => {
        const { client, established } = await connect({}, {
            probe: probeFor({
                '/sap/public/ping': answered(200),
                '/sap/bc/ping': answered(200)
            })
        });
        const payload = JSON.parse((await client.callTool({ name: 'healthcheck', arguments: {} }) as any)
            .content[0].text);

        expect(payload.status).toBe('healthy');
        expect(payload.reachability.checked).toBe(true);
        expect(payload.reachability.layer).toBe('ok');
        // Still the one tool that never logs on, which is what lets it answer at all.
        expect(established()).toBe(0);
    });

    it('goes degraded and names the layer when SAP will not serve the ICF node', async () => {
        // The DEV/P01 failure: the host is up, the ADT node is not served, and
        // 'healthy' would have been a lie in exactly the case worth reporting.
        const { client } = await connect({}, {
            probe: probeFor({
                '/sap/public/ping': answered(200),
                '/sap/bc/ping': answered(403)
            })
        });
        const payload = JSON.parse((await client.callTool({ name: 'healthcheck', arguments: {} }) as any)
            .content[0].text);

        expect(payload.status).toBe('degraded');
        expect(payload.reachability.layer).toBe('icf');
        expect(payload.reachability.advice).toMatch(/SICF/);
    });

    it('distinguishes a refused logon from a refused service', async () => {
        const { client } = await connect({}, {
            probe: probeFor({
                '/sap/public/ping': answered(200),
                '/sap/bc/ping': answered(401, {
                    'www-authenticate': 'Basic realm="SAP NetWeaver Application Server [P01/200]"'
                })
            })
        });
        const payload = JSON.parse((await client.callTool({ name: 'healthcheck', arguments: {} }) as any)
            .content[0].text);

        expect(payload.reachability.layer).toBe('logon');
        expect(payload.reachability.observed).toEqual({ systemId: 'P01', client: '200' });
    });

    it('answers even when the probe itself blows up', async () => {
        const { client } = await connect({}, {
            probe: async () => { throw new Error('curl vanished'); }
        });
        const result: any = await client.callTool({ name: 'healthcheck', arguments: {} });
        const payload = JSON.parse(result.content[0].text);

        expect(result.isError).toBeFalsy();
        expect(payload.reachability.checked).toBe(true);
        expect(payload.reachability.summary).toMatch(/curl vanished/);
    });
});

/**
 * The failure healthcheck cannot report on.
 *
 * A bootstrap that fails happens before the transport is connected, so the
 * process exits and the client sees a server that died. This is the only place
 * the reason can be said — and it used to be said wrongly, blaming a Kerberos
 * ticket for an ICF node that was switched off. `run()` throws at its first
 * statement, so none of this reaches stdio.
 */
describe('the startup diagnostic', () => {
    const REFUSED = new Error('SAP refused the request before offering a logon (HTTP 403).');

    const failingSource = (probe?: ProbeTransport): SessionSource => ({
        mode: 'kerberos',
        establish: async () => { throw REFUSED; },
        probe
    });

    const serverWith = (source: SessionSource) => new AbapAdtServer({
        env: BASE_ENV,
        adtClient: makeAdtClient().client,
        sessionSource: source
    });

    it('names the layer that refused, instead of leaving the logon to take the blame', async () => {
        const server = serverWith(failingSource(async url =>
            ({ status: new URL(url).pathname === '/sap/public/ping' ? 200 : 403, headers: {}, cookies: [] })
        ));

        // The host is up and the node is not served: SICF, not klist.
        await expect(server.run()).rejects.toThrow(/SICF/);
    });

    it('keeps the original message, and the original error as its cause', async () => {
        const server = serverWith(failingSource(async () => ({ status: 403, headers: {}, cookies: [] })));

        const error: any = await server.run().catch(e => e);
        expect(error.message).toContain(REFUSED.message);
        expect(error.cause).toBe(REFUSED);
    });

    it('reports both endpoints, so the verdict can be checked rather than trusted', async () => {
        const server = serverWith(failingSource(async url =>
            ({ status: new URL(url).pathname === '/sap/public/ping' ? 200 : 403, headers: {}, cookies: [] })
        ));

        const error: any = await server.run().catch(e => e);
        expect(error.message).toContain('/sap/public/ping -> 200');
        expect(error.message).toContain('/sap/bc/ping -> 403');
    });

    it('says so when SAP is not the system this server was configured for', async () => {
        // A server pointed at the wrong system fails in a way that looks like
        // anything else, and the Basic realm names the system even while refusing
        // — so this is the one moment it can be caught.
        const server = new AbapAdtServer({
            env: { ...BASE_ENV, SAP_SYSTEM_ID: 'DEV', SAP_CLIENT: '100' },
            adtClient: makeAdtClient().client,
            sessionSource: failingSource(async () => ({
                status: 401,
                headers: { 'www-authenticate': 'Basic realm="SAP NetWeaver Application Server [P01/200]"' },
                cookies: []
            }))
        });

        const error: any = await server.run().catch(e => e);
        expect(error.message).toMatch(/identified itself as P01\/200/);
        expect(error.message).toMatch(/pointed at the wrong system/);
    });

    it('stays quiet about the identity when it is the system that was configured', async () => {
        // Otherwise every startup failure carries a sentence confirming the one
        // thing that was not wrong.
        const server = new AbapAdtServer({
            env: { ...BASE_ENV, SAP_SYSTEM_ID: 'P01', SAP_CLIENT: '200' },
            adtClient: makeAdtClient().client,
            sessionSource: failingSource(async () => ({
                status: 401,
                headers: { 'www-authenticate': 'Basic realm="SAP NetWeaver Application Server [P01/200]"' },
                cookies: []
            }))
        });

        const error: any = await server.run().catch(e => e);
        expect(error.message).not.toMatch(/identified itself/);
    });

    it('throws the original error untouched when there is nothing to probe with', async () => {
        // The probe may only ever add. A diagnosis that cannot run must not
        // replace the one thing that was known.
        await expect(serverWith(failingSource()).run()).rejects.toBe(REFUSED);
    });

    it('throws the original error when the probe itself fails', async () => {
        const server = serverWith(failingSource(async () => { throw new Error('no curl'); }));
        const error: any = await server.run().catch(e => e);

        expect(error.message).toContain(REFUSED.message);
        expect(error.message).toMatch(/no curl/);
    });
});

describe('the response budget', () => {
    it('withholds an over-budget answer as valid JSON that says what to do next', async () => {
        // Never a cut-off fragment: that would not parse, and a model handed one
        // retries the same call instead of narrowing it.
        const { client } = await connect(
            { ABAP_MCP_PROFILE: 'core' },
            { result: { rows: 'x'.repeat(40_000) } }
        );

        const result: any = await client.callTool({
            name: 'tableContents',
            arguments: { ddicEntityName: 'T000' }
        });
        const payload = JSON.parse(result.content[0].text);

        expect(payload.status).toBe('truncated');
        expect(payload.bytes).toBeGreaterThan(24_000);
        // The tool's own narrowing advice, not the generic sentence.
        expect(payload.nextStep).toMatch(/rowNumber/);
        expect(typeof payload.preview).toBe('string');
    });

    it('leaves an answer inside the budget alone', async () => {
        const { client } = await connect({ ABAP_MCP_PROFILE: 'core' }, { result: { rows: [] } });
        const result: any = await client.callTool({
            name: 'tableContents',
            arguments: { ddicEntityName: 'T000' }
        });
        expect(JSON.parse(result.content[0].text).status).toBe('success');
    });

    it('applies no ceiling on the all profile', async () => {
        const { client } = await connect({}, { result: { rows: 'x'.repeat(200_000) } });
        const result: any = await client.callTool({
            name: 'tableContents',
            arguments: { ddicEntityName: 'T000' }
        });
        expect(JSON.parse(result.content[0].text).status).toBe('success');
    });

    it('returns one level of JSON, never a string nested in a string', async () => {
        const { client } = await connect({}, { result: { types: [] } });
        const result: any = await client.callTool({ name: 'objectTypes', arguments: {} });

        const payload = JSON.parse(result.content[0].text);
        expect(typeof payload).toBe('object');
        expect(payload).not.toBeNull();
    });
});

describe('resources', () => {
    it('serves the guides and the bundled skills', async () => {
        const { client } = await connect();
        const { resources } = await client.listResources();
        const uris = resources.map(r => r.uri);

        expect(uris).toContain('abap-adt://guides/router');
        expect(uris.some(u => u.startsWith('abap-adt://skills/'))).toBe(true);
        expect(resources.every(r => r.mimeType === 'text/markdown')).toBe(true);
    });

    it('reads a guide by uri', async () => {
        const { client } = await connect();
        const result = await client.readResource({ uri: 'abap-adt://guides/router' });

        expect(result.contents[0].mimeType).toBe('text/markdown');
        expect(String((result.contents[0] as any).text).length).toBeGreaterThan(100);
    });

    it('names the alternatives when a uri is unknown', async () => {
        const { client } = await connect();
        await expect(client.readResource({ uri: 'abap-adt://guides/nope' }))
            .rejects.toThrow(/Unknown resource/);
    });
});
