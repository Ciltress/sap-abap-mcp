import type { ADTClient } from 'abap-adt-api';
import { AbapAdtServer } from '../server';
import { fixedSessionSource } from '../session';
import type { EstablishedSession } from '../session';

/**
 * The Streamable HTTP transport (ABAP_MCP_TRANSPORT=http): the bearer-token
 * gate, per-connection session isolation, and the session-id routing that
 * decides whether a request creates a session, reuses one, or is rejected.
 *
 * `createSessionServer` is overridden here for exactly the reason
 * `ServerDependencies` exists on AbapAdtServer itself: so this can be tested
 * without a real SAP system, and without a real OAuth token endpoint. Each
 * simulated "connection" gets a server backed by fixedSessionSource, keyed by
 * the bearer token it presented, so the test can tell two sessions apart.
 */

const SESSION: EstablishedSession = {
  cookies: new Map([['SAP_SESSIONID_DEV_100', 'SAP_SESSIONID_DEV_100=abc']]),
  csrfToken: 'token',
};

const BASE_ENV: NodeJS.ProcessEnv = {
  SAP_URL: 'https://sap.example.com:44301',
  SAP_USER: 'TESTUSER',
  SAP_CLIENT: '100',
  SAP_LANGUAGE: 'EN',
  ABAP_MCP_GATE: 'off',
  ABAP_MCP_TRANSPORT: 'http',
  ABAP_MCP_HTTP_PORT: '0',
  ABAP_MCP_HTTP_HOST: '127.0.0.1',
};

/** A stand-in ADTClient, just enough for tools/list to answer. */
function makeAdtClient(): ADTClient {
  const state = {
    loggedin: false,
    csrfToken: 'fetch',
    cookie: new Map<string, string>(),
  };
  return new Proxy({} as any, {
    get(_target, property: string) {
      switch (property) {
        case 'httpClient':
          return state;
        case 'loggedin':
          return state.loggedin;
        case 'isStateful':
          return true;
        case 'baseUrl':
          return BASE_ENV.SAP_URL;
        case 'client':
          return '100';
        case 'username':
          return 'TESTUSER';
        case 'stateful':
          return 'stateful';
        case 'then':
        case 'catch':
        case 'finally':
          return undefined;
        case 'adtDiscovery':
          return async () => [];
      }
      return async () => ({});
    },
    set(_target, property: string, value: any) {
      (state as any)[property] = value;
      return true;
    },
  }) as ADTClient;
}

/**
 * Rejects any credential that is not exactly 'good-token' / 'good-refresh' — a
 * stand-in for SAP refusing a bad one. The env each session is built with is
 * kept, because for the refresh path that env *is* the behaviour under test:
 * which grant the transport picked, and what it handed the OAuth layer.
 */
class TestableServer extends AbapAdtServer {
  readonly sessionEnvs: NodeJS.ProcessEnv[] = [];

  startHttp() {
    return (this as any).runHttp() as Promise<{
      port: number;
      close(): Promise<void>;
    }>;
  }

  protected createSessionServer(env: NodeJS.ProcessEnv): AbapAdtServer {
    this.sessionEnvs.push(env);
    const accepted =
      String(env.SAP_OAUTH_TOKEN ?? '') === 'good-token' ||
      String(env.SAP_OAUTH_REFRESH_TOKEN ?? '') === 'good-refresh';
    if (!accepted) {
      return new AbapAdtServer({
        env,
        adtClient: makeAdtClient(),
        sessionSource: {
          mode: 'oauth',
          establish: async () => {
            throw new Error('SAP rejected this token');
          },
        },
      });
    }
    return new AbapAdtServer({
      env,
      adtClient: makeAdtClient(),
      sessionSource: fixedSessionSource(SESSION, { mode: 'oauth' }),
    });
  }
}

async function startServer(extraEnv: NodeJS.ProcessEnv = {}) {
  const server = new TestableServer({ env: { ...BASE_ENV, ...extraEnv } });
  const { port, close } = await server.startHttp();
  return { url: `http://127.0.0.1:${port}/mcp`, close, server };
}

/** The env the transport built the most recent session with. */
const lastSessionEnv = (server: TestableServer): NodeJS.ProcessEnv =>
  server.sessionEnvs[server.sessionEnvs.length - 1];

const initializeMessage = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
};

const headers = (token?: string) => ({
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

describe('Streamable HTTP transport', () => {
  let close: () => Promise<void>;

  afterEach(async () => {
    await close?.();
  });

  it('rejects a request with no Authorization header', async () => {
    const server = await startServer();
    close = server.close;

    const response = await fetch(server.url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toMatch(/Authorization/);
  });

  it('rejects a token SAP refuses', async () => {
    const server = await startServer();
    close = server.close;

    const response = await fetch(server.url, {
      method: 'POST',
      headers: headers('bad-token'),
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.message).toMatch(/rejected this session's token/);
  });

  it('establishes a session per bearer token and serves tools/list on it', async () => {
    const server = await startServer();
    close = server.close;

    const initResponse = await fetch(server.url, {
      method: 'POST',
      headers: headers('good-token'),
      body: JSON.stringify(initializeMessage),
    });

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const toolsResponse = await fetch(server.url, {
      method: 'POST',
      headers: {
        ...headers('good-token'),
        'mcp-session-id': sessionId as string,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(toolsResponse.status).toBe(200);
  });

  it('rejects an unknown Mcp-Session-Id', async () => {
    const server = await startServer();
    close = server.close;

    const response = await fetch(server.url, {
      method: 'POST',
      headers: { ...headers(), 'mcp-session-id': 'not-a-real-session' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    expect(response.status).toBe(404);
  });

  it('404s anything outside /mcp', async () => {
    const server = await startServer();
    close = server.close;

    const response = await fetch(server.url.replace('/mcp', '/other'), {
      method: 'GET',
    });
    expect(response.status).toBe(404);
  });
});

/**
 * The origin allow-list is the one guard in this transport a reverse proxy
 * cannot supply, because a rebinding attempt never passes through the proxy:
 * the browser resolves the attacker's name to wherever this is listening and
 * posts straight to it. So it is checked here, and these cover both answers.
 */
describe('Streamable HTTP origin allow-list', () => {
  let close: () => Promise<void>;

  afterEach(async () => {
    await close?.();
  });

  it('rejects a browser origin when none are allowed', async () => {
    const server = await startServer();
    close = server.close;

    const response = await fetch(server.url, {
      method: 'POST',
      headers: { ...headers('good-token'), Origin: 'https://evil.example.com' },
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    const body = await response.json();
    expect(body.error.message).toMatch(/Origin .* is not allowed/);
  });

  it('rejects an origin outside the allow-list', async () => {
    const server = await startServer({
      ABAP_MCP_HTTP_ALLOWED_ORIGINS: 'https://ide.example.com',
    });
    close = server.close;

    const response = await fetch(server.url, {
      method: 'POST',
      headers: { ...headers('good-token'), Origin: 'https://evil.example.com' },
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(403);
  });

  it('serves an allow-listed origin and echoes it back with CORS headers', async () => {
    const server = await startServer({
      ABAP_MCP_HTTP_ALLOWED_ORIGINS:
        'https://ide.example.com, https://other.example.com',
    });
    close = server.close;

    const response = await fetch(server.url, {
      method: 'POST',
      headers: { ...headers('good-token'), Origin: 'https://ide.example.com' },
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(200);
    // Echoed rather than '*': a browser refuses '*' on a credentialed request.
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://ide.example.com',
    );
    expect(response.headers.get('access-control-expose-headers')).toMatch(
      /Mcp-Session-Id/i,
    );
    expect(response.headers.get('vary')).toMatch(/Origin/i);
  });

  it('allows every origin when * is allow-listed', async () => {
    const server = await startServer({ ABAP_MCP_HTTP_ALLOWED_ORIGINS: '*' });
    close = server.close;

    const response = await fetch(server.url, {
      method: 'POST',
      headers: {
        ...headers('good-token'),
        Origin: 'https://anything.example.com',
      },
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://anything.example.com',
    );
  });

  it('leaves a request with no Origin alone — every non-browser MCP client', async () => {
    const server = await startServer();
    close = server.close;

    const response = await fetch(server.url, {
      method: 'POST',
      headers: headers('good-token'),
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers a preflight from an allow-listed origin', async () => {
    const server = await startServer({
      ABAP_MCP_HTTP_ALLOWED_ORIGINS: 'https://ide.example.com',
    });
    close = server.close;

    const response = await fetch(server.url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://ide.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toMatch(/POST/);
    expect(response.headers.get('access-control-allow-headers')).toMatch(
      /Authorization/i,
    );
    expect(response.headers.get('access-control-allow-headers')).toMatch(
      /Mcp-Session-Id/i,
    );
  });

  it('refuses a preflight from an origin that is not allowed', async () => {
    const server = await startServer({
      ABAP_MCP_HTTP_ALLOWED_ORIGINS: 'https://ide.example.com',
    });
    close = server.close;

    const response = await fetch(server.url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-methods')).toBeNull();
  });

  it('rejects a Host outside the allow-list', async () => {
    const server = await startServer({
      ABAP_MCP_HTTP_ALLOWED_HOSTS: 'mcp.example.com',
    });
    close = server.close;

    // `Host` is a forbidden header for fetch, so this arrives as the loopback
    // address the test connected to — which is exactly the case that matters:
    // a name that is not the one the operator published.
    const response = await fetch(server.url, {
      method: 'POST',
      headers: headers('good-token'),
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toMatch(
      /Host .* is not allowed/,
    );
  });

  it('accepts an allow-listed Host whatever port it came in on', async () => {
    const server = await startServer({
      ABAP_MCP_HTTP_ALLOWED_HOSTS: 'mcp.example.com, 127.0.0.1',
    });
    close = server.close;

    // The listening port is ephemeral here, so matching at all proves the
    // allow-list compares the name with the port stripped.
    const response = await fetch(server.url, {
      method: 'POST',
      headers: headers('good-token'),
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(200);
  });
});

describe('Streamable HTTP rate limit', () => {
  let close: () => Promise<void>;

  afterEach(async () => {
    await close?.();
  });

  it('is off unless ABAP_MCP_HTTP_RATE_LIMIT sets one', async () => {
    const server = await startServer();
    close = server.close;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(server.url, {
        method: 'POST',
        headers: headers('bad-token'),
        body: JSON.stringify(initializeMessage),
      });
      expect(response.status).toBe(401);
    }
  });

  it('429s the caller past its budget, with a Retry-After', async () => {
    const server = await startServer({ ABAP_MCP_HTTP_RATE_LIMIT: '2' });
    close = server.close;

    const send = () =>
      fetch(server.url, {
        method: 'POST',
        headers: headers('bad-token'),
        body: JSON.stringify(initializeMessage),
      });

    expect((await send()).status).toBe(401);
    expect((await send()).status).toBe(401);

    const limited = await send();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await limited.json()).error.message).toMatch(/Rate limit exceeded/);
  });

  it('counts each caller separately', async () => {
    const server = await startServer({ ABAP_MCP_HTTP_RATE_LIMIT: '2' });
    close = server.close;

    const send = (token: string) =>
      fetch(server.url, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(initializeMessage),
      });

    expect((await send('one')).status).toBe(401);
    expect((await send('one')).status).toBe(401);
    expect((await send('one')).status).toBe(429);
    // A second caller's budget is untouched by the first exhausting theirs.
    expect((await send('two')).status).toBe(401);
  });
});

/**
 * A session built from a refresh token rather than an access token: still that
 * caller's own SAP identity, but able to renew itself instead of dying with its
 * first token. What is asserted is the env the transport hands the OAuth layer,
 * for the same reason the bearer tests assert on behaviour at this seam — there
 * is no token endpoint here, and oauth.ts has its own tests for redeeming one.
 */
describe('Streamable HTTP token refresh', () => {
  let close: () => Promise<void>;

  const OAUTH_CLIENT: NodeJS.ProcessEnv = {
    SAP_OAUTH_TOKEN_URL: 'https://sap.example.com:44301/sap/bc/sec/oauth2/token',
    SAP_OAUTH_CLIENT_ID: 'MCP_CLIENT',
  };

  /** No Authorization: the refresh token is the whole credential here. */
  const refreshHeaders = (refresh: string) => ({
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'X-SAP-Refresh-Token': refresh,
  });

  afterEach(async () => {
    await close?.();
  });

  it('builds a refresh_token session from X-SAP-Refresh-Token alone', async () => {
    const started = await startServer(OAUTH_CLIENT);
    close = started.close;

    const response = await fetch(started.url, {
      method: 'POST',
      headers: refreshHeaders('good-refresh'),
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('mcp-session-id')).toBeTruthy();

    const env = lastSessionEnv(started.server);
    expect(env.SAP_OAUTH_GRANT).toBe('refresh_token');
    expect(env.SAP_OAUTH_REFRESH_TOKEN).toBe('good-refresh');
    // A static token would pin the session to one access token, so it must not
    // survive into an env whose whole point is renewing it.
    expect(env.SAP_OAUTH_TOKEN).toBeUndefined();
  });

  it('prefers the refresh token when both credentials are sent', async () => {
    const started = await startServer(OAUTH_CLIENT);
    close = started.close;

    const response = await fetch(started.url, {
      method: 'POST',
      headers: {
        ...headers('good-token'),
        'X-SAP-Refresh-Token': 'good-refresh',
      },
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(200);
    expect(lastSessionEnv(started.server).SAP_OAUTH_GRANT).toBe(
      'refresh_token',
    );
  });

  it('still builds a static session from a bearer token alone', async () => {
    const started = await startServer(OAUTH_CLIENT);
    close = started.close;

    const response = await fetch(started.url, {
      method: 'POST',
      headers: headers('good-token'),
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(200);
    const env = lastSessionEnv(started.server);
    expect(env.SAP_OAUTH_GRANT).toBe('static');
    expect(env.SAP_OAUTH_TOKEN).toBe('good-token');
  });

  it('rejects a refresh token when the container has no OAuth client to redeem it', async () => {
    const started = await startServer();
    close = started.close;

    const response = await fetch(started.url, {
      method: 'POST',
      headers: refreshHeaders('good-refresh'),
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/SAP_OAUTH_TOKEN_URL/);
    expect(started.server.sessionEnvs).toHaveLength(0);
  });

  it('reports a refused refresh token as such', async () => {
    const started = await startServer(OAUTH_CLIENT);
    close = started.close;

    const response = await fetch(started.url, {
      method: 'POST',
      headers: refreshHeaders('expired-refresh'),
      body: JSON.stringify(initializeMessage),
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error.message).toMatch(
      /refresh token was refused/,
    );
  });
});
