import { vi, type MockedFunction } from 'vitest';
import { createSessionSource, fixedSessionSource } from '../session';
import { CertificateAuthError } from '../certauth';
import { bootstrapSsoSession } from '../sso';

// importActual is a promise under vitest, so the factory is async — everything
// else about the partial mock is unchanged: the real module, with only
// bootstrapSsoSession replaced.
vi.mock('../sso', async () => ({
    ...(await vi.importActual<typeof import('../sso')>('../sso')),
    bootstrapSsoSession: vi.fn()
}));

const bootstrapMock = bootstrapSsoSession as MockedFunction<typeof bootstrapSsoSession>;

/**
 * The seam between "this server needs a session" and "here is how you get one".
 *
 * Both production adapters are covered where their own work happens — sso.test.ts
 * for the Kerberos response, certauth.test.ts for the certificate handshake. What
 * is tested here is the choice between them, and that everything the environment
 * decides is decided once, at construction.
 */

const KERBEROS_ENV = {
    SAP_URL: 'https://sap.example.com:44301',
    SAP_CLIENT: '100',
    SAP_LANGUAGE: 'EN'
};

/** The smallest OAuth configuration that resolves: a client and somewhere to ask. */
const OAUTH_ENV = {
    SAP_OAUTH_TOKEN_URL: 'https://auth.example.com/oauth/token',
    SAP_OAUTH_CLIENT_ID: 'sb-abap-agent!t1234',
    SAP_OAUTH_CLIENT_SECRET: 'shhh'
};

describe('createSessionSource', () => {
    it('uses Kerberos when nothing points at a certificate', () => {
        expect(createSessionSource(KERBEROS_ENV).mode).toBe('kerberos');
    });

    it('carries no https agent in Kerberos mode', () => {
        // The ADT client is built with the agent this exposes; handing it one in
        // Kerberos mode would attach a client certificate to every request.
        expect(createSessionSource(KERBEROS_ENV).httpsAgent).toBeUndefined();
    });

    it('honours an explicit SAP_AUTH_MODE over the file heuristic', () => {
        expect(createSessionSource({ ...KERBEROS_ENV, SAP_AUTH_MODE: 'kerberos' }).mode)
            .toBe('kerberos');
    });

    it('rejects an unknown SAP_AUTH_MODE at construction, not at first use', () => {
        // A misconfiguration found on the first tool call reads as a transient
        // failure; found at startup it reads as what it is.
        expect(() => createSessionSource({ ...KERBEROS_ENV, SAP_AUTH_MODE: 'ldap' }))
            .toThrow(CertificateAuthError);
    });

    it('says what is missing when certificate mode has no certificate file', () => {
        expect(() => createSessionSource({ ...KERBEROS_ENV, SAP_AUTH_MODE: 'certificate' }))
            .toThrow(/SAP_CERT_FILE/);
    });

    it('selects OAuth mode from an OAuth client, and carries the agent for it', () => {
        const source = createSessionSource({ ...KERBEROS_ENV, ...OAUTH_ENV });

        expect(source.mode).toBe('oauth');
        // Handed to the ADT client, so SAP_CA_FILE and the TLS setting apply to
        // every request rather than only to the logon.
        expect(source.httpsAgent).toBeDefined();
        expect(typeof source.probe).toBe('function');
    });

    it('says what is missing when OAuth mode has no token endpoint', () => {
        expect(() => createSessionSource({ ...KERBEROS_ENV, SAP_OAUTH_CLIENT_ID: 'sb-agent!t1' }))
            .toThrow(/SAP_OAUTH_TOKEN_URL/);
    });

    it('carries a probe, so the reachability check goes out over the same credential', () => {
        // A probe that used a different transport would prove nothing about the
        // logon that failed — which is the only question it is asked.
        expect(typeof createSessionSource(KERBEROS_ENV).probe).toBe('function');
    });

    it('does not read the environment again after construction', () => {
        // The point of the seam: index.ts used to re-read process.env inside the
        // method that establishes a session, on every call.
        const env: NodeJS.ProcessEnv = { ...KERBEROS_ENV };
        const source = createSessionSource(env);

        env.SAP_AUTH_MODE = 'certificate';
        env.SAP_CERT_FILE = '/nonexistent.p12';

        expect(source.mode).toBe('kerberos');
    });
});

/**
 * The fallback exists for one shape of user: RFC authorisations, no S_DEVELOP.
 * SAP refuses them the ADT node and serves them everywhere else, so the logon
 * fails while the RFC tools would have worked — and those need a CSRF token,
 * which only a logged-on node hands out.
 *
 * What matters is that it stays off unless asked for, and that a failure of the
 * fallback itself does not overwrite the diagnosis.
 */
describe('the RFC fallback', () => {
    const ADT_PATH = undefined;
    const FALLBACK = '/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/';
    const session = { cookies: new Map([['SAP_SESSIONID_DEV_100', 'x=1']]), csrfToken: 'tok' };
    const withFallback = { ...KERBEROS_ENV, ABAP_MCP_RFC_FALLBACK: '1' };

    // Braces, not an expression body: vitest treats whatever a hook returns as a
    // teardown function, and mockReset() returns the mock — which vitest would
    // then call after each test, rejecting into nobody's catch.
    beforeEach(() => { bootstrapMock.mockReset(); });

    const pathsTried = () => bootstrapMock.mock.calls.map(([cfg]) => cfg.bootstrapPath);

    it('is off unless asked for, so a refused logon still fails', async () => {
        bootstrapMock.mockRejectedValue(new Error('HTTP 403'));

        await expect(createSessionSource(KERBEROS_ENV).establish()).rejects.toThrow('HTTP 403');
        expect(pathsTried()).toEqual([ADT_PATH]);
    });

    it('does not touch the fallback node when ADT works', async () => {
        bootstrapMock.mockResolvedValue(session);

        const established = await createSessionSource(withFallback).establish();

        expect(pathsTried()).toEqual([ADT_PATH]);
        // Absent rather than false: healthcheck reports the degraded block only
        // when there is something to report.
        expect(established.viaFallback).toBeUndefined();
    });

    it('falls back to the catalog node when SAP refuses ADT, and says so', async () => {
        bootstrapMock
            .mockRejectedValueOnce(new Error('HTTP 403'))
            .mockResolvedValueOnce(session);

        const established = await createSessionSource(withFallback).establish();

        expect(pathsTried()).toEqual([ADT_PATH, FALLBACK]);
        expect(established.viaFallback).toBe(FALLBACK);
        expect(established.csrfToken).toBe('tok');
    });

    it('throws the ADT failure, not the fallback one, when neither works', async () => {
        // The ADT refusal is the diagnosis. Reporting that a second node also
        // refused sends whoever reads it to the wrong ICF node.
        bootstrapMock
            .mockRejectedValueOnce(new Error('HTTP 403 from ADT'))
            .mockRejectedValueOnce(new Error('HTTP 404 from the catalog service'));

        await expect(createSessionSource(withFallback).establish())
            .rejects.toThrow('HTTP 403 from ADT');
    });

    it('honours an overridden fallback node', async () => {
        bootstrapMock
            .mockRejectedValueOnce(new Error('HTTP 403'))
            .mockResolvedValueOnce(session);

        const established = await createSessionSource({
            ...withFallback,
            SAP_FALLBACK_BOOTSTRAP_PATH: '/sap/bc/custom/'
        }).establish();

        expect(pathsTried()).toEqual([ADT_PATH, '/sap/bc/custom/']);
        expect(established.viaFallback).toBe('/sap/bc/custom/');
    });

    it.each(['0', 'false', 'no', '', '   '])('stays off for ABAP_MCP_RFC_FALLBACK=%p', async (value) => {
        bootstrapMock.mockRejectedValue(new Error('HTTP 403'));

        await expect(
            createSessionSource({ ...KERBEROS_ENV, ABAP_MCP_RFC_FALLBACK: value }).establish()
        ).rejects.toThrow('HTTP 403');
        expect(pathsTried()).toEqual([ADT_PATH]);
    });
});

describe('fixedSessionSource', () => {
    const session = { cookies: new Map([['SAP_SESSIONID_DEV_100', 'x=1']]), csrfToken: 'tok' };

    it('satisfies the same interface as the two production adapters', async () => {
        const source = fixedSessionSource(session);
        expect(source.mode).toBe('kerberos');
        await expect(source.establish()).resolves.toBe(session);
    });

    it('carries no probe unless one is asked for, so no test reaches the network', () => {
        // healthcheck reports `checked: false` for this, rather than inventing a
        // verdict about a system the test never contacted.
        expect(fixedSessionSource(session).probe).toBeUndefined();
        expect(fixedSessionSource(session, { probe: async () => ({ status: 200, headers: {}, cookies: [] }) }).probe)
            .toBeDefined();
    });

    it('counts how often a session was established, which is what the retry needs', async () => {
        let established = 0;
        const source = fixedSessionSource(session, { onEstablish: () => { established++; } });

        await source.establish();
        await source.establish();

        expect(established).toBe(2);
    });

    it('can present itself as certificate mode, carrying the identity', async () => {
        const withCert = {
            ...session,
            certificate: { subject: 'CN=SVC_ABAP', issuer: 'CN=Internal CA', daysUntilExpiry: 12 }
        };
        const source = fixedSessionSource(withCert, { mode: 'certificate' });

        expect(source.mode).toBe('certificate');
        await expect(source.establish()).resolves.toMatchObject({
            certificate: { daysUntilExpiry: 12 }
        });
    });
});
