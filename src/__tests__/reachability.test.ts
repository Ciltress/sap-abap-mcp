import {
    AUTHENTICATED_PING,
    PUBLIC_PING,
    describeCurlFailure,
    describeNodeFailure,
    interpretCurlProbe,
    interpretReachability,
    probeReachability
} from '../reachability';
import type { HttpProbe, ProbeTransport } from '../reachability';

/**
 * The reachability probe, tested where the decision is made.
 *
 * The transports spawn curl or open a TLS socket, so neither can run offline —
 * but neither decides anything. Every verdict here is a function of two status
 * codes, one header and an error class, which is why `interpretReachability` is
 * pure and this file needs no SAP system.
 *
 * The header samples are the shapes captured live while diagnosing the failure
 * this module exists for: DEV/100 serving ADT normally, and P01/200 and A01/200
 * refusing it — first with an inactive ICF node, then, once that was activated,
 * with a Kerberos token SAP would not map to a user.
 */

const headers = (...lines: string[]) => lines.join('\r\n') + '\r\n\r\n';

/** DEV/100: the ADT node is served and the ticket is accepted. */
const SERVED = headers(
    'HTTP/1.1 200 OK',
    'set-cookie: SPNegoTokenRequested=0; expires=Tue, 01-Jan-1980 00:00:01 GMT; path=/',
    'set-cookie: sap-usercontext=sap-client=100; path=/',
    'set-cookie: SAP_SESSIONID_DEV_100=abc123; path=/',
    'content-type: text/html; charset=utf-8',
    'sap-perf-fesrec: 7259.000000'
);

/** P01/200 before the ICF node was activated: refused with no logon offered at all. */
const ICF_REFUSED = headers(
    'HTTP/1.1 403 Forbidden',
    'content-type: text/html; charset=utf-8',
    'content-length: 1854',
    'sap-perf-fesrec: 1222.000000'
);

/** P01/200 after activation: the token arrived, SAP would not map it, and fell back to Basic. */
const TOKEN_REJECTED = headers(
    'HTTP/1.1 401 Unauthorized',
    'set-cookie: SPNegoTokenRequested=0; expires=Tue, 01-Jan-1980 00:00:01 GMT; path=/',
    'www-authenticate: Basic realm="SAP NetWeaver Application Server [P01/200]"'
);

/** The plain challenge, which is what a machine with no ticket at all gets stuck on. */
const CHALLENGED = headers(
    'HTTP/1.1 401 Unauthorized',
    'set-cookie: SPNegoTokenRequested=2026-08-18%2010%3a59%3a22; path=/; HttpOnly',
    'www-authenticate: Negotiate'
);

const ok = (): HttpProbe => interpretCurlProbe(SERVED);
const KERBEROS = { baseUrl: 'https://sapdev.example.com:44301', authMode: 'kerberos' as const };

describe('interpretCurlProbe', () => {
    it('reads the status, the headers and the cookies out of a dump', () => {
        const probe = interpretCurlProbe(SERVED);

        expect(probe.status).toBe(200);
        expect(probe.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(probe.cookies).toHaveLength(3);
        expect(probe.error).toBeUndefined();
    });

    it('keeps set-cookie values unsplit, because a cookie value contains commas', () => {
        // `expires=Tue, 01-Jan-1980 ...` would be two cookies if these were joined
        // and split again, and the SAP_SESSIONID name is read from this list.
        expect(interpretCurlProbe(SERVED).cookies[0])
            .toBe('SPNegoTokenRequested=0; expires=Tue, 01-Jan-1980 00:00:01 GMT; path=/');
    });

    it('takes the last response, which is the one --negotiate ends on', () => {
        // curl dumps the challenge and the answer to its retry. The first block is
        // never the verdict: here it is a 401 that was then satisfied.
        const probe = interpretCurlProbe(CHALLENGED + SERVED);

        expect(probe.status).toBe(200);
        expect(probe.headers['www-authenticate']).toBeUndefined();
    });

    it('keeps the Basic fallback from the final block, which is what a rejection looks like', () => {
        const probe = interpretCurlProbe(CHALLENGED + TOKEN_REJECTED);

        expect(probe.status).toBe(401);
        expect(probe.headers['www-authenticate']).toMatch(/Basic realm=/);
    });

    it('lower-cases header names and joins repeats', () => {
        const probe = interpretCurlProbe(headers(
            'HTTP/1.1 401 Unauthorized',
            'WWW-Authenticate: Negotiate',
            'WWW-Authenticate: Basic realm="x"'
        ));
        expect(probe.headers['www-authenticate']).toBe('Negotiate, Basic realm="x"');
    });

    it('accepts HTTP/2 status lines', () => {
        expect(interpretCurlProbe('HTTP/2 200\r\n\r\n').status).toBe(200);
    });

    it('reports output with no response at all as a failure rather than a zero status', () => {
        const probe = interpretCurlProbe('curl: (6) Could not resolve host');
        expect(probe.status).toBe(0);
        expect(probe.error?.code).toBe('OTHER');
    });

    it('does not throw on empty or missing output', () => {
        expect(() => interpretCurlProbe('')).not.toThrow();
        expect(() => interpretCurlProbe(undefined as any)).not.toThrow();
    });
});

describe('interpretReachability', () => {
    it('calls it ok when the authenticated ping answers, and names the system', () => {
        const report = interpretReachability({ publicPing: ok(), authPing: ok() }, KERBEROS);

        expect(report.ok).toBe(true);
        expect(report.layer).toBe('ok');
        expect(report.observed).toEqual({ systemId: 'DEV', client: '100' });
        expect(report.advice).toBeUndefined();
    });

    it('separates an inactive ICF node from a rejected logon — the distinction it exists for', () => {
        const report = interpretReachability(
            { publicPing: ok(), authPing: interpretCurlProbe(ICF_REFUSED) },
            KERBEROS
        );

        expect(report.layer).toBe('icf');
        // The whole failure was reading this as an authentication problem. The
        // advice has to say the opposite, in as many words.
        expect(report.advice).toMatch(/not about your Kerberos ticket/);
        expect(report.advice).toMatch(/SICF/);
        expect(report.advice).not.toMatch(/klist/);
    });

    it('reads a Basic fallback as a token SAP received and refused', () => {
        const report = interpretReachability(
            { publicPing: ok(), authPing: interpretCurlProbe(TOKEN_REJECTED) },
            KERBEROS
        );

        expect(report.layer).toBe('logon');
        expect(report.advice).toMatch(/received a Kerberos token and rejected it/);
        // The point of telling them apart: klist is a dead end for this one.
        expect(report.advice).toMatch(/will look perfectly healthy/);
        expect(report.advice).toMatch(/master record in P01\/200/);
    });

    it('names the system from the Basic realm even though the logon failed', () => {
        // There is no session cookie to read here, and this is exactly the case
        // where a server pointed at the wrong system is hardest to notice.
        const report = interpretReachability(
            { publicPing: ok(), authPing: interpretCurlProbe(TOKEN_REJECTED) },
            KERBEROS
        );
        expect(report.observed).toEqual({ systemId: 'P01', client: '200' });
    });

    it('reads a bare challenge as no token having been sent', () => {
        const report = interpretReachability(
            { publicPing: ok(), authPing: interpretCurlProbe(CHALLENGED) },
            KERBEROS
        );

        expect(report.layer).toBe('logon');
        expect(report.advice).toMatch(/klist/);
        expect(report.advice).not.toMatch(/master record/);
    });

    it('does not blame the ICF for a system that never answered', () => {
        const dead: HttpProbe = {
            status: 0, headers: {}, cookies: [],
            error: { code: 'CONNECT', message: 'could not connect' }
        };
        const report = interpretReachability({ publicPing: dead, authPing: dead }, KERBEROS);

        expect(report.layer).toBe('network');
        expect(report.advice).toMatch(/VPN/);
    });

    it('separates a TLS failure from an unreachable host', () => {
        const untrusted: HttpProbe = {
            status: 0, headers: {}, cookies: [],
            error: { code: 'TLS', message: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }
        };
        const report = interpretReachability(
            { publicPing: untrusted, authPing: untrusted },
            KERBEROS
        );

        expect(report.layer).toBe('tls');
        expect(report.advice).toMatch(/SAP_CA_FILE|NODE_TLS_REJECT_UNAUTHORIZED/);
    });

    it('lets a working logon overrule a public ping that is switched off', () => {
        // /sap/public/ping is itself a hardening target. It must never veto an
        // authenticated ping that plainly worked.
        const report = interpretReachability(
            { publicPing: interpretCurlProbe(ICF_REFUSED), authPing: ok() },
            KERBEROS
        );
        expect(report.layer).toBe('ok');
    });

    it('says so when both nodes are refused, since that points in front of the ICF', () => {
        const refused = interpretCurlProbe(ICF_REFUSED);
        const report = interpretReachability({ publicPing: refused, authPing: refused }, KERBEROS);

        expect(report.layer).toBe('icf');
        expect(report.advice).toMatch(/normally always on/);
    });

    it('gives certificate mode its own advice rather than talking about tickets', () => {
        const report = interpretReachability(
            { publicPing: ok(), authPing: interpretCurlProbe(TOKEN_REJECTED) },
            { ...KERBEROS, authMode: 'certificate' }
        );

        expect(report.summary).toMatch(/client certificate/);
        expect(report.advice).toMatch(/CERTRULE/);
    });

    it('gives OAuth mode its own advice, and names the token rather than a ticket', () => {
        const report = interpretReachability(
            { publicPing: ok(), authPing: interpretCurlProbe(TOKEN_REJECTED) },
            { ...KERBEROS, authMode: 'oauth' }
        );

        expect(report.summary).toMatch(/OAuth 2.0 access token/);
        expect(report.advice).toMatch(/SOAUTH2/);
        // The Kerberos advice would send the reader to klist for a mode that has
        // no ticket, which is the failure this whole module exists to prevent.
        expect(report.advice).not.toMatch(/klist/);
    });

    it('does not blame SAP when no credential could be obtained at all', () => {
        // OAuth mode only: the token endpoint is frequently a different host, so
        // reporting its refusal as an unreachable SAP sends the reader to the
        // wrong system entirely. Nothing was sent, and the verdict says so.
        const noCredential: HttpProbe = {
            status: 0,
            headers: {},
            cookies: [],
            error: { code: 'CREDENTIAL', message: 'the token endpoint rejected the client credentials' }
        };
        const report = interpretReachability(
            { publicPing: noCredential, authPing: noCredential },
            { ...KERBEROS, authMode: 'oauth' }
        );

        expect(report.layer).toBe('logon');
        expect(report.summary).toMatch(/never asked/);
        expect(report.advice).toMatch(/SAP_OAUTH_TOKEN_URL/);
    });

    it('always reports both endpoints, so the reader can second-guess the verdict', () => {
        const report = interpretReachability(
            { publicPing: ok(), authPing: interpretCurlProbe(ICF_REFUSED) },
            KERBEROS
        );

        expect(report.endpoints).toEqual([
            { path: PUBLIC_PING, status: 200 },
            { path: AUTHENTICATED_PING, status: 403 }
        ]);
    });

    it('does not pretend to a verdict for a status it cannot read', () => {
        const teapot: HttpProbe = { status: 418, headers: {}, cookies: [] };
        const report = interpretReachability({ publicPing: ok(), authPing: teapot }, KERBEROS);

        expect(report.layer).toBe('unknown');
        expect(report.ok).toBe(false);
    });
});

describe('probeReachability', () => {
    const transportFor = (byPath: Record<string, HttpProbe>): ProbeTransport =>
        async url => byPath[new URL(url).pathname];

    it('asks both nodes, carrying the client and language SAP needs', async () => {
        const asked: string[] = [];
        const transport: ProbeTransport = async url => {
            asked.push(url);
            return ok();
        };

        await probeReachability({
            baseUrl: 'https://sap.example.com:44301',
            client: '100',
            language: 'EN',
            authMode: 'kerberos',
            transport
        });

        expect(asked).toHaveLength(2);
        expect(asked[0]).toBe(`https://sap.example.com:44301${PUBLIC_PING}?sap-client=100&sap-language=EN`);
        expect(asked[1]).toContain(AUTHENTICATED_PING);
    });

    it('does not double the slash when SAP_URL carries a trailing one', async () => {
        const asked: string[] = [];
        await probeReachability({
            baseUrl: 'https://sap.example.com:44301/',
            authMode: 'kerberos',
            transport: async url => { asked.push(url); return ok(); }
        });
        expect(asked[0]).toBe(`https://sap.example.com:44301${PUBLIC_PING}`);
    });

    it('reads the pair, not just one of them', async () => {
        const report = await probeReachability({
            baseUrl: 'https://sap.example.com:44301',
            authMode: 'kerberos',
            transport: transportFor({
                [PUBLIC_PING]: ok(),
                [AUTHENTICATED_PING]: interpretCurlProbe(ICF_REFUSED)
            })
        });

        expect(report.layer).toBe('icf');
    });
});

describe('failure classification', () => {
    it.each([
        [6, 'DNS'],
        [7, 'CONNECT'],
        [28, 'TIMEOUT'],
        [35, 'TLS'],
        [60, 'TLS']
    ])('maps curl exit %i to %s', (exit, expected) => {
        expect(describeCurlFailure({ code: exit, stderr: 'curl said so' }).code).toBe(expected);
    });

    it('says curl itself is missing rather than reporting a network failure', () => {
        const failure = describeCurlFailure({ code: 'ENOENT', message: 'spawn failed' });
        expect(failure.code).toBe('OTHER');
        expect(failure.message).toMatch(/curl was not found/);
    });

    it.each([
        ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'TLS'],
        ['ENOTFOUND', 'DNS'],
        ['ECONNREFUSED', 'CONNECT'],
        ['ETIMEDOUT', 'TIMEOUT']
    ])('maps node error %s to %s', (code, expected) => {
        expect(describeNodeFailure(Object.assign(new Error(code), { code })).code).toBe(expected);
    });
});
