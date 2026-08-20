import { SsoBootstrapError, injectSsoSession, interpretSsoResponse } from '../sso';

/**
 * The Kerberos bootstrap, tested where it can be: the response reader.
 *
 * `bootstrapSsoSession` itself spawns curl with --negotiate against a real SAP
 * host, so it can only run on a domain-joined machine with a ticket. Everything
 * that actually goes wrong in practice is in the text curl hands back, and that
 * is what `interpretSsoResponse` owns — the same split ./certauth.ts already
 * makes with `interpretBootstrapResponse`.
 *
 * The header samples are the shape verified live and recorded in ./sso.ts.
 */

const headers = (...lines: string[]) => lines.join('\r\n');

const OK = headers(
    'HTTP/1.1 200 OK',
    'set-cookie: sap-usercontext=sap-client=100; path=/',
    'set-cookie: SAP_SESSIONID_DEV_100=abc123def456; path=/; HttpOnly',
    'x-csrf-token: aVerySecretToken==',
    'content-length: 0',
    ''
);

describe('interpretSsoResponse', () => {
    it('reads the cookies and the CSRF token out of a successful bootstrap', () => {
        const session = interpretSsoResponse(OK);

        expect(session.csrfToken).toBe('aVerySecretToken==');
        expect(session.cookies.get('SAP_SESSIONID_DEV_100')).toBe('SAP_SESSIONID_DEV_100=abc123def456');
        expect(session.cookies.get('sap-usercontext')).toBe('sap-usercontext=sap-client=100');
    });

    it('keeps the SAP_SESSIONID cookie name intact, because the system id is read from it', () => {
        // systemIdentity.ts parses SAP_SESSIONID_<SID>_<CLIENT>; mangling the name
        // here would make the server unable to say which system it is bound to.
        const names = [...interpretSsoResponse(OK).cookies.keys()];
        expect(names).toContain('SAP_SESSIONID_DEV_100');
    });

    it('strips the path attribute rather than carrying it into the cookie value', () => {
        // SAP sends `path=/` both as its own attribute and, on some releases,
        // comma-joined into the value. Either way it must not survive.
        const session = interpretSsoResponse(headers(
            'HTTP/1.1 200 OK',
            'set-cookie: SAP_SESSIONID_DEV_100=xyz; path=/,',
            'x-csrf-token: t',
            ''
        ));
        expect(session.cookies.get('SAP_SESSIONID_DEV_100')).toBe('SAP_SESSIONID_DEV_100=xyz');
    });

    it('matches the headers case-insensitively, as HTTP allows', () => {
        const session = interpretSsoResponse(headers(
            'HTTP/1.1 200 OK',
            'Set-Cookie: SAP_SESSIONID_DEV_100=xyz; path=/',
            'X-CSRF-Token: TOKEN',
            ''
        ));
        expect(session.csrfToken).toBe('TOKEN');
        expect(session.cookies.size).toBe(1);
    });

    it('accepts HTTP/2 status lines', () => {
        expect(() => interpretSsoResponse(headers(
            'HTTP/2 200',
            'set-cookie: SAP_SESSIONID_DEV_100=xyz; path=/',
            'x-csrf-token: t',
            ''
        ))).not.toThrow();
    });

    it('does not blame Kerberos for a 403, which SAP sends before any logon', () => {
        // This test used to assert the opposite, and the opposite was wrong. Two
        // systems refused every request with 403 because the ADT ICF node was not
        // active; both were reported as a missing Kerberos ticket, and the tickets
        // were fine. SAP never examined a credential, so a credential cannot be
        // the diagnosis. ../reachability.ts proves which layer it was.
        expect(() => interpretSsoResponse('HTTP/1.1 403 Forbidden\r\n\r\n'))
            .toThrow(SsoBootstrapError);
        expect(() => interpretSsoResponse('HTTP/1.1 403 Forbidden\r\n\r\n'))
            .toThrow(/before offering a logon|SICF/);
        expect(() => interpretSsoResponse('HTTP/1.1 403 Forbidden\r\n\r\n'))
            .not.toThrow(/klist/);
    });

    it('reads a 401 that falls back to Basic as a token SAP received and refused', () => {
        // The shape P01/200 returns: the ticket reached SAP and could not be
        // mapped to a user, so klist is a dead end and the user master record is
        // not. Verified live.
        const rejected = headers(
            'HTTP/1.1 401 Unauthorized',
            'www-authenticate: Basic realm="SAP NetWeaver Application Server [P01/200]"',
            ''
        );
        expect(() => interpretSsoResponse(rejected)).toThrow(/received a Kerberos token and rejected it/);
        expect(() => interpretSsoResponse(rejected)).toThrow(/SPNEGO\/USREXTID/);
    });

    it('reads a bare 401 challenge as no token having been sent', () => {
        // Nothing was offered to map, which is what a missing ticket or a
        // disconnected VPN looks like — the one case klist actually answers.
        expect(() => interpretSsoResponse('HTTP/1.1 401 Unauthorized\r\n\r\n'))
            .toThrow(/no token was sent/);
        expect(() => interpretSsoResponse('HTTP/1.1 401 Unauthorized\r\n\r\n'))
            .toThrow(/klist/);
    });

    it('reports any other non-2xx status with the status itself', () => {
        expect(() => interpretSsoResponse('HTTP/1.1 500 Internal Server Error\r\n\r\n'))
            .toThrow(/unerwarteter HTTP-Status 500/);
    });

    it('treats an unreadable status line as a failure rather than a success', () => {
        expect(() => interpretSsoResponse('curl: (6) Could not resolve host\r\n'))
            .toThrow(SsoBootstrapError);
    });

    it('rejects a 200 that carries no cookie', () => {
        expect(() => interpretSsoResponse(headers('HTTP/1.1 200 OK', 'x-csrf-token: t', '')))
            .toThrow(/kein Cookie\/CSRF-Token/);
    });

    it('rejects a 200 that carries no CSRF token', () => {
        // Without the token AdtHTTP would fall back to login() and send the
        // placeholder password, which is what must never reach SAP.
        expect(() => interpretSsoResponse(headers(
            'HTTP/1.1 200 OK',
            'set-cookie: SAP_SESSIONID_DEV_100=xyz; path=/',
            ''
        ))).toThrow(/kein Cookie\/CSRF-Token/);
    });

    it('does not throw a TypeError on empty or missing output', () => {
        expect(() => interpretSsoResponse('')).toThrow(SsoBootstrapError);
        expect(() => interpretSsoResponse(undefined as any)).toThrow(SsoBootstrapError);
    });
});

describe('injectSsoSession', () => {
    it('replaces the cookie jar and sets the token, so AdtHTTP never calls login()', () => {
        // loggedin is `csrfToken !== "fetch"`, so setting the token is what stops
        // AdtHTTP from logging in with the placeholder password.
        const httpClient = { cookie: new Map<string, string>([['stale', 'stale=1']]), csrfToken: 'fetch' };
        const session = interpretSsoResponse(OK);

        injectSsoSession({ httpClient }, session);

        expect(httpClient.csrfToken).toBe('aVerySecretToken==');
        expect(httpClient.cookie.has('stale')).toBe(false);
        expect(httpClient.cookie.get('SAP_SESSIONID_DEV_100')).toBe('SAP_SESSIONID_DEV_100=abc123def456');
    });
});
