import type https from 'https';
import { bootstrapSsoSession } from './sso.js';
import type { SsoSession } from './sso.js';
import {
  bootstrapCertificateSession,
  createCertificateAgent,
  readCertificateConfig,
  resolveAuthMode
} from './certauth.js';
import type { AuthMode, CertificateInfo } from './certauth.js';
import {
  basicAuthHeader,
  bootstrapPasswordSession,
  createPasswordAgent,
  readPasswordConfig
} from './passwordauth.js';
import {
  bearerAuthHeader,
  bootstrapOAuthSession,
  createOAuthAgent,
  createTokenProvider,
  readOAuthConfig
} from './oauth.js';
import type { OAuthSessionInfo } from './oauth.js';
import { agentProbeTransport, curlProbeTransport } from './reachability.js';
import type { ProbeTransport } from './reachability.js';

/**
 * Where a SAP session comes from.
 *
 * Four ways in, and the seam is what keeps the choice between them out of
 * everything else: SPNEGO/Kerberos for a domain user (./sso.ts), an X.509 client
 * certificate for a service or technical user that has no Kerberos identity
 * (./certauth.ts), an OAuth 2.0 bearer token for a system that issues them
 * (./oauth.ts), and a user and password for a system that offers none of the
 * above (./passwordauth.ts).
 *
 * The choice used to live in index.ts, which branched on the mode inside the
 * method that establishes a session and re-read `process.env` on every call.
 * That left the environment leaking across the seam and made the one piece of
 * behaviour that matters most — re-establishing a session after SAP drops it on
 * its own 30 minute timeout — impossible to exercise without a live system and a
 * ticket.
 *
 * The production adapters justify the seam. `fixedSessionSource` is what makes
 * it pay: the retry can be tested.
 */
export interface EstablishedSession extends SsoSession {
  /** Present in certificate mode, once a session exists. Carries daysUntilExpiry. */
  certificate?: CertificateInfo;
  /**
   * Present in OAuth mode. Describes the token this session was established
   * with — which is all there is to describe, since the token is not sent again
   * after the bootstrap. Never carries the token itself.
   */
  oauth?: OAuthSessionInfo;
  /**
   * The node this session was logged on to, when it was not the ADT one. Set
   * only by the fallback below, and carried so healthcheck can say the ADT tools
   * are not going to work rather than leaving that to be discovered per call.
   */
  viaFallback?: string;
}

/**
 * Where the fallback logs on when the ADT node refuses.
 *
 * The ADT bootstrap is the right place to get a session, because succeeding
 * there proves the thing most tools need. But a technical user with RFC
 * authorisations and no `S_DEVELOP` is refused by ADT while `/sap/gw/jsonrpc`
 * would serve it perfectly — and that route still needs a CSRF token, which
 * only a logged-on ICF node hands out. The OData catalog service is the node
 * such a user reliably reaches, so it is where the token comes from when ADT
 * will not give one.
 *
 * This is off unless `ABAP_MCP_RFC_FALLBACK` is set. A server that quietly
 * half-works is worse than one that fails loudly — the failure is a diagnosis,
 * and turning ADT's 403 into "some tools error at call time" hides it. Someone
 * has to decide that a partial server is what they want.
 */
const FALLBACK_BOOTSTRAP_PATH = '/sap/opu/odata/IWFND/CATALOGSERVICE;v=2/';

export interface SessionSource {
  /** Which logon this server uses. Reported by healthcheck and at startup. */
  readonly mode: AuthMode;
  /**
   * Set in certificate mode only. The ADT client needs the same agent, not just
   * the logon: with `icm/HTTPS/verify_client = 2` every handshake wants the
   * certificate, so this has to be available before the ADTClient is built.
   */
  readonly httpsAgent?: https.Agent;
  /** Logs on and returns the session. Safe to call repeatedly. */
  establish(): Promise<EstablishedSession>;
  /**
   * A bare HTTP GET carrying the same credential `establish()` uses, for the
   * reachability probe in ./reachability.ts.
   *
   * It belongs here because this is the only place that knows *how* this server
   * talks to SAP — curl with a Kerberos ticket, or an agent holding a client
   * certificate. A probe that went out any other way would prove nothing about
   * the logon that failed.
   *
   * Absent on a session source that has no transport of its own, which is how a
   * test says "do not probe" and healthcheck knows not to claim it checked.
   */
  readonly probe?: ProbeTransport;
}

/** What a session source needs from the environment, read once. */
interface SessionEnvironment {
  baseUrl: string;
  client: string;
  language: string;
  insecureTls: boolean;
  /** The node to fall back to, or undefined when the fallback is off. */
  fallbackPath?: string;
}

function readEnvironment(env: NodeJS.ProcessEnv): SessionEnvironment {
  const wantsFallback = /^(1|true|yes|on)$/i.test(String(env.ABAP_MCP_RFC_FALLBACK ?? '').trim());

  return {
    baseUrl: env.SAP_URL as string,
    client: env.SAP_CLIENT as string,
    language: env.SAP_LANGUAGE as string,
    insecureTls: env.NODE_TLS_REJECT_UNAUTHORIZED === '0',
    fallbackPath: wantsFallback
      ? String(env.SAP_FALLBACK_BOOTSTRAP_PATH ?? '').trim() || FALLBACK_BOOTSTRAP_PATH
      : undefined
  };
}

/**
 * The ADT bootstrap, and a second node to try when it refuses.
 *
 * Both logon modes reduce to "GET a path, keep the cookies and the CSRF token",
 * and both bootstraps already take the path as a parameter — so the fallback is
 * the same function against a different node, and works in either mode.
 *
 * When the fallback also fails, the *original* error is thrown. The ADT failure
 * is the diagnosis worth reporting; that a second node refused a credential ADT
 * had already refused adds nothing, and replacing the message would send whoever
 * reads it to the wrong ICF node.
 */
async function establishWithFallback(
  config: SessionEnvironment,
  bootstrap: (bootstrapPath?: string) => Promise<EstablishedSession>
): Promise<EstablishedSession> {
  try {
    return await bootstrap();
  } catch (adtFailure) {
    if (!config.fallbackPath) throw adtFailure;

    let session: EstablishedSession;
    try {
      session = await bootstrap(config.fallbackPath);
    } catch {
      throw adtFailure;
    }

    return { ...session, viaFallback: config.fallbackPath };
  }
}

/** SPNEGO/Kerberos, via curl --negotiate. */
function kerberosSessionSource(config: SessionEnvironment): SessionSource {
  return {
    mode: 'kerberos',
    establish: () => establishWithFallback(config, bootstrapPath => bootstrapSsoSession({
      baseUrl: config.baseUrl,
      client: config.client,
      language: config.language,
      insecureTls: config.insecureTls,
      bootstrapPath
    })),
    probe: curlProbeTransport({ insecureTls: config.insecureTls })
  };
}

/** X.509 client certificate, for a user with no Kerberos identity. */
function certificateSessionSource(
  config: SessionEnvironment,
  env: NodeJS.ProcessEnv
): SessionSource {
  const agent = createCertificateAgent(readCertificateConfig(env));

  return {
    mode: 'certificate',
    httpsAgent: agent,
    establish: () => establishWithFallback(config, bootstrapPath => bootstrapCertificateSession({
      baseUrl: config.baseUrl,
      client: config.client,
      language: config.language,
      agent,
      bootstrapPath
    })),
    // The same agent, so the probe presents the same certificate the session
    // does — which is what makes a 401 from the probe mean anything.
    probe: agentProbeTransport(agent)
  };
}

/**
 * User and password over HTTP Basic, for systems that offer neither of the
 * other two. See ./passwordauth.ts for why this is the last resort rather than
 * the obvious first one.
 */
function passwordSessionSource(
  config: SessionEnvironment,
  env: NodeJS.ProcessEnv
): SessionSource {
  const credentials = readPasswordConfig(env);
  const agent = createPasswordAgent(credentials);

  return {
    mode: 'password',
    // Handed to ADTClient like the certificate agent is, so SAP_CA_FILE and
    // NODE_TLS_REJECT_UNAUTHORIZED apply to every request rather than only the
    // logon — otherwise an internal CA works for the logon and fails after it.
    httpsAgent: agent,
    establish: () => establishWithFallback(config, bootstrapPath => bootstrapPasswordSession({
      baseUrl: config.baseUrl,
      client: config.client,
      language: config.language,
      user: credentials.user,
      password: credentials.password,
      agent,
      bootstrapPath
    })),
    probe: agentProbeTransport(agent, {
      authorization: basicAuthHeader(credentials.user, credentials.password)
    })
  };
}

/**
 * OAuth 2.0, for a system that issues bearer tokens — a BTP ABAP environment, or
 * an on-premise system published through SOAUTH2. See ./oauth.ts.
 */
function oauthSessionSource(
  config: SessionEnvironment,
  env: NodeJS.ProcessEnv
): SessionSource {
  const credentials = readOAuthConfig(env);
  const agent = createOAuthAgent(credentials);
  // One provider, shared by the logon and the probe: a token minted for the
  // probe is the token the logon then uses, rather than a second one obtained
  // for the same client seconds apart.
  const tokens = createTokenProvider(credentials, agent);

  return {
    mode: 'oauth',
    // Handed to ADTClient for the same reason password mode does it — SAP_CA_FILE
    // and NODE_TLS_REJECT_UNAUTHORIZED have to apply to every request, not only
    // to the logon.
    httpsAgent: agent,
    establish: async () => {
      const session = await establishWithFallback(config, bootstrapPath => bootstrapOAuthSession({
        baseUrl: config.baseUrl,
        client: config.client,
        language: config.language,
        agent,
        tokens,
        bootstrapPath
      }));

      return { ...session, oauth: tokens.describe() };
    },
    // The token is resolved per probe rather than captured once, so a probe run
    // an hour after startup carries a live credential instead of reporting
    // `logon` for a system that is working.
    probe: agentProbeTransport(agent, async () => ({
      authorization: bearerAuthHeader((await tokens.get()).value)
    }))
  };
}

/**
 * Picks the logon mode and reads everything it needs from the environment, once.
 *
 * Throws here rather than at first use: a certificate file that does not exist
 * is a startup problem, and finding out about it on the first tool call is how
 * a misconfiguration reads as a transient failure.
 */
export function createSessionSource(env: NodeJS.ProcessEnv = process.env): SessionSource {
  const config = readEnvironment(env);

  switch (resolveAuthMode(env)) {
    case 'certificate': return certificateSessionSource(config, env);
    case 'oauth': return oauthSessionSource(config, env);
    case 'password': return passwordSessionSource(config, env);
    default: return kerberosSessionSource(config);
  }
}

/**
 * The session source of a server that never logs on: the container-level
 * process in Streamable HTTP mode.
 *
 * There, every MCP session builds its own source from the token its own client
 * presented, and the process in front of them has no credential of its own. It
 * used to get one anyway, because the constructor reads the environment
 * unconditionally — harmless while an HTTP deployment set no `SAP_OAUTH_*` at
 * all, and a startup crash the moment one did, since a container configured
 * with a token endpoint and a client id so that *sessions* can refresh looks
 * exactly like a misconfigured `client_credentials` logon from here.
 *
 * No `probe`: healthcheck reports `checked: false` rather than claiming to have
 * verified a credential that does not exist.
 */
export function perConnectionSessionSource(): SessionSource {
  return {
    mode: 'oauth',
    establish: async () => {
      throw new Error(
        'This server is running ABAP_MCP_TRANSPORT=http, where each MCP session logs on with its ' +
          'own SAP OAuth token and the container itself holds no credential. Nothing should be ' +
          'establishing a session at this level.',
      );
    },
  };
}

/**
 * A session source that hands back what it was given.
 *
 * The third adapter, and the reason the seam earns its place: it is what lets a
 * test drive the session-expiry retry, which is otherwise reachable only by
 * waiting half an hour for a real SAP system to drop a real session.
 */
export function fixedSessionSource(
  session: EstablishedSession,
  options: { mode?: AuthMode; onEstablish?: () => void; probe?: ProbeTransport } = {}
): SessionSource {
  return {
    mode: options.mode ?? 'kerberos',
    establish: async () => {
      options.onEstablish?.();
      return session;
    },
    // Left undefined unless a test asks for one: healthcheck reports `checked:
    // false` rather than inventing a verdict, and no test reaches the network.
    probe: options.probe
  };
}
