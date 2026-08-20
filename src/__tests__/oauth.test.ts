import { execFileSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import {
    createOAuthAgent,
    bearerAuthHeader,
    bootstrapOAuthSession,
    createTokenProvider,
    interpretOAuthResponse,
    interpretTokenResponse,
    OAuthError,
    OAuthTokenRejected,
    readOAuthConfig,
    resolveGrant,
    shouldRetryWithFreshToken,
    type OAuthConfig
} from '../oauth';

/**
 * OAuth 2.0 mode.
 *
 * Two things here are worth more than the rest and most of this file is about
 * them. The first is which failures are latched: an OAuth 2.0 client on AS ABAP
 * is a user in SU01, so a rejected client secret costs a failed logon in exactly
 * the way a rejected password does, and retrying it is how an account gets
 * locked for every other consumer of that user. The second is the opposite case
 * — a token SAP refuses that the endpoint was happy to issue is *not* latched,
 * because minting another costs nothing and the fix is usually applied on the
 * SAP side while this server is running.
 *
 * Nothing here reaches the network: the token endpoint is a JSON body and a
 * status code, which is all the parts that can be got wrong actually depend on.
 */

const CLIENT_CREDENTIALS = {
    SAP_OAUTH_TOKEN_URL: 'https://auth.example.com/oauth/token',
    SAP_OAUTH_CLIENT_ID: 'sb-abap-agent!t1234',
    SAP_OAUTH_CLIENT_SECRET: 'shhh'
};

const config = (over: Partial<OAuthConfig> = {}): OAuthConfig => ({
    grant: 'client_credentials',
    tokenUrl: 'https://auth.example.com/oauth/token',
    clientId: 'sb-abap-agent!t1234',
    clientSecret: 'shhh',
    clientAuth: 'basic',
    rejectUnauthorized: true,
    ...over
});

describe('resolveGrant', () => {
    it('defaults to client_credentials, which is the one that runs unattended', () => {
        expect(resolveGrant({})).toBe('client_credentials');
    });

    it('reads the grant from what is configured, since neither is set by accident', () => {
        expect(resolveGrant({ SAP_OAUTH_TOKEN: 'ey...' })).toBe('static');
        expect(resolveGrant({ SAP_OAUTH_REFRESH_TOKEN: 'r0' })).toBe('refresh_token');
    });

    it('lets an explicit grant win over the heuristic', () => {
        expect(resolveGrant({ SAP_OAUTH_GRANT: 'client_credentials', SAP_OAUTH_TOKEN: 'ey...' }))
            .toBe('client_credentials');
    });

    it.each(['refresh', 'REFRESH_TOKEN', 'refresh token'])('accepts %p as the refresh grant', value => {
        expect(resolveGrant({ SAP_OAUTH_GRANT: value })).toBe('refresh_token');
    });

    it('rejects a grant it does not know rather than falling back to one', () => {
        // Falling back would be worse than failing: 'implicit' would silently
        // become client_credentials and the failure would surface as a 401.
        expect(() => resolveGrant({ SAP_OAUTH_GRANT: 'implicit' }))
            .toThrow(/Unknown SAP_OAUTH_GRANT 'implicit'/);
    });
});

describe('readOAuthConfig', () => {
    it('reads a client_credentials configuration', () => {
        const cfg = readOAuthConfig(CLIENT_CREDENTIALS);
        expect(cfg.grant).toBe('client_credentials');
        expect(cfg.clientId).toBe('sb-abap-agent!t1234');
        expect(cfg.clientAuth).toBe('basic');
        expect(cfg.rejectUnauthorized).toBe(true);
    });

    it('needs a token endpoint, and says where to find one', () => {
        expect(() => readOAuthConfig({ SAP_OAUTH_CLIENT_ID: 'x' }))
            .toThrow(/SAP_OAUTH_TOKEN_URL/);
        expect(() => readOAuthConfig({ SAP_OAUTH_CLIENT_ID: 'x' }))
            .toThrow(/sap\/bc\/sec\/oauth2\/token/);
    });

    it('refuses a plain-http token endpoint', () => {
        // The client secret travels in a header. Over http that is a credential
        // in the clear for everyone on the path.
        expect(() => readOAuthConfig({ ...CLIENT_CREDENTIALS, SAP_OAUTH_TOKEN_URL: 'http://auth/token' }))
            .toThrow(/https/);
    });

    it('needs a secret for client_credentials, where the secret is the whole credential', () => {
        const { SAP_OAUTH_CLIENT_SECRET, ...withoutSecret } = CLIENT_CREDENTIALS;
        expect(() => readOAuthConfig(withoutSecret)).toThrow(/SAP_OAUTH_CLIENT_SECRET/);
    });

    it('says why it cannot obtain a refresh token itself', () => {
        // The authorisation-code flow needs a browser and a redirect URI, and a
        // server started over stdio has neither. Saying so is the difference
        // between a fixable configuration error and an apparent bug.
        expect(() => readOAuthConfig({ ...CLIENT_CREDENTIALS, SAP_OAUTH_GRANT: 'refresh_token' }))
            .toThrow(/browser and a redirect URI/);
    });

    it('points the password grant back at client_credentials, which cannot lock a user', () => {
        expect(() => readOAuthConfig({ ...CLIENT_CREDENTIALS, SAP_OAUTH_GRANT: 'password', SAP_USER: 'X' }))
            .toThrow(/login\/fails_to_user_lock/);
    });

    it('needs nothing but the token for the static grant, and says it cannot renew it', () => {
        expect(readOAuthConfig({ SAP_OAUTH_TOKEN: 'ey.abc' }).staticToken).toBe('ey.abc');
        expect(() => readOAuthConfig({ SAP_OAUTH_GRANT: 'static' })).toThrow(/renew/);
    });

    it('keeps a client secret exactly as given, including its whitespace', () => {
        // Trimming a secret turns a working credential into a failed logon, and
        // a failed logon here counts against the client's user record.
        expect(readOAuthConfig({ ...CLIENT_CREDENTIALS, SAP_OAUTH_CLIENT_SECRET: ' s3cret ' }).clientSecret)
            .toBe(' s3cret ');
    });

    it('follows NODE_TLS_REJECT_UNAUTHORIZED like the other modes', () => {
        expect(readOAuthConfig({ ...CLIENT_CREDENTIALS, NODE_TLS_REJECT_UNAUTHORIZED: '0' }).rejectUnauthorized)
            .toBe(false);
    });

    it('rejects a client authentication method it does not know', () => {
        expect(() => readOAuthConfig({ ...CLIENT_CREDENTIALS, SAP_OAUTH_CLIENT_AUTH: 'jwt' }))
            .toThrow(/SAP_OAUTH_CLIENT_AUTH/);
        expect(readOAuthConfig({ ...CLIENT_CREDENTIALS, SAP_OAUTH_CLIENT_AUTH: 'post' }).clientAuth)
            .toBe('post');
    });
});

describe('bearerAuthHeader', () => {
    it('is the token in an Authorization header, untouched', () => {
        expect(bearerAuthHeader('ey.abc')).toBe('Bearer ey.abc');
    });
});

describe('interpretTokenResponse', () => {
    const issued = (over: Record<string, unknown> = {}) =>
        JSON.stringify({ access_token: 'ey.abc', token_type: 'bearer', expires_in: 3600, ...over });

    it('reads the token and turns expires_in into a moment', () => {
        const token = interpretTokenResponse(200, issued(), config());
        expect(token.value).toBe('ey.abc');
        expect(token.expiresAt).toBeGreaterThan(Date.now() + 3_500_000);
    });

    it('leaves expiresAt unset when the endpoint did not say', () => {
        // Which is what stops the provider from caching it: guessing a lifetime
        // trades one round trip for a credential that is silently already dead.
        expect(interpretTokenResponse(200, issued({ expires_in: undefined }), config()).expiresAt)
            .toBeUndefined();
    });

    it('keeps a rotated refresh token, without which the second refresh fails', () => {
        // SAP BTP rotates them. Reusing the original then answers invalid_grant,
        // hours after a configuration that looked correct.
        expect(interpretTokenResponse(200, issued({ refresh_token: 'r1' }), config()).refreshToken)
            .toBe('r1');
    });

    it('refuses a token type it cannot present', () => {
        expect(() => interpretTokenResponse(200, issued({ token_type: 'mac' }), config()))
            .toThrow(/can only present a bearer token/);
    });

    it('latches a rejected client secret, so nothing spends a second failed logon', () => {
        // The property this module is arranged around. An OAuth 2.0 client on AS
        // ABAP is a user in SU01 and locks like one.
        const error = caught(() => interpretTokenResponse(
            401, JSON.stringify({ error: 'invalid_client' }), config()));

        expect(error).toBeInstanceOf(OAuthError);
        expect((error as OAuthError).permanent).toBe(true);
        expect(error.message).toMatch(/login\/fails_to_user_lock/);
    });

    it('never puts the client secret in the error', () => {
        const error = caught(() => interpretTokenResponse(
            401, JSON.stringify({ error: 'invalid_client' }), config()));
        expect(error.message).not.toContain('shhh');
    });

    it('reads invalid_grant differently for a password than for a refresh token', () => {
        const ropc = caught(() => interpretTokenResponse(
            400, JSON.stringify({ error: 'invalid_grant' }), config({ grant: 'password' })));
        const refresh = caught(() => interpretTokenResponse(
            400, JSON.stringify({ error: 'invalid_grant' }), config({ grant: 'refresh_token' })));

        expect(ropc.message).toMatch(/login\/fails_to_user_lock/);
        expect(refresh.message).toMatch(/rotate/);
        // Both are permanent, for different reasons: one would cost another
        // failed logon, the other would send the identical dead token again.
        expect((ropc as OAuthError).permanent).toBe(true);
        expect((refresh as OAuthError).permanent).toBe(true);
    });

    it('names the SOAUTH2 setting behind unauthorized_client and invalid_scope', () => {
        expect(caught(() => interpretTokenResponse(
            400, JSON.stringify({ error: 'unauthorized_client' }), config())).message)
            .toMatch(/grant types are per client/);
        expect(caught(() => interpretTokenResponse(
            400, JSON.stringify({ error: 'invalid_scope' }), config())).message)
            .toMatch(/SAP_OAUTH_SCOPE/);
    });

    it('treats a 404 as the wrong URL rather than a credential problem', () => {
        expect(caught(() => interpretTokenResponse(404, '<html>Not found</html>', config())).message)
            .toMatch(/not the token endpoint/);
    });

    it('leaves a server having a bad moment retryable', () => {
        // 5xx, 408 and 429 are not configuration, and they cost no logon attempt.
        for (const status of [500, 502, 408, 429]) {
            expect((caught(() => interpretTokenResponse(status, '{}', config())) as OAuthError).permanent)
                .toBe(false);
        }
    });

    it('says what to check when the body is not JSON at all', () => {
        // Usually SAP_OAUTH_TOKEN_URL pointing at an ICF logon page.
        expect(caught(() => interpretTokenResponse(200, '<html>logon</html>', config())).message)
            .toMatch(/not JSON/);
    });

    it('does not return an empty token when the endpoint returned no access_token', () => {
        expect(caught(() => interpretTokenResponse(200, JSON.stringify({ id_token: 'ey' }), config())).message)
            .toMatch(/without an access_token/);
    });
});

describe('interpretOAuthResponse', () => {
    const ok = {
        'set-cookie': ['SAP_SESSIONID_DEV_100=abc; path=/', 'sap-usercontext=sap-client=100; path=/'],
        'x-csrf-token': 'token-value'
    };

    it('harvests the cookies and the token', () => {
        const session = interpretOAuthResponse(200, ok);
        expect(session.csrfToken).toBe('token-value');
        expect([...session.cookies.keys()].sort()).toEqual(['SAP_SESSIONID_DEV_100', 'sap-usercontext']);
    });

    it('does not latch a token SAP refused, because a new one costs nothing', () => {
        // The mirror image of the token-endpoint case: no SAP user record is
        // touched by this, so retrying is free — and the fix (a scope, a user in
        // this client) is usually applied while the server is running.
        const error = caught(() => interpretOAuthResponse(401, {}));

        expect(error).toBeInstanceOf(OAuthTokenRejected);
        expect((error as OAuthError).permanent).toBe(false);
        expect(error.message).toMatch(/not the client secret/);
    });

    it('separates 403 from 401: the token worked, the authorisation did not', () => {
        const error = caught(() => interpretOAuthResponse(403, {}));
        expect((error as OAuthError).permanent).toBe(true);
        expect(error.message).toMatch(/S_DEVELOP/);
    });

    it('rejects a 200 that carried no session, rather than returning an empty one', () => {
        expect(() => interpretOAuthResponse(200, {})).toThrow(/anonymously/);
        expect(() => interpretOAuthResponse(200, { 'x-csrf-token': 't' })).toThrow();
    });
});

describe('createTokenProvider', () => {
    const agent = new https.Agent();

    it('hands back a static token without contacting anything', async () => {
        const provider = createTokenProvider(config({ grant: 'static', staticToken: 'ey.static' }), agent);
        const token = await provider.get();

        expect(token.value).toBe('ey.static');
        // Never 'cached': there is nothing to refresh, so a caller that retries
        // on a 401 would send the identical token a second time for nothing.
        expect(token.cached).toBe(false);
    });

    it('describes the token without ever including it', async () => {
        const provider = createTokenProvider(
            config({ grant: 'static', staticToken: 'ey.static', scope: 'ADT' }), agent);
        const described = JSON.stringify(provider.describe());

        expect(described).not.toContain('ey.static');
        expect(described).toContain('ADT');
    });

    it('reports the endpoint without any query string it may carry', () => {
        const provider = createTokenProvider(
            config({ tokenUrl: 'https://auth.example.com/oauth/token?x=1' }), agent);
        expect(provider.describe().tokenEndpoint).toBe('https://auth.example.com/oauth/token');
    });
});

/**
 * The second attempt, which exists for one case: a cached token that SAP has
 * stopped accepting — revoked, or expired against a clock that disagrees with
 * this one by more than the skew allows. It must not happen for a token that was
 * already fresh, where the same request would produce the same token and the
 * same 401 for as long as anyone kept asking.
 */
describe('shouldRetryWithFreshToken', () => {
    const rejected = new OAuthTokenRejected('SAP refused the OAuth 2.0 access token (HTTP 401)');

    it('mints a new token when the one SAP refused came from the cache', () => {
        expect(shouldRetryWithFreshToken(rejected, { cached: true })).toBe(true);
    });

    it('gives up when the refused token was already fresh', () => {
        expect(shouldRetryWithFreshToken(rejected, { cached: false })).toBe(false);
    });

    it('does not retry anything but a refused token', () => {
        // A 403 is an authorisation, a timeout is the network, and a refused
        // token *request* is a credential. A new token changes none of them.
        expect(shouldRetryWithFreshToken(new OAuthError('403'), { cached: true })).toBe(false);
        expect(shouldRetryWithFreshToken(new Error('ETIMEDOUT'), { cached: true })).toBe(false);
        expect(shouldRetryWithFreshToken(new OAuthTokenRejected('static', true), { cached: true }))
            .toBe(false);
    });
});

describe('bootstrapOAuthSession', () => {
    const session = (baseUrl: string) => ({
        baseUrl,
        agent: new https.Agent(),
        tokens: createTokenProvider(config({ grant: 'static', staticToken: 'ey.static' }), new https.Agent())
    });

    it('refuses a plain-http SAP_URL, where the token would cross the network in clear', async () => {
        await expect(bootstrapOAuthSession(session('http://sap.example.com:8000')))
            .rejects.toThrow(/credential in the\s+clear/);
    });

    it('reports an unusable SAP_URL as the configuration error it is', async () => {
        await expect(bootstrapOAuthSession(session('not-a-url')))
            .rejects.toThrow(/not a valid URL/);
    });
});

/**
 * The whole flow, over a real socket.
 *
 * Everything above is a status code and a JSON body, which is where the
 * decisions are — but not where a mode like this usually breaks. It breaks on
 * the wire: a form body sent as JSON, a client secret in the wrong place, a
 * bearer header spelled differently from what the server wants. None of that is
 * visible to a unit test, and all of it is visible to a server that answers.
 *
 * One HTTPS server plays both parts, because they are two hosts in production
 * and the code has to treat them as such: the token endpoint mints tokens, and
 * SAP accepts them until one is revoked. Its CA is only ever handed in through
 * SAP_CA_FILE, so this also proves that bundle is *added* to Node's roots rather
 * than replacing them — a merge that, if wrong, would fail here and nowhere else.
 */
const OPENSSL = (() => {
    try {
        execFileSync('openssl', ['version'], { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
})();

(OPENSSL ? describe : describe.skip)('against a live token endpoint and a live SAP', () => {
    let dir: string;
    let server: https.Server;
    let baseUrl: string;

    /** What each side saw, so the assertions are about the wire and not about our own call. */
    let tokenRequests: Array<{ authorization?: string; body: URLSearchParams }>;
    let sapRequests: Array<{ authorization?: string; url: string }>;
    /** Tokens SAP has stopped accepting, which is what makes the second attempt observable. */
    let revoked: Set<string>;
    let minted: number;

    const file = (name: string) => path.join(dir, name);

    beforeAll(done => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-'));
        const openssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });

        openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt',
            '-days', '2', '-subj', '/CN=Test CA');
        fs.writeFileSync(file('server.ext'), 'subjectAltName=DNS:localhost,IP:127.0.0.1\n');
        openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr',
            '-subj', '/CN=localhost');
        openssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-out', 'server.crt',
            '-days', '2', '-extfile', 'server.ext');

        server = https.createServer(
            { key: fs.readFileSync(file('server.key')), cert: fs.readFileSync(file('server.crt')) },
            (req, res) => {
                const authorization = req.headers.authorization;

                if (req.url === '/oauth/token') {
                    let raw = '';
                    req.on('data', chunk => { raw += chunk; });
                    req.on('end', () => {
                        tokenRequests.push({ authorization, body: new URLSearchParams(raw) });
                        res.setHeader('content-type', 'application/json');
                        res.end(JSON.stringify({
                            access_token: `ey.${++minted}`,
                            token_type: 'bearer',
                            expires_in: 3600
                        }));
                    });
                    return;
                }

                sapRequests.push({ authorization, url: req.url ?? '' });
                const token = String(authorization ?? '').replace(/^Bearer /, '');
                if (!authorization || revoked.has(token)) {
                    res.statusCode = 401;
                    res.end('');
                    return;
                }

                res.setHeader('set-cookie', [
                    'SAP_SESSIONID_DEV_100=live; path=/; HttpOnly',
                    'sap-usercontext=sap-client=100; path=/'
                ]);
                res.setHeader('x-csrf-token', 'CSRF-FROM-SERVER');
                res.end('{}');
            }
        );

        server.listen(0, '127.0.0.1', () => {
            baseUrl = `https://localhost:${(server.address() as AddressInfo).port}`;
            done();
        });
    }, 60_000);

    afterAll(done => {
        server.close(() => {
            fs.rmSync(dir, { recursive: true, force: true });
            done();
        });
    });

    beforeEach(() => {
        tokenRequests = [];
        sapRequests = [];
        revoked = new Set();
        minted = 0;
    });

    /** A configuration pointed at the local server, trusting it only through SAP_CA_FILE. */
    const live = (over: Partial<OAuthConfig> = {}) => {
        const cfg = config({
            tokenUrl: `${baseUrl}/oauth/token`,
            caFile: file('ca.crt'),
            ...over
        });
        const agent = createOAuthAgent(cfg);
        return { cfg, agent, tokens: createTokenProvider(cfg, agent) };
    };

    it('mints a token, presents it as a bearer, and comes back with a session', async () => {
        const { agent, tokens } = live();

        const session = await bootstrapOAuthSession({
            baseUrl, client: '100', language: 'EN', agent, tokens
        });

        // The token endpoint got a form body and the client in a Basic header.
        expect(tokenRequests).toHaveLength(1);
        expect(tokenRequests[0].body.get('grant_type')).toBe('client_credentials');
        expect(tokenRequests[0].authorization)
            .toBe(`Basic ${Buffer.from('sb-abap-agent!t1234:shhh').toString('base64')}`);

        // SAP got the token that endpoint issued, and the client and language.
        expect(sapRequests[0].authorization).toBe('Bearer ey.1');
        expect(sapRequests[0].url).toContain('sap-client=100');
        expect(sapRequests[0].url).toContain('sap-language=EN');

        expect(session.csrfToken).toBe('CSRF-FROM-SERVER');
        expect([...session.cookies.keys()]).toEqual(['SAP_SESSIONID_DEV_100', 'sap-usercontext']);

        agent.destroy();
    });

    it('reuses the token across sessions, so a re-established session costs no logon', async () => {
        // The session is what expires every 30 minutes, not the token. Minting a
        // new one each time would multiply the traffic to the authorisation
        // server by the number of times SAP times out.
        const { agent, tokens } = live();

        await bootstrapOAuthSession({ baseUrl, agent, tokens });
        await bootstrapOAuthSession({ baseUrl, agent, tokens });

        expect(tokenRequests).toHaveLength(1);
        expect(sapRequests.map(r => r.authorization)).toEqual(['Bearer ey.1', 'Bearer ey.1']);

        agent.destroy();
    });

    it('mints a new token once when SAP has stopped accepting the cached one', async () => {
        const { agent, tokens } = live();

        await bootstrapOAuthSession({ baseUrl, agent, tokens });
        revoked.add('ey.1');
        const session = await bootstrapOAuthSession({ baseUrl, agent, tokens });

        expect(tokenRequests).toHaveLength(2);
        expect(sapRequests.map(r => r.authorization))
            .toEqual(['Bearer ey.1', 'Bearer ey.1', 'Bearer ey.2']);
        expect(session.csrfToken).toBe('CSRF-FROM-SERVER');

        agent.destroy();
    });

    it('gives up rather than looping when the fresh token is refused too', async () => {
        // Which is the point of counting `cached`: without it a system that
        // refuses every token would be asked for one on a loop.
        const { agent, tokens } = live();
        revoked.add('ey.1');

        await expect(bootstrapOAuthSession({ baseUrl, agent, tokens }))
            .rejects.toBeInstanceOf(OAuthTokenRejected);

        expect(tokenRequests).toHaveLength(1);
        expect(sapRequests).toHaveLength(1);

        agent.destroy();
    });

    it('puts the client in the form body when asked to, and nothing in the header', async () => {
        const { agent, tokens } = live({ clientAuth: 'post', scope: 'ZADT' });

        await bootstrapOAuthSession({ baseUrl, agent, tokens });

        expect(tokenRequests[0].authorization).toBeUndefined();
        expect(tokenRequests[0].body.get('client_id')).toBe('sb-abap-agent!t1234');
        expect(tokenRequests[0].body.get('client_secret')).toBe('shhh');
        expect(tokenRequests[0].body.get('scope')).toBe('ZADT');

        agent.destroy();
    });

    it('sends the refresh token, and the rotated one on the next request', async () => {
        // A server that rotates refresh tokens invalidates the one just used.
        // Reusing the original is how the *second* refresh fails, hours later.
        const { agent, tokens } = live({ grant: 'refresh_token', refreshToken: 'r0' });

        await bootstrapOAuthSession({ baseUrl, agent, tokens });
        tokens.forget();
        await bootstrapOAuthSession({ baseUrl, agent, tokens });

        expect(tokenRequests.map(r => r.body.get('grant_type')))
            .toEqual(['refresh_token', 'refresh_token']);
        expect(tokenRequests[0].body.get('refresh_token')).toBe('r0');

        agent.destroy();
    });

    it('trusts the token endpoint through SAP_CA_FILE without losing the public roots', async () => {
        // The merge in createOAuthAgent. A bundle that replaced Node's roots
        // would verify this server and fail against a BTP token endpoint signed
        // by a public CA, which is the common deployment.
        const agent = createOAuthAgent(config({ caFile: file('ca.crt') }));
        expect((agent.options.ca as string[]).length).toBeGreaterThan(1);
        agent.destroy();
    });
});

/** Jest's toThrow cannot inspect the error, and every assertion here is about it. */
function caught(run: () => unknown): Error {
    try {
        run();
    } catch (error) {
        return error as Error;
    }
    throw new Error('expected a rejection, and got none');
}
