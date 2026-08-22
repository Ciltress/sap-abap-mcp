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

/** Rejects any token that is not exactly 'good-token' — a stand-in for SAP refusing a bad one. */
class TestableServer extends AbapAdtServer {
  startHttp() {
    return (this as any).runHttp() as Promise<{
      port: number;
      close(): Promise<void>;
    }>;
  }

  protected createSessionServer(env: NodeJS.ProcessEnv): AbapAdtServer {
    const token = String(env.SAP_OAUTH_TOKEN ?? '');
    if (token !== 'good-token') {
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

async function startServer() {
  const server = new TestableServer({ env: BASE_ENV });
  const { port, close } = await server.startHttp();
  return { url: `http://127.0.0.1:${port}/mcp`, close };
}

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
