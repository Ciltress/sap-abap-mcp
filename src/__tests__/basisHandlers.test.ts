import { vi, type MockInstance } from 'vitest';
import type { ADTClient } from 'abap-adt-api';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { BasisHandlers } from '../handlers/BasisHandlers';

/**
 * listLoggedOnUsers, against a stubbed RFC caller.
 *
 * The fixtures reproduce what TH_USER_LIST returned from DEV/100 — including
 * the quirk that the *optional* USRLIST comes back filled while the mandatory
 * LIST comes back empty.
 */

/** One USRINFO row, trimmed to the columns the handler reads. */
const session = (row: Record<string, any>) => ({
    TID: 0, MANDT: '100', BNAME: '', TCODE: '', TERM: '', ZEIT: '000000', MASTER: '',
    TRACE: 0, EXTMODI: 1, INTMODI: 1, TYPE: 32, STAT: 2, PROTOCOL: -1,
    GUIVERSION: '', RFC_TYPE: '', HOSTADDR: '0.0.0.0',
    ...row
});

const SESSIONS = [
    session({ TID: 138, BNAME: 'DEVUSER', TCODE: 'SE37', TERM: 'NB3DE25YDB3L', TYPE: 4, GUIVERSION: '800', HOSTADDR: '10.172.193.42', ZEIT: '072323' }),
    session({ TID: 61, BNAME: 'DEVUSER', TYPE: 202, PROTOCOL: 2, HOSTADDR: '10.126.255.2', ZEIT: '072538' }),
    session({ TID: 35, MANDT: '000', BNAME: 'BGRFCSUPER', TERM: 'sapdev', RFC_TYPE: 'I' }),
    session({ TID: 93, MANDT: '000', BNAME: 'BGRFCSUPER', TERM: 'sapdev', RFC_TYPE: 'E' }),
    session({ TID: 142, MANDT: '501', BNAME: 'SAPJSF_Q07', TERM: 'e2r2s48sap260', RFC_TYPE: 'E' })
];

/**
 * `username` is what ADTClient was constructed with, i.e. SAP_USER. Pass `null`
 * for a server started without one — passing `undefined` would only re-trigger
 * the default.
 */
function makeHandler(reply?: any, fail?: string, wire = true, username: string | null = 'DEVUSER') {
    const calls: any[] = [];
    const client = { username: username ?? undefined } as unknown as ADTClient;
    const caller = async (fm: string, input: Record<string, any>, output: string[]) => {
        calls.push({ fm, input, output });
        if (fail) throw new Error(fail);
        return { output: reply ?? { LIST: [], USRLIST: SESSIONS } };
    };
    return { handler: new BasisHandlers(client, wire ? caller : undefined), calls };
}

async function listUsers(handler: BasisHandlers, args: any = {}) {
    const envelope = await handler.handle('listLoggedOnUsers', args);
    return JSON.parse(envelope.content[0].text);
}

let consoleError: MockInstance;
beforeAll(() => { consoleError = vi.spyOn(console, 'error').mockImplementation(() => { }); });
afterAll(() => { consoleError.mockRestore(); });

describe('listLoggedOnUsers', () => {
    it('calls TH_USER_LIST and summarises by user and client', async () => {
        const { handler, calls } = makeHandler();

        const payload = await listUsers(handler);

        expect(calls[0]).toEqual({ fm: 'TH_USER_LIST', input: {}, output: ['USRLIST', 'LIST'] });
        expect(payload.sessionCount).toBe(5);
        expect(payload.userCount).toBe(3);

        const devuser = payload.byUser.find((u: any) => u.user === 'DEVUSER');
        expect(devuser).toMatchObject({ sessions: 2, clients: ['100'], transactions: ['SE37'] });
        expect(devuser.hosts.sort()).toEqual(['10.126.255.2', '10.172.193.42']);

        // Ordered by session count, ties broken alphabetically so the output is
        // stable: BGRFCSUPER and DEVUSER both have two.
        expect(payload.byUser.map((u: any) => `${u.user}:${u.sessions}`))
            .toEqual(['BGRFCSUPER:2', 'DEVUSER:2', 'SAPJSF_Q07:1']);

        expect(payload.byClient.map((c: any) => c.client)).toEqual(['000', '100', '501']);
        expect(payload.byClient.find((c: any) => c.client === '000').users).toEqual(['BGRFCSUPER']);
    });

    it('reads USRLIST even though LIST is the non-optional parameter', async () => {
        // TH_USER_LIST declares LIST as mandatory and USRLIST as optional, but on
        // 7.50 it fills USRLIST and leaves LIST empty.
        const { handler } = makeHandler({ LIST: [], USRLIST: SESSIONS });

        const payload = await listUsers(handler);

        expect(payload.sourceParameter).toBe('USRLIST');
        expect(payload.sessionCount).toBe(5);
    });

    it('falls back to LIST when that is the one with rows', async () => {
        const { handler } = makeHandler({ LIST: SESSIONS, USRLIST: [] });

        const payload = await listUsers(handler);

        expect(payload.sourceParameter).toBe('LIST');
        expect(payload.sessionCount).toBe(5);
    });

    it('filters by user, case insensitively', async () => {
        const { handler } = makeHandler();

        const payload = await listUsers(handler, { user: 'devuser' });

        expect(payload.sessionCount).toBe(2);
        expect(payload.userCount).toBe(1);
        expect(payload.filter).toEqual({ user: 'DEVUSER', client: undefined, totalBeforeFilter: 5 });
    });

    it('filters by client', async () => {
        const { handler } = makeHandler();

        const payload = await listUsers(handler, { client: '000' });

        expect(payload.sessionCount).toBe(2);
        expect(payload.byUser[0].user).toBe('BGRFCSUPER');
    });

    it('reports the unfiltered total, so an empty result is not read as "nobody is on"', async () => {
        const { handler } = makeHandler();

        const payload = await listUsers(handler, { user: 'NOBODY' });

        expect(payload.sessionCount).toBe(0);
        expect(payload.filter.totalBeforeFilter).toBe(5);
    });

    it('omits the individual sessions unless asked', async () => {
        const { handler } = makeHandler();

        expect(await listUsers(handler)).not.toHaveProperty('sessions');

        const withSessions = await listUsers(handler, { includeSessions: true });
        expect(withSessions.sessions).toHaveLength(5);
        expect(withSessions.sessions[0]).toMatchObject({
            tid: 138, client: '100', user: 'DEVUSER', transaction: 'SE37',
            terminal: 'NB3DE25YDB3L', host: '10.172.193.42', guiVersion: '800'
        });
    });

    it('keeps the logon codes raw, because the dictionary has no fixed values for them', async () => {
        // UEXT_TYPE, USTATE and UPROTOCOL are INT4 data elements with no domain,
        // so any label would be invented.
        const { handler } = makeHandler();

        const payload = await listUsers(handler, { includeSessions: true, user: 'DEVUSER' });

        expect(payload.sessions[0]).toMatchObject({ logonType: 4, logonState: 2, logonProtocol: -1 });
        expect(payload.sessions[1]).toMatchObject({ logonType: 202, logonProtocol: 2 });
    });

    it('caps the sessions and says so', async () => {
        const { handler } = makeHandler();

        const payload = await listUsers(handler, { includeSessions: true, maxSessions: 2 });

        expect(payload.sessions).toHaveLength(2);
        expect(payload.sessionsTruncated).toBe(true);
        // The counts still describe everything, not just the returned page.
        expect(payload.sessionCount).toBe(5);
    });

    it('handles an empty server without pretending it failed', async () => {
        const { handler } = makeHandler({ LIST: [], USRLIST: [] });

        const payload = await listUsers(handler);

        expect(payload.status).toBe('success');
        expect(payload.sessionCount).toBe(0);
        expect(payload.sourceParameter).toBe('none');
        expect(payload.byUser).toEqual([]);
    });

    it('says so when the JSON-RPC route is not wired in', async () => {
        const { handler } = makeHandler(undefined, undefined, false);

        await expect(listUsers(handler)).rejects.toThrow(/needs the JSON-RPC route, which is not wired/);
    });

    it('surfaces a failure from the RFC call', async () => {
        const { handler } = makeHandler(undefined, 'JSON-RPC error -32601');

        await expect(listUsers(handler)).rejects.toThrow(/Failed to list logged-on users: JSON-RPC error -32601/);
    });

    it('resolves currentUserOnly from the configured SAP_USER', async () => {
        // So neither the caller nor the documentation has to hard-code a name.
        const { handler } = makeHandler();

        const payload = await listUsers(handler, { currentUserOnly: true, includeSessions: true });

        expect(payload.currentUser).toBe('DEVUSER');
        expect(payload.filter.user).toBe('DEVUSER');
        expect(payload.sessionCount).toBe(2);
        expect(payload.sessions.every((s: any) => s.user === 'DEVUSER')).toBe(true);
    });

    it('names the current user even when not filtering by it', async () => {
        const { handler } = makeHandler();
        expect((await listUsers(handler)).currentUser).toBe('DEVUSER');
    });

    it('lets an explicit user win over currentUserOnly', async () => {
        const { handler } = makeHandler();

        const payload = await listUsers(handler, { user: 'BGRFCSUPER', currentUserOnly: true });

        expect(payload.filter.user).toBe('BGRFCSUPER');
        expect(payload.currentUser).toBe('DEVUSER');
    });

    it('says so when currentUserOnly is asked for without a configured user', async () => {
        const { handler } = makeHandler(undefined, undefined, true, null);

        await expect(listUsers(handler, { currentUserOnly: true }))
            .rejects.toThrow(/no configured user \(SAP_USER\)/);
    });

    it('rejects an unknown tool name', async () => {
        const { handler } = makeHandler();
        // BaseHandler owns dispatch now, so the wording is its rather than this
        // handler's. The code and the naming of what was asked for are the part
        // that matters to a client.
        await expect(handler.handle('nosuch', {})).rejects.toMatchObject({
            code: ErrorCode.MethodNotFound
        });
        await expect(handler.handle('nosuch', {})).rejects.toThrow(/nosuch/);
    });
});

/**
 * The profile-parameter tools.
 *
 * The fixtures reproduce what DEV answered, including the distinction the whole
 * thing turns on: TH_GET_PARAMETER says rc 4 for a parameter the kernel does not
 * know, and rc 0 with an empty value for one that exists and is empty.
 */
const PROFILE: Record<string, { PARAMETER_VALUE: string; RC: number }> = {
    'icm/server_port_0': { PARAMETER_VALUE: 'PROT=HTTP,PORT=8064,TIMEOUT=300,PROCTIMEOUT=300', RC: 0 },
    'icm/server_port_1': { PARAMETER_VALUE: 'PROT=HTTPS,PORT=44364,TIMEOUT=300,VCLIENT=0', RC: 0 },
    'icm/server_port_2': { PARAMETER_VALUE: 'PROT=SMTP,PORT=8364,TIMEOUT=300', RC: 0 },
    'icm/server_port_3': { PARAMETER_VALUE: 'PROT=HTTPS, PORT=44301, TIMEOUT=300, VCLIENT=1', RC: 0 },
    // Defined but empty — not the same as unknown, and the reason `exists` exists.
    'icm/server_port_4': { PARAMETER_VALUE: '', RC: 0 },
    'icm/HTTPS/verify_client': { PARAMETER_VALUE: '0', RC: 0 },
    'login/certificate_mapping_rulebased': { PARAMETER_VALUE: '1', RC: 0 },
    'snc/enable': { PARAMETER_VALUE: '1', RC: 0 },
    'snc/identity/as': { PARAMETER_VALUE: 'p:CN=DEV, OU=SAP Security, O=ExampleOrg IT, C=DE', RC: 0 },
    'snc/accept_insecure_rfc': { PARAMETER_VALUE: '1', RC: 0 },
    'login/accept_sso2_ticket': { PARAMETER_VALUE: '1', RC: 0 },
    'login/create_sso2_ticket': { PARAMETER_VALUE: '1', RC: 0 },
    'login/disable_password_logon': { PARAMETER_VALUE: '0', RC: 0 },
    'login/fails_to_user_lock': { PARAMETER_VALUE: '3', RC: 0 }
};

/**
 * @param overrides Replaces or adds parameter answers.
 * @param failing   Parameter names the batch reports an error for. `['*']` fails
 *                  every one, which is what NOT_AUTHORIZED actually looks like —
 *                  the authorisation is on the function module, not per parameter.
 * @param wire      false to leave the batch route unwired.
 */
function makeParameterHandler(
    overrides: Record<string, { PARAMETER_VALUE: string; RC: number }> = {},
    failing: string[] = [],
    wire = true,
    baseUrl = 'https://sapdev.example.com:44301'
) {
    const batches: any[][] = [];
    const values = { ...PROFILE, ...overrides };
    const client = { username: 'DEVUSER', baseUrl } as unknown as ADTClient;

    const batchCaller = async (calls: any[]) => {
        batches.push(calls);
        return {
            ok: true,
            calls: calls.map(call => {
                const name = String(call.inputParameters?.PARAMETER_NAME ?? '');
                if (failing.includes('*') || failing.includes(name)) {
                    return {
                        functionModule: call.functionModuleName,
                        ok: false,
                        error: { code: -31000, message: `TH_GET_PARAMETER raised NOT_AUTHORIZED for ${name}.` }
                    };
                }
                return {
                    functionModule: call.functionModuleName,
                    ok: true,
                    // rc 4 is the kernel's "no such parameter".
                    output: values[name] ?? { PARAMETER_VALUE: '', RC: 4 }
                };
            })
        };
    };

    return {
        handler: new BasisHandlers(client, undefined, wire ? batchCaller : undefined),
        batches
    };
}

const runTool = async (handler: BasisHandlers, tool: string, args: any = {}) =>
    JSON.parse((await handler.handle(tool, args)).content[0].text);

describe('readProfileParameters', () => {
    it('reads every parameter in one round trip', async () => {
        const { handler, batches } = makeParameterHandler();

        const payload = await runTool(handler, 'readProfileParameters', {
            parameters: ['snc/enable', 'login/fails_to_user_lock']
        });

        // One batch, not one request per parameter.
        expect(batches).toHaveLength(1);
        expect(batches[0]).toEqual([
            { functionModuleName: 'TH_GET_PARAMETER', inputParameters: { PARAMETER_NAME: 'snc/enable' }, outputParameters: ['PARAMETER_VALUE', 'RC'] },
            { functionModuleName: 'TH_GET_PARAMETER', inputParameters: { PARAMETER_NAME: 'login/fails_to_user_lock' }, outputParameters: ['PARAMETER_VALUE', 'RC'] }
        ]);

        expect(payload.parameters.map((p: any) => [p.name, p.value]))
            .toEqual([['snc/enable', '1'], ['login/fails_to_user_lock', '3']]);
    });

    it('tells an unknown parameter apart from one that is merely empty', async () => {
        // The distinction the kernel makes and the reason both flags exist:
        // icm/server_port_4 is defined and empty, zzz/nope does not exist.
        const { handler } = makeParameterHandler();

        const payload = await runTool(handler, 'readProfileParameters', {
            parameters: ['icm/server_port_4', 'zzz/nope', 'snc/enable']
        });

        expect(payload.parameters).toEqual([
            { name: 'icm/server_port_4', value: '', exists: true, isSet: false, rc: 0 },
            { name: 'zzz/nope', value: '', exists: false, isSet: false, rc: 4 },
            { name: 'snc/enable', value: '1', exists: true, isSet: true, rc: 0 }
        ]);
        expect(payload.unknown).toEqual(['zzz/nope']);
    });

    it('keeps a per-parameter failure local', async () => {
        const { handler } = makeParameterHandler({}, ['snc/enable']);

        const payload = await runTool(handler, 'readProfileParameters', {
            parameters: ['snc/enable', 'login/fails_to_user_lock']
        });

        expect(payload.failed).toBe(1);
        expect(payload.read).toBe(1);
        expect(payload.parameters[0].error).toMatch(/NOT_AUTHORIZED/);
        // The healthy one still came back.
        expect(payload.parameters[1].value).toBe('3');
    });

    it('answers in the order asked for', async () => {
        const { handler } = makeParameterHandler();

        const names = ['login/fails_to_user_lock', 'snc/enable', 'icm/HTTPS/verify_client'];
        const payload = await runTool(handler, 'readProfileParameters', { parameters: names });

        expect(payload.parameters.map((p: any) => p.name)).toEqual(names);
    });

    it('accepts a single name without an array', async () => {
        const { handler } = makeParameterHandler();
        const payload = await runTool(handler, 'readProfileParameters', { parameters: 'snc/enable' });
        expect(payload.parameters[0].value).toBe('1');
    });

    it('says what it needs when given no name', async () => {
        const { handler } = makeParameterHandler();

        await expect(runTool(handler, 'readProfileParameters', { parameters: [] }))
            .rejects.toThrow(/needs at least one parameter name/);
        await expect(runTool(handler, 'readProfileParameters', {}))
            .rejects.toThrow(/needs at least one parameter name/);
    });

    it('says so when the JSON-RPC route is not wired in', async () => {
        const { handler } = makeParameterHandler({}, [], false);

        await expect(runTool(handler, 'readProfileParameters', { parameters: ['snc/enable'] }))
            .rejects.toThrow(/needs the JSON-RPC route, which is not wired/);
    });
});

describe('checkLogonConfiguration', () => {
    it('finds the ICM port behind SAP_URL and reads its VCLIENT', async () => {
        const { handler } = makeParameterHandler();

        const payload = await runTool(handler, 'checkLogonConfiguration');

        expect(payload.instance.port).toBe('44301');
        expect(payload.certificateLogon).toMatchObject({
            possibleOnThisPort: true,
            port: '44301',
            mode: 'requested',
            globalVerifyClient: '0',
            ruleBasedMapping: true
        });
        expect(payload.certificateLogon.decidedBy).toBe('VCLIENT=1 on icm/server_port_3');
    });

    it('lets a per-port VCLIENT override the global verify_client', async () => {
        // The trap: reading icm/HTTPS/verify_client alone says 0, which would be
        // read as "certificates impossible" — and it is wrong.
        const { handler } = makeParameterHandler();
        const payload = await runTool(handler, 'checkLogonConfiguration');

        expect(payload.certificateLogon.globalVerifyClient).toBe('0');
        expect(payload.certificateLogon.possibleOnThisPort).toBe(true);

        // And the other way round: a global 1 does not save a port with VCLIENT=0.
        const { handler: reversed } = makeParameterHandler({
            'icm/HTTPS/verify_client': { PARAMETER_VALUE: '1', RC: 0 },
            'icm/server_port_3': { PARAMETER_VALUE: 'PROT=HTTPS, PORT=44301, VCLIENT=0', RC: 0 }
        });

        const off = await runTool(reversed, 'checkLogonConfiguration');
        expect(off.certificateLogon.possibleOnThisPort).toBe(false);
        expect(off.warnings.join(' ')).toMatch(/never asks for a certificate/);
    });

    it('inherits the global setting for a port that has no VCLIENT', async () => {
        const { handler } = makeParameterHandler({
            'icm/HTTPS/verify_client': { PARAMETER_VALUE: '2', RC: 0 },
            'icm/server_port_3': { PARAMETER_VALUE: 'PROT=HTTPS, PORT=44301, TIMEOUT=300', RC: 0 }
        });

        const payload = await runTool(handler, 'checkLogonConfiguration');

        expect(payload.certificateLogon.mode).toBe('required');
        expect(payload.certificateLogon.decidedBy).toMatch(/no VCLIENT on icm\/server_port_3/);
    });

    it('does not claim anything about a port that is not HTTPS', async () => {
        const { handler } = makeParameterHandler();
        const payload = await runTool(handler, 'checkLogonConfiguration');

        const http = payload.ports.find((p: any) => p.port === '8064');
        expect(http).toMatchObject({ protocol: 'HTTP', clientCertificates: 'not-applicable' });
        expect(payload.ports.find((p: any) => p.port === '8364').protocol).toBe('SMTP');
    });

    it('skips the port slots that are empty or unknown', async () => {
        const { handler } = makeParameterHandler();
        const payload = await runTool(handler, 'checkLogonConfiguration');

        // Slot 4 is defined but empty, 5..9 are unknown. Neither is a port.
        expect(payload.ports.map((p: any) => p.parameter)).toEqual([
            'icm/server_port_0', 'icm/server_port_1', 'icm/server_port_2', 'icm/server_port_3'
        ]);
    });

    it('points at the Web Dispatcher when no port matches', async () => {
        // A very real case: TLS terminated in front, so this instance's ports say
        // nothing about what the client meets.
        const { handler } = makeParameterHandler({}, [], true, 'https://sap-proxy.example.com:443');

        const payload = await runTool(handler, 'checkLogonConfiguration');

        expect(payload.certificateLogon.possibleOnThisPort).toBe(false);
        expect(payload.warnings.join(' ')).toMatch(/Web Dispatcher or reverse proxy/);
    });

    it('warns when rule-based certificate mapping is off', async () => {
        const { handler } = makeParameterHandler({
            'login/certificate_mapping_rulebased': { PARAMETER_VALUE: '0', RC: 0 }
        });

        const payload = await runTool(handler, 'checkLogonConfiguration');

        expect(payload.certificateLogon.ruleBasedMapping).toBe(false);
        expect(payload.warnings.join(' ')).toMatch(/only explicit USREXTID entries/);
    });

    it('reads a total failure as an authorisation problem, not a configuration one', async () => {
        const { handler } = makeParameterHandler({}, ['*']);

        const payload = await runTool(handler, 'checkLogonConfiguration');

        expect(payload.warnings).toHaveLength(1);
        expect(payload.warnings[0]).toMatch(/NOT_AUTHORIZED.*authorisation problem/);
        // And none of the conclusions that would only be artefacts of the failure.
        expect(payload.warnings.join(' ')).not.toMatch(/Web Dispatcher|USREXTID/);
    });

    it('summarises the methods the system accepts', async () => {
        const { handler } = makeParameterHandler();

        const payload = await runTool(handler, 'checkLogonConfiguration');
        const byMethod = new Map(payload.methods.map((m: any) => [m.method, m]));

        expect((byMethod.get('X.509 client certificate (HTTPS)') as any).status).toBe('requested on port 44301');
        expect((byMethod.get('SNC (RFC and SAP GUI)') as any).status).toBe('enabled');
        expect((byMethod.get('SNC (RFC and SAP GUI)') as any).detail).toContain('p:CN=DEV');
        expect((byMethod.get('SAP logon ticket (SSO2)') as any).status).toBe('accepted');
        expect((byMethod.get('User and password') as any).detail).toMatch(/locks the user after 3/);
        // Not a profile parameter, so silence would read as "unsupported".
        expect((byMethod.get('SPNEGO / Kerberos') as any).status)
            .toBe('not determinable from profile parameters');
    });

    it('reads ten port slots by default, and more on request', async () => {
        const { handler, batches } = makeParameterHandler();

        await runTool(handler, 'checkLogonConfiguration');
        const ports = batches[0].filter(c => /icm\/server_port_/.test(c.inputParameters.PARAMETER_NAME));
        expect(ports).toHaveLength(10);

        const { handler: wider, batches: widerBatches } = makeParameterHandler();
        await runTool(wider, 'checkLogonConfiguration', { maxPorts: 20 });
        expect(widerBatches[0].filter(c => /icm\/server_port_/.test(c.inputParameters.PARAMETER_NAME)))
            .toHaveLength(20);
    });

    it('returns the raw parameters only when asked', async () => {
        const { handler } = makeParameterHandler();

        expect(await runTool(handler, 'checkLogonConfiguration')).not.toHaveProperty('parameters');
        expect((await runTool(handler, 'checkLogonConfiguration', { includeParameters: true })).parameters)
            .toBeDefined();
    });
});
