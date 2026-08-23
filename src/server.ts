import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  isInitializeRequest,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { GUIDES, guideByUri, guideUri, readGuideFile } from './lib/guides.js';
import {
  describeSystem,
  resolveSystemIdentity,
  serverInstructions,
} from './lib/systemIdentity.js';
import type { SystemIdentity } from './lib/systemIdentity.js';
import {
  discoverSkills,
  readSkillFile,
  skillByUri,
  skillUri,
} from './lib/skills.js';
import { applyProfile, resolveProfile } from './lib/profiles.js';
import { capToolResult, resolveResponseBudget } from './lib/responseBudget.js';
import { evaluateGate, gatingEnabled } from './lib/collectionGate.js';
import type { GateResult } from './lib/collectionGate.js';
import type { ProfileName } from './lib/profiles.js';
import {
  ADTClient,
  session_types,
  isAdtError,
  isAdtException,
  isCsrfError,
  isLoginError,
} from 'abap-adt-api';
import { injectSsoSession } from './sso.js';
import { createSessionSource, perConnectionSessionSource } from './session.js';
import type { SessionSource } from './session.js';
import { probeReachability } from './reachability.js';
import type { ReachabilityReport } from './reachability.js';
import type { CertificateInfo } from './certauth.js';
import type { OAuthSessionInfo } from './oauth.js';
import type { ToolDefinition } from './types/tools.js';
import type { BaseHandler } from './handlers/BaseHandler.js';
import { AuthHandlers } from './handlers/AuthHandlers.js';
import { TransportHandlers } from './handlers/TransportHandlers.js';
import { ObjectHandlers } from './handlers/ObjectHandlers.js';
import { ClassHandlers } from './handlers/ClassHandlers.js';
import { CodeAnalysisHandlers } from './handlers/CodeAnalysisHandlers.js';
import { ObjectLockHandlers } from './handlers/ObjectLockHandlers.js';
import { ObjectSourceHandlers } from './handlers/ObjectSourceHandlers.js';
import { ObjectDeletionHandlers } from './handlers/ObjectDeletionHandlers.js';
import { ObjectManagementHandlers } from './handlers/ObjectManagementHandlers.js';
import { ObjectRegistrationHandlers } from './handlers/ObjectRegistrationHandlers.js';
import { NodeHandlers } from './handlers/NodeHandlers.js';
import { DiscoveryHandlers } from './handlers/DiscoveryHandlers.js';
import { UnitTestHandlers } from './handlers/UnitTestHandlers.js';
import { PrettyPrinterHandlers } from './handlers/PrettyPrinterHandlers.js';
import { GitHandlers } from './handlers/GitHandlers.js';
import { DdicHandlers } from './handlers/DdicHandlers.js';
import { ServiceBindingHandlers } from './handlers/ServiceBindingHandlers.js';
import { QueryHandlers } from './handlers/QueryHandlers.js';
import { FeedHandlers } from './handlers/FeedHandlers.js';
import { DebugHandlers } from './handlers/DebugHandlers.js';
import { RenameHandlers } from './handlers/RenameHandlers.js';
import { AtcHandlers } from './handlers/AtcHandlers.js';
import { TraceHandlers } from './handlers/TraceHandlers.js';
import { RefactorHandlers } from './handlers/RefactorHandlers.js';
import { RevisionHandlers } from './handlers/RevisionHandlers.js';
import { JsonRemoteFunctionCallHandlers } from './handlers/JsonRemoteFunctionCallHandlers.js';
import { DocsHandlers } from './handlers/DocsHandlers.js';
import { SkillsHandlers } from './handlers/SkillsHandlers.js';
import { BasisHandlers } from './handlers/BasisHandlers.js';

/**
 * How long to wait for the ADT discovery document before giving up on gating.
 * Short on purpose: this runs inside tools/list, which a client blocks on at
 * connect, and an ungated list is a perfectly good answer.
 */
const GATE_TIMEOUT_MS = 8_000;

/**
 * Per ping. The two run in parallel, so this is very nearly the cost of the whole
 * probe — and healthcheck is something a client waits on.
 */
const PING_TIMEOUT_MS = 5_000;

/**
 * Longer at startup, where nothing is waiting and the answer decides whether the
 * operator spends the next hour on their Kerberos ticket or on transaction SICF.
 */
const STARTUP_PING_TIMEOUT_MS = 8_000;

/** A body this large on /mcp is not a tool call; refusing it early is cheaper than parsing it. */
const MAX_HTTP_BODY_BYTES = 10 * 1024 * 1024;

/** `stdio` (the default, and everything this server has ever done) or `http`. */
function resolveTransportMode(env: NodeJS.ProcessEnv): 'stdio' | 'http' {
  const mode = String(env.ABAP_MCP_TRANSPORT ?? '')
    .trim()
    .toLowerCase();
  return mode === 'http' ? 'http' : 'stdio';
}

/**
 * The caller's own SAP OAuth access token — this server's only credential for
 * an HTTP session, and the only thing that makes one team member's session
 * distinct from another's. See runHttp().
 */
function extractBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization;
  const match =
    typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  return match?.[1];
}

/** Reads and JSON-parses the body of an HTTP request, capped against an unbounded body. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_HTTP_BODY_BYTES) {
        req.destroy();
        reject(new Error(`request body exceeds ${MAX_HTTP_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/** A JSON-RPC error response on the raw HTTP layer — before any transport/session exists. */
function writeJsonRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }),
  );
}

/**
 * The caller's own SAP OAuth refresh token, when they want the session to renew
 * itself rather than die with its first access token. Optional, and only usable
 * when the deployment configured a token endpoint to redeem it against — see
 * `startSession` in runHttp().
 */
function extractRefreshToken(req: IncomingMessage): string | undefined {
  const header = req.headers['x-sap-refresh-token'];
  const value = Array.isArray(header) ? header[0] : header;
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || undefined;
}

/** A comma- or whitespace-separated environment list, emptied of blanks. */
function parseHttpList(value: string | undefined): string[] {
  return String(value ?? '')
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Scheme, host and port, lower-cased, so two spellings of one origin compare equal. */
function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin.toLowerCase();
  } catch {
    return origin.trim().toLowerCase();
  }
}

/** The headers a browser client has to be allowed to send, and to read back. */
const CORS_REQUEST_HEADERS =
  'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, X-SAP-Refresh-Token';
const CORS_EXPOSED_HEADERS = 'Mcp-Session-Id';

interface OriginPolicy {
  /** `*` was allow-listed: every origin passes, and CORS headers are echoed back. */
  any: boolean;
  list: Set<string>;
}

/**
 * Which browser origins may talk to `/mcp` — the DNS-rebinding guard the MCP
 * spec asks a Streamable HTTP server to apply for itself.
 *
 * The reverse proxy the rest of this transport defers to cannot do this one. A
 * page on any origin can make the browser resolve a name it controls to
 * `127.0.0.1` and post to whatever is listening there, so binding to loopback
 * is not an access control, and the proxy is not in that request's path at all.
 * What the attacking page cannot forge is the `Origin` header the browser
 * attaches, so that is what is checked.
 *
 * Requests carrying no `Origin` pass: those are not browser requests, which is
 * every MCP client that is not a web page. `initialize` is a JSON POST, which
 * no browser can send without a preflight, so a real browser always announces
 * itself here.
 */
function resolveOriginPolicy(env: NodeJS.ProcessEnv): OriginPolicy {
  const entries = parseHttpList(env.ABAP_MCP_HTTP_ALLOWED_ORIGINS);
  return {
    any: entries.includes('*'),
    list: new Set(
      entries.filter((entry) => entry !== '*').map(normalizeOrigin),
    ),
  };
}

function originAllowed(origin: string, policy: OriginPolicy): boolean {
  return policy.any || policy.list.has(normalizeOrigin(origin));
}

/**
 * Defence in depth behind the origin check: a `Host` allow-list, for the
 * rebinding case where the attacker's name — not the operator's — is what
 * resolved to this container. Unset means any Host, which is what a deployment
 * behind a proxy that already rewrites Host wants.
 */
function hostAllowed(req: IncomingMessage, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const host = String(req.headers.host ?? '').toLowerCase();
  const withoutPort = host.replace(/:\d+$/, '');
  return allowed.some((entry) => {
    const candidate = entry.toLowerCase();
    return candidate === host || candidate === withoutPort;
  });
}

interface RateLimiter {
  /** Spends one request's worth of budget, or says how long to wait for it. */
  take(key: string): { ok: true } | { ok: false; retryAfter: number };
}

/**
 * A per-session request ceiling, off unless `ABAP_MCP_HTTP_RATE_LIMIT` sets one.
 *
 * This is not the proxy's rate limit and does not replace it. A proxy sees
 * addresses; the thing worth limiting here is one *session* — one agent that
 * has gone into a loop and is putting a work process per request into a shared
 * SAP system, which looks exactly like healthy traffic from the front and takes
 * the system down for everyone else. A token bucket rather than a fixed window,
 * so a burst of legitimate reads inside one turn is not punished for arriving
 * together.
 */
function createRateLimiter(env: NodeJS.ProcessEnv): RateLimiter | undefined {
  const limit = Number(env.ABAP_MCP_HTTP_RATE_LIMIT ?? 0);
  if (!Number.isFinite(limit) || limit <= 0) return undefined;

  const windowMs = 60_000;
  const refillPerMs = limit / windowMs;
  const buckets = new Map<string, { tokens: number; updated: number }>();

  return {
    take(key: string) {
      const now = Date.now();
      // Sessions come and go; buckets belonging to ones long gone are swept
      // rather than tracked, so nothing has to be told a session ended.
      if (buckets.size > 1024) {
        for (const [id, bucket] of buckets) {
          if (now - bucket.updated > windowMs * 2) buckets.delete(id);
        }
      }
      const bucket = buckets.get(key) ?? { tokens: limit, updated: now };
      bucket.tokens = Math.min(
        limit,
        bucket.tokens + (now - bucket.updated) * refillPerMs,
      );
      bucket.updated = now;
      buckets.set(key, bucket);

      if (bucket.tokens < 1) {
        const waitMs = (1 - bucket.tokens) / refillPerMs;
        return { ok: false, retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) };
      }
      bucket.tokens -= 1;
      return { ok: true };
    },
  };
}

/**
 * What the rate limit counts. The session once there is one; before that the
 * credential the caller presented, hashed because this is a map key that ends
 * up in memory and a bearer token is not something to keep a copy of. The peer
 * address is the last resort, for a request that has neither.
 */
function rateLimitKey(req: IncomingMessage): string {
  const sessionId = req.headers['mcp-session-id'];
  if (typeof sessionId === 'string' && sessionId) return `session:${sessionId}`;
  const credential = extractBearerToken(req) ?? extractRefreshToken(req);
  if (credential) {
    return `token:${createHash('sha256').update(credential).digest('hex').slice(0, 32)}`;
  }
  return `peer:${req.socket.remoteAddress ?? 'unknown'}`;
}

/**
 * Tool names that were renamed, kept callable so existing clients keep working.
 * Aliases are routable but deliberately not listed by tools/list.
 */
const TOOL_ALIASES: Record<string, string> = {
  // Empty: adtCompatibilityGraph, the only tool that had ever been renamed, was
  // removed. An alias whose target no longer exists routes nowhere, so it goes
  // with it. Aliases are routable but deliberately not listed by tools/list.
};

/**
 * What the server needs from outside itself.
 *
 * All optional, and all defaulted to the real thing, so the production entry
 * point stays `new AbapAdtServer()`. They exist because the behaviour that
 * matters most here is recovery — the retry after SAP drops a session on its own
 * 30 minute timeout, and a collection gate that must never fail closed — and
 * neither could be exercised while the only way to build this class was to
 * connect to a real system.
 */
export interface ServerDependencies {
  /** Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to the mode the environment selects. See ./session.ts. */
  sessionSource?: SessionSource;
  /** Defaults to a real ADTClient built from the environment. */
  adtClient?: ADTClient;
}

export class AbapAdtServer extends Server {
  private adtClient: ADTClient;
  private authHandlers: AuthHandlers;
  private transportHandlers: TransportHandlers;
  private objectHandlers: ObjectHandlers;
  private classHandlers: ClassHandlers;
  private codeAnalysisHandlers: CodeAnalysisHandlers;
  private objectLockHandlers: ObjectLockHandlers;
  private objectSourceHandlers: ObjectSourceHandlers;
  private objectDeletionHandlers: ObjectDeletionHandlers;
  private objectManagementHandlers: ObjectManagementHandlers;
  private objectRegistrationHandlers: ObjectRegistrationHandlers;
  private nodeHandlers: NodeHandlers;
  private discoveryHandlers: DiscoveryHandlers;
  private unitTestHandlers: UnitTestHandlers;
  private prettyPrinterHandlers: PrettyPrinterHandlers;
  private gitHandlers: GitHandlers;
  private ddicHandlers: DdicHandlers;
  private serviceBindingHandlers: ServiceBindingHandlers;
  private queryHandlers: QueryHandlers;
  private feedHandlers: FeedHandlers;
  private debugHandlers: DebugHandlers;
  private renameHandlers: RenameHandlers;
  private atcHandlers: AtcHandlers;
  private traceHandlers: TraceHandlers;
  private refactorHandlers: RefactorHandlers;
  private revisionHandlers: RevisionHandlers;
  private jsonRemoteFunctionCallHandlers: JsonRemoteFunctionCallHandlers;
  private docsHandlers: DocsHandlers;
  private skillsHandlers: SkillsHandlers;
  private basisHandlers: BasisHandlers;

  /** Where a session comes from: Kerberos, an X.509 certificate, an OAuth 2.0 token, or a password. */
  private readonly sessionSource: SessionSource;
  /** The identity presented, once a certificate session has been established. */
  private certificate?: CertificateInfo;
  /** The token a session was established with, in OAuth mode. Never the token itself. */
  private oauth?: OAuthSessionInfo;
  /**
   * Set when the session came from the fallback node rather than ADT, i.e. SAP
   * refused this user ADT but serves it elsewhere. The RFC/JSON-RPC tools work;
   * everything routed through ADT will fail at call time.
   */
  private sessionViaFallback?: string;
  /**
   * Latched once SAP has rejected the credential itself, rather than aged a
   * session out. Nothing tries again.
   *
   * This exists for password mode, and for the two OAuth failures that reach a
   * SAP user record — a rejected client secret and a rejected password grant.
   * The retry below treats 401 as "the session went stale" and re-establishes,
   * which is right for a ticket that expired and ruinous for a password that
   * has: every tool call would spend one more failed logon against
   * login/fails_to_user_lock until the user is locked for everything that uses
   * it. Failing the same way every time, without touching SAP, is the only
   * safe answer.
   */
  private permanentAuthFailure?: Error;
  /** Which SAP system and client this server is bound to. Refined once a session exists. */
  private systemIdentity: SystemIdentity;

  /** Every handler, in tools/list order. */
  private handlers: BaseHandler[] = [];
  /** tool name (and alias) -> owning handler. Built from getTools(), so a listed tool is always callable. */
  private readonly toolRoutes = new Map<string, BaseHandler>();
  /** tool name -> its definition, for the facts that travel with a tool rather than in a registry. */
  private readonly toolDefinitions = new Map<string, ToolDefinition>();
  /** Which tools this server lists and routes. Resolved once, at startup. */
  private readonly profile: ProfileName;
  /** Ceiling on one answer, in bytes. 0 means none. Follows the profile. */
  private readonly responseBudget: number;
  /** The profile's tools, in tools/list order. Computed once — getTools() is static. */
  private listedTools: ToolDefinition[] = [];
  /** Tools this system cannot serve, and why. Empty until the gate has run. */
  private gate: GateResult = { unavailable: new Map(), missing: [] };
  /** The environment this server was built from. Injectable, so a test need not mutate process.env. */
  private readonly env: NodeJS.ProcessEnv;
  /** In flight or settled; the gate is evaluated at most once per process. */
  private gatePromise?: Promise<void>;

  constructor(dependencies: ServerDependencies = {}) {
    const env = dependencies.env ?? process.env;

    // Which system this server speaks for. Announced through `instructions`,
    // which is the only thing a client sees before it calls anything — and
    // therefore the only way it can pick between several of these servers when
    // a request names a system by id.
    const declared = resolveSystemIdentity(env);
    // Resolved before super() so a bad ABAP_MCP_PROFILE fails at startup, loudly,
    // rather than after a session has been established.
    const profile = resolveProfile(env);
    const responseBudget = resolveResponseBudget(profile, env);

    super(
      {
        name: 'mcp-abap-abap-adt-api',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
          // The server's own documentation, served from docs/ and AGENTS.md.
          resources: {},
        },
        instructions: serverInstructions(declared, env.SAP_URL),
      },
    );

    this.systemIdentity = declared;
    this.profile = profile;
    this.responseBudget = responseBudget;
    this.env = env;

    const missingVars = ['SAP_URL', 'SAP_USER'].filter((v) => !env[v]);
    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}`,
      );
    }

    // Four ways in — Kerberos, a client certificate, an OAuth 2.0 token, a
    // password. Which one, and everything it needs from the environment, is
    // decided once here rather than re-read on every logon — see ./session.ts.
    // The agent it may carry goes on the ADT client too, not just the logon:
    // with icm/HTTPS/verify_client = 2 every handshake needs the certificate.
    //
    // Except in HTTP mode, where the choice describes nothing: the sessions do
    // the logging on, each from its own client's token, and this process holds
    // no credential. Reading one out of the environment here would make a
    // container that configures SAP_OAUTH_* so its *sessions* can refresh fail
    // at startup as a half-configured client_credentials logon.
    this.sessionSource =
      dependencies.sessionSource ??
      (resolveTransportMode(env) === 'http'
        ? perConnectionSessionSource()
        : createSessionSource(env));

    // The placeholder only satisfies ADTClient's non-empty-password constructor
    // check — it is never sent in the two password-less modes, because the session
    // cookies and CSRF token are injected before any real request is made. That
    // matters most for a technical user: a Basic Auth attempt with this value would
    // count as a failed logon and could lock the account.
    //
    // Password mode is the exception, and gets the real password rather than the
    // placeholder for exactly that reason: the session is injected there too, but
    // if AdtHTTP ever did run a logon of its own, the placeholder would guarantee
    // it failed. Handing it the working credential removes the path entirely.
    this.adtClient =
      dependencies.adtClient ??
      new ADTClient(
        env.SAP_URL as string,
        env.SAP_USER as string,
        this.sessionSource.mode === 'password'
          ? String(env.SAP_PASSWORD ?? '')
          : 'unused-sso-placeholder',
        env.SAP_CLIENT as string,
        env.SAP_LANGUAGE as string,
        this.sessionSource.httpsAgent
          ? { httpsAgent: this.sessionSource.httpsAgent }
          : undefined,
      );
    this.adtClient.stateful = session_types.stateful;

    // Initialize handlers
    this.authHandlers = new AuthHandlers(this.adtClient);
    this.transportHandlers = new TransportHandlers(this.adtClient);
    this.objectHandlers = new ObjectHandlers(this.adtClient);
    this.classHandlers = new ClassHandlers(this.adtClient);
    this.codeAnalysisHandlers = new CodeAnalysisHandlers(this.adtClient);
    this.objectLockHandlers = new ObjectLockHandlers(this.adtClient);
    this.objectSourceHandlers = new ObjectSourceHandlers(this.adtClient);
    this.objectDeletionHandlers = new ObjectDeletionHandlers(this.adtClient);
    this.objectManagementHandlers = new ObjectManagementHandlers(
      this.adtClient,
    );
    this.objectRegistrationHandlers = new ObjectRegistrationHandlers(
      this.adtClient,
    );
    this.nodeHandlers = new NodeHandlers(this.adtClient);
    this.discoveryHandlers = new DiscoveryHandlers(this.adtClient);
    this.unitTestHandlers = new UnitTestHandlers(this.adtClient);
    this.prettyPrinterHandlers = new PrettyPrinterHandlers(this.adtClient);
    this.gitHandlers = new GitHandlers(this.adtClient);
    // describeAbapTable reads the dictionary over JSON-RPC, because ADT has no
    // resource for a database table on 7.50. The arrow defers the lookup, so the
    // construction order of the two handlers does not matter.
    this.ddicHandlers = new DdicHandlers(
      this.adtClient,
      (name, input, output) =>
        this.jsonRemoteFunctionCallHandlers.callFunctionViaJsonRpc(
          name,
          input,
          output,
        ),
    );
    // Also RFC-backed: neither the task handler nor the profile parameters are
    // part of ADT. The batch arrow is what lets checkLogonConfiguration read
    // twenty parameters in one round trip.
    this.basisHandlers = new BasisHandlers(
      this.adtClient,
      (name, input, output) =>
        this.jsonRemoteFunctionCallHandlers.callFunctionViaJsonRpc(
          name,
          input,
          output,
        ),
      (calls) =>
        this.jsonRemoteFunctionCallHandlers.callFunctionsViaJsonRpc(calls),
    );
    this.serviceBindingHandlers = new ServiceBindingHandlers(this.adtClient);
    this.queryHandlers = new QueryHandlers(this.adtClient);
    this.feedHandlers = new FeedHandlers(this.adtClient);
    this.debugHandlers = new DebugHandlers(this.adtClient);
    this.renameHandlers = new RenameHandlers(this.adtClient);
    this.atcHandlers = new AtcHandlers(this.adtClient);
    this.traceHandlers = new TraceHandlers(this.adtClient);
    this.refactorHandlers = new RefactorHandlers(this.adtClient);
    this.revisionHandlers = new RevisionHandlers(this.adtClient);
    // Needs the SSO bootstrap: it talks to /sap/gw/jsonrpc directly over the
    // Kerberos session rather than through an abap-adt-api wrapper.
    this.jsonRemoteFunctionCallHandlers = new JsonRemoteFunctionCallHandlers(
      this.adtClient,
      () => this.ensureSsoSession(),
    );

    // Serve this server's own documentation and the bundled skills. Neither
    // needs a SAP session.
    this.docsHandlers = new DocsHandlers(this.adtClient);
    this.skillsHandlers = new SkillsHandlers(this.adtClient);

    this.handlers = [
      this.docsHandlers,
      this.skillsHandlers,
      this.authHandlers,
      this.transportHandlers,
      this.objectHandlers,
      this.classHandlers,
      this.codeAnalysisHandlers,
      this.objectLockHandlers,
      this.objectSourceHandlers,
      this.objectDeletionHandlers,
      this.objectManagementHandlers,
      this.objectRegistrationHandlers,
      this.nodeHandlers,
      this.discoveryHandlers,
      this.unitTestHandlers,
      this.prettyPrinterHandlers,
      this.gitHandlers,
      this.ddicHandlers,
      this.serviceBindingHandlers,
      this.queryHandlers,
      this.feedHandlers,
      this.debugHandlers,
      this.renameHandlers,
      this.atcHandlers,
      this.traceHandlers,
      this.refactorHandlers,
      this.revisionHandlers,
      this.basisHandlers,
      this.jsonRemoteFunctionCallHandlers,
    ];

    this.buildToolRoutes();
    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  /**
   * Derives the router from getTools(), so a tool can never be listed without
   * being callable — which is what the hand-maintained switch used to allow.
   */
  /**
   * Evaluates the collection gate once, and never lets it break anything.
   *
   * Discovery needs a session, so this is the first thing that touches SAP. Every
   * failure path — no ticket, system down, a release that publishes no discovery
   * document, a slow one — ends with an empty gate and a full tool list. Hiding a
   * tool that would have worked is a worse outcome than offering one that fails,
   * because the first is invisible.
   */
  private async ensureGate(): Promise<void> {
    if (this.gatePromise) return this.gatePromise;

    this.gatePromise = (async () => {
      if (!gatingEnabled(this.env)) return;
      try {
        if (!this.adtClient.loggedin) await this.ensureSsoSession();

        const discovery = await Promise.race([
          this.adtClient.adtDiscovery(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('discovery timed out')),
              GATE_TIMEOUT_MS,
            ).unref(),
          ),
        ]);

        // The catalogue rather than the profile's slice: a tool withheld by the
        // profile is not listed anyway, and gating the whole set keeps the
        // healthcheck's `withheldForSystem` honest about the system.
        this.gate = evaluateGate(
          discovery,
          this.handlers.flatMap((h) => h.getTools()),
        );
        if (this.gate.missing.length) {
          console.error(
            `[MCP] this system does not expose: ${this.gate.missing.join(', ')} — ` +
              `${this.gate.unavailable.size} tool(s) withheld`,
          );
        }
      } catch (error: any) {
        // Deliberately swallowed. See the note above.
        console.error(
          `[MCP] could not read the ADT discovery document (${error?.message ?? error}); ` +
            `offering every tool in the profile`,
        );
      }
    })();

    return this.gatePromise;
  }

  private buildToolRoutes(): void {
    // The profile decides what is listed *and* what is routed. Filtering only
    // tools/list would leave every tool callable by a client that guessed a
    // name, which would make `analyst` a suggestion rather than a boundary.
    const offered = this.handlers.flatMap((handler) => handler.getTools());
    for (const tool of offered) {
      if (!this.toolDefinitions.has(tool.name))
        this.toolDefinitions.set(tool.name, tool);
    }
    this.listedTools = applyProfile(this.profile, offered);
    const listed = new Set(this.listedTools.map((tool) => tool.name));

    for (const handler of this.handlers) {
      for (const tool of handler.getTools()) {
        if (!listed.has(tool.name)) continue;

        const existing = this.toolRoutes.get(tool.name);
        if (existing) {
          console.error(
            `[MCP] duplicate tool '${tool.name}': ${handler.constructor.name} ignored, ` +
              `${existing.constructor.name} keeps it`,
          );
          continue;
        }
        this.toolRoutes.set(tool.name, handler);
      }
    }

    for (const [alias, target] of Object.entries(TOOL_ALIASES)) {
      const handler = this.toolRoutes.get(target);
      if (handler && !this.toolRoutes.has(alias))
        this.toolRoutes.set(alias, handler);
    }
  }

  /**
   * Establishes (or re-establishes) the ADT session via SPNEGO/Kerberos SSO,
   * bypassing Basic Auth. Safe to call repeatedly — used both for the eager
   * bootstrap at startup and as self-healing before tool calls once the
   * underlying SAP session/CSRF token has gone stale (e.g. after Kerberos
   * ticket expiry on a long-idle process).
   */
  private async ensureSsoSession(): Promise<void> {
    // Re-thrown without contacting SAP: see the field's comment.
    if (this.permanentAuthFailure) throw this.permanentAuthFailure;

    let session;
    try {
      session = await this.sessionSource.establish();
    } catch (error) {
      if ((error as { permanent?: boolean })?.permanent)
        this.permanentAuthFailure = error as Error;
      throw error;
    }

    // Only certificate mode sets this; keeping it here is what lets healthcheck
    // report daysUntilExpiry on a three-year certificate that expires quietly.
    if (session.certificate) this.certificate = session.certificate;
    // The OAuth equivalent, and refreshed on every establish for the same
    // reason: it describes the credential this session was actually built with.
    if (session.oauth) this.oauth = session.oauth;
    this.sessionViaFallback = session.viaFallback;
    injectSsoSession(this.adtClient, session);
    this.identifySystem(session.cookies.keys());
  }

  /**
   * Reads the real system and client out of the SAP_SESSIONID_<SID>_<CLIENT>
   * cookie and checks them against what was configured.
   *
   * A mismatch is not fatal — the tools go on working, on the system SAP put us
   * on — but it means anything routing by the configured name is sending work
   * here that was meant for somewhere else, so it is said loudly and kept in
   * healthcheck rather than only logged once at startup.
   */
  private identifySystem(cookieNames: Iterable<string>): void {
    const previous = this.systemIdentity.mismatch;
    this.systemIdentity = resolveSystemIdentity(this.env, cookieNames);

    if (
      this.systemIdentity.mismatch &&
      this.systemIdentity.mismatch !== previous
    ) {
      console.error(
        `[MCP] WARNING: wrong system configured. ${this.systemIdentity.mismatch}`,
      );
    }
  }

  /**
   * Errors that mean "SAP refused this before running it", so the call can be
   * retried once on a fresh session without any risk of applying it twice.
   */
  private isSessionExpired(error: unknown): boolean {
    if (isCsrfError(error)) return true;
    if (isAdtException(error) && isLoginError(error)) return true;
    if (isAdtError(error) && (error.err === 401 || error.err === 403))
      return true;
    // Some paths surface it only as a message on a plain Error.
    return /csrf token validation failed|401 unauthorized/i.test(
      String((error as any)?.message ?? ''),
    );
  }

  /** True for anything already shaped like an MCP tool result. */
  private isToolResult(result: any): boolean {
    return (
      !!result && typeof result === 'object' && Array.isArray(result.content)
    );
  }

  /**
   * Handlers already return `{content:[{type:'text',text:'<json>'}]}`. Passing
   * that through instead of stringifying it again is what stops every response
   * from arriving as a JSON string nested inside a JSON string.
   */
  /**
   * The single funnel every answer passes through — which is why the response
   * budget is enforced here rather than in each handler. A tool added tomorrow is
   * covered without being told about it.
   */
  private serializeResult(
    result: any,
    toolName = 'unknown',
    handler?: BaseHandler,
  ) {
    try {
      const envelope = this.isToolResult(result)
        ? result
        : {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, (key, value) =>
                  typeof value === 'bigint' ? value.toString() : value,
                ),
              },
            ],
          };

      // The tool's own narrowing advice travels with its definition, so a rename
      // cannot leave the hint behind and hand a model a generic sentence at the
      // moment it needed the specific move.
      const capped = capToolResult(
        toolName,
        envelope,
        this.responseBudget,
        this.toolDefinitions.get(toolName)?.narrowingHint,
      );
      handler?.trackResponseBytes(capped.bytes, capped.truncated);

      if (capped.truncated) {
        console.error(
          `[MCP] ${toolName} answered ${capped.bytes} bytes, over the ${this.responseBudget} byte ` +
            `budget for profile '${this.profile}' — withheld`,
        );
      }
      return capped.result;
    } catch (error) {
      return this.handleError(
        new McpError(ErrorCode.InternalError, 'Failed to serialize result'),
      );
    }
  }

  private handleError(error: unknown) {
    if (!(error instanceof Error)) {
      error = new Error(String(error));
    }
    if (error instanceof McpError) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error.message,
              code: error.code,
            }),
          },
        ],
        isError: true,
      };
    }
    // Not an McpError: keep the message instead of replacing it with a generic
    // one, and log the stack for the operator.
    const err = error as Error;
    console.error('[MCP Error]', err);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: err.message || 'Internal server error',
            code: ErrorCode.InternalError,
          }),
        },
      ],
      isError: true,
    };
  }

  /** The healthcheck tool is defined here rather than in a handler: it must work without SAP. */
  private healthcheckTool(): ToolDefinition {
    return {
      name: 'healthcheck',
      description:
        'Which SAP system and client this server is bound to, plus liveness, the ADT session state ' +
        'and per-handler call metrics. Call it to find out whether this is the right server for a ' +
        'request that names a system, e.g. "DEV client 200" — a server cannot switch system or ' +
        'client at runtime. It also pings SAP at two layers (/sap/public/ping, which needs no logon, ' +
        'and /sap/bc/ping, which does) and reports under `reachability` which layer answered: a ' +
        'network or TLS failure, an ICF node that is not served, a logon SAP refused, or all of it ' +
        'working. It still never establishes an ADT session, so it answers when everything else ' +
        'fails. Also reports the active tool profile, the response budget, and anything withheld ' +
        'because this system does not expose it.',
      inputSchema: { type: 'object', properties: {} },
    };
  }

  /**
   * Pings SAP at both layers, and never lets the answer be an exception.
   *
   * A healthcheck that throws when SAP is unreachable reports nothing at the one
   * moment it is worth calling, so every failure — including a probe that cannot
   * run at all — comes back as data. `checked: false` is deliberate: a session
   * source with no transport of its own (a test) has no verdict to give, and
   * saying so beats implying the system is fine.
   */
  private async checkReachability(
    timeoutMs = PING_TIMEOUT_MS,
  ): Promise<{ checked: false } | ({ checked: true } & ReachabilityReport)> {
    const transport = this.sessionSource.probe;
    if (!transport) return { checked: false };

    try {
      const report = await probeReachability({
        baseUrl: String(this.env.SAP_URL ?? ''),
        client: this.env.SAP_CLIENT,
        language: this.env.SAP_LANGUAGE,
        authMode: this.sessionSource.mode,
        transport,
        timeoutMs,
      });
      return { checked: true, ...report };
    } catch (error) {
      return {
        checked: true,
        ok: false,
        layer: 'unknown',
        summary: `The reachability probe itself failed: ${(error as Error).message}`,
        endpoints: [],
      };
    }
  }

  /**
   * Says which identity the session was established with. stderr only — stdout
   * is the MCP frame stream, and anything else on it corrupts the protocol.
   */
  private logIdentity(): void {
    const on = ` on ${describeSystem(this.systemIdentity)}`;

    // Said before the identity line, because it changes what the next line means:
    // authenticated, yes, but not for the tools most of this server is made of.
    if (this.sessionViaFallback) {
      console.error(
        `[MCP] WARNING: SAP refused this user the ADT node and the session came from ` +
          `${this.sessionViaFallback} instead. The RFC/JSON-RPC tools work; every ADT tool ` +
          `will fail at call time. Grant S_DEVELOP to fix it properly — see docs/Authentication.md.`,
      );
    }

    if (this.sessionSource.mode === 'password') {
      console.error(
        `[MCP] authenticated with a password as ${this.adtClient.username}${on}. A wrong or expired ` +
          `password locks this user for everything that uses it — Kerberos (SAP_AUTH_MODE=kerberos) ` +
          `or a certificate (SAP_CERT_FILE) cannot.`,
      );
      return;
    }

    if (this.sessionSource.mode === 'oauth') {
      const token = this.oauth;
      // The remaining lifetime is said here rather than in healthcheck because
      // this is the moment it is true. After the bootstrap the token is not sent
      // again — the session cookie carries every later request — so a token that
      // expires in five minutes is not a problem, and a reader who does not know
      // that will assume it is.
      const lifetime = token?.expiresAt
        ? `, valid for another ${Math.max(0, Math.round((Date.parse(token.expiresAt) - Date.now()) / 60000))} min`
        : '';
      console.error(
        `[MCP] authenticated with an OAuth 2.0 access token as ${this.adtClient.username}${on}` +
          (token
            ? ` — ${token.grant} grant${token.tokenEndpoint ? ` from ${token.tokenEndpoint}` : ''}${lifetime}`
            : ''),
      );
      return;
    }

    if (this.sessionSource.mode !== 'certificate') {
      console.error(
        `[MCP] authenticated via Kerberos SSO as ${this.adtClient.username}${on}`,
      );
      return;
    }

    const cert = this.certificate;
    console.error(
      `[MCP] authenticated via client certificate as ${this.adtClient.username}${on}` +
        (cert ? ` — ${cert.subject}, valid to ${cert.validTo}` : ''),
    );

    // Three-year certificates expire quietly, and the failure then looks like an
    // authorisation problem rather than an expiry.
    if (
      typeof cert?.daysUntilExpiry === 'number' &&
      cert.daysUntilExpiry <= 30
    ) {
      console.error(
        `[MCP] WARNING: the client certificate expires in ${cert.daysUntilExpiry} day(s). ` +
          `Renew it before it does — logon will start failing with HTTP 401.`,
      );
    }
  }

  private async healthcheck() {
    const metrics: Record<string, ReturnType<BaseHandler['getMetrics']>> = {};
    for (const handler of this.handlers)
      metrics[handler.constructor.name] = handler.getMetrics();

    const reachability = await this.checkReachability();

    return {
      // 'healthy' used to be unconditional, which made this tool answer "healthy"
      // from a server whose SAP system was refusing every request. It now follows
      // the probe — and stays 'healthy' when there was no probe to follow, since
      // an unchecked system is not a failed one.
      // A session that only exists because ADT refused this user is degraded
      // whatever the probe says: the probe pings /sap/bc/ping, which such a user
      // reaches perfectly well, so on its own it would report 'healthy' for a
      // server that cannot serve most of its tools.
      status:
        (reachability.checked && !reachability.ok) || this.sessionViaFallback
          ? 'degraded'
          : 'healthy',
      timestamp: new Date().toISOString(),
      // Whether SAP answers at all, and which layer stopped the request when it
      // does not. The one part of this tool that is worth calling twice.
      reachability,
      // Which system this server speaks for — the answer to "is this the DEV
      // one?" without a SAP round trip. `observed*` comes from the session
      // cookie, so it is what SAP said rather than what the config claims.
      system: {
        id: this.systemIdentity.systemId,
        client: this.systemIdentity.client,
        declared: this.systemIdentity.declaredSystemId,
        observed: this.systemIdentity.observedSystemId,
        ...(this.systemIdentity.mismatch
          ? { WARNING: this.systemIdentity.mismatch }
          : {}),
      },
      session: {
        loggedin: this.adtClient.loggedin,
        stateful: this.adtClient.isStateful,
        baseUrl: this.adtClient.baseUrl,
        client: this.adtClient.client,
        user: this.adtClient.username,
        authMode: this.sessionSource.mode,
        // Only in certificate mode, and only once a session has been established.
        // Carries daysUntilExpiry, which is the one thing that will silently
        // stop working three years after issue.
        certificate: this.certificate,
        // Only in OAuth mode. `expiresAt` is the token this session was built
        // with, not a countdown to anything breaking: the token is not sent
        // again after the bootstrap, and a new one is minted when the session
        // itself has to be re-established.
        oauth: this.oauth,
        // Present only when ADT refused this user. Named rather than implied, so
        // an agent that reads this knows why an ADT tool is about to fail instead
        // of retrying it as though the session had gone stale.
        ...(this.sessionViaFallback
          ? {
              adtAvailable: false,
              loggedOnVia: this.sessionViaFallback,
              note:
                'SAP refused this user the ADT node, so the session was taken from the ' +
                'fallback node. The RFC/JSON-RPC tools work; ADT tools will fail at call ' +
                'time. Granting S_DEVELOP removes the need for this.',
            }
          : {}),
      },
      tools: {
        profile: this.profile,
        // 0 means no ceiling. Reported because a withheld answer is otherwise
        // indistinguishable from a tool that simply returned little.
        responseBudgetBytes: this.responseBudget,
        // healthcheck is listed but not in toolRoutes; aliases are the other way round.
        listed:
          this.listedTools.filter((t) => !this.gate.unavailable.has(t.name))
            .length + 1,
        // Features this system does not expose, and the tools withheld with them.
        // Empty when the gate has not run or found nothing missing.
        systemMissing: this.gate.missing,
        withheldForSystem: [...this.gate.unavailable.keys()],
        // What the handlers offer in total, so the gap to `listed` shows what the
        // profile is holding back rather than leaving it to be guessed.
        available:
          this.handlers.reduce((n, h) => n + h.getTools().length, 0) + 1,
        aliases: Object.keys(TOOL_ALIASES).filter((alias) =>
          this.toolRoutes.has(alias),
        ).length,
      },
      metrics,
    };
  }

  /**
   * Exposes the guides as MCP resources as well as through readServerGuide.
   * Resources are the idiomatic primitive and let a user attach a document in
   * their client; the tool is what an agent can reach for by itself.
   */
  private setupResourceHandlers() {
    this.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        ...GUIDES.map((guide) => ({
          uri: guideUri(guide.id),
          name: guide.title,
          description: guide.description,
          mimeType: 'text/markdown',
        })),
        // Discovered from skills/ at call time, so a collection added or removed
        // on disk is reflected without a rebuild.
        ...discoverSkills().map((skill) => ({
          uri: skillUri(skill),
          name: `${skill.collection}: ${skill.name}`,
          description: skill.description,
          mimeType: 'text/markdown',
        })),
      ],
    }));

    this.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      const guide = guideByUri(uri);
      if (guide) {
        return {
          contents: [
            { uri, mimeType: 'text/markdown', text: readGuideFile(guide) },
          ],
        };
      }

      const skill = skillByUri(uri);
      if (skill) {
        return {
          contents: [
            { uri, mimeType: 'text/markdown', text: readSkillFile(skill) },
          ],
        };
      }

      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown resource '${uri}'. Guides: ${GUIDES.map((g) => guideUri(g.id)).join(', ')}. ` +
          `Skills are listed by resources/list.`,
      );
    });
  }

  private setupToolHandlers() {
    this.setRequestHandler(ListToolsRequestSchema, async () => {
      // Ask the system what it supports before answering, so a client never sees
      // a tool this release cannot serve. At most one round trip per process, and
      // it can only ever shorten the list — never fail it.
      await this.ensureGate();
      return {
        // healthcheck is outside every profile on purpose: it is how a client finds
        // out which profile is active, so it has to be there in all of them.
        tools: [
          ...this.listedTools.filter(
            (tool) => !this.gate.unavailable.has(tool.name),
          ),
          this.healthcheckTool(),
        ],
      };
    });

    this.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request.params.name;
      try {
        if (name === 'healthcheck')
          return this.serializeResult(await this.healthcheck(), 'healthcheck');

        // Not only in tools/list: a client is free to call a tool it already knows
        // about without listing first, and it would otherwise reach an ungated
        // server. Memoised, so this costs one round trip per process at most.
        await this.ensureGate();

        // A tool the system cannot serve. Saying so beats the 400 the call would
        // otherwise produce, which reads as a transient failure and invites a retry.
        const withheld = this.gate.unavailable.get(name);
        if (withheld) throw new McpError(ErrorCode.InvalidRequest, withheld);

        const handler = this.toolRoutes.get(name);
        if (!handler) {
          // Distinguish "no such tool" from "not in this profile". Without this a
          // model that knows the tool exists gets told it does not, and retries.
          const exists = this.handlers.some((h) =>
            h.getTools().some((t) => t.name === name),
          );
          throw new McpError(
            ErrorCode.MethodNotFound,
            exists
              ? `Tool '${name}' exists but is not in the active profile '${this.profile}'. ` +
                  `Start the server with ABAP_MCP_PROFILE=all to reach it, or use a listed tool.`
              : `Unknown tool: ${name}`,
          );
        }

        // Self-healing, part one: no session at all yet.
        if (!this.adtClient.loggedin) await this.ensureSsoSession();

        try {
          return this.serializeResult(
            await handler.handle(name, request.params.arguments),
            name,
            handler,
          );
        } catch (error) {
          // Part two, and the one that actually bites. `loggedin` is only
          // `csrfToken !== "fetch"`, so it stays true forever once a token has
          // been injected — even after SAP has dropped the session on its own
          // 30 minute timeout. Without this the check above never fires again
          // and every POST fails with "CSRF token validation failed" until the
          // server is restarted.
          //
          // Retrying is safe for exactly these errors: a rejected CSRF token or
          // a 401 means ICF refused the request *before* it reached ABAP, so
          // nothing was applied and nothing can be applied twice.
          if (!this.isSessionExpired(error)) throw error;
          console.error(
            '[MCP] session expired, re-establishing SSO and retrying',
            name,
          );
          await this.ensureSsoSession();
          return this.serializeResult(
            await handler.handle(name, request.params.arguments),
            name,
            handler,
          );
        }
      } catch (error) {
        return this.handleError(error);
      }
    });
  }

  /**
   * Turns a failed logon into the layer that actually refused it.
   *
   * This is the path that matters most, and the one healthcheck cannot cover: the
   * bootstrap runs before the transport is connected, so a failure here exits the
   * process and the client sees a server that died without saying why. What it
   * did say was worse than nothing — a 403 from an inactive ICF node was reported
   * as "no valid Kerberos ticket, check klist, check VPN" on two systems at once.
   *
   * The probe cannot make things worse: whatever it finds is appended to the
   * original error, and if it fails itself, the original is thrown unchanged.
   */
  /**
   * Said only when the system that answered is not the one configured.
   *
   * The probe reads an identity even from a refused logon, which makes this the
   * one moment a server pointed at the wrong system can be caught — but only
   * worth a line when the two disagree. Confirming a match here would put a
   * sentence in front of every startup failure saying nothing.
   */
  private describeWrongSystem(observed?: {
    systemId?: string;
    client?: string;
  }): string[] {
    const declared = this.systemIdentity.declaredSystemId;
    if (!observed?.systemId || !declared) return [];

    const sameSystem = observed.systemId === declared;
    const sameClient =
      !observed.client ||
      !this.systemIdentity.declaredClient ||
      Number(observed.client) === Number(this.systemIdentity.declaredClient);
    if (sameSystem && sameClient) return [];

    return [
      '',
      `SAP identified itself as ${observed.systemId}/${observed.client ?? '?'}, but this server is ` +
        `configured for ${describeSystem(this.systemIdentity)}. It is pointed at the wrong system.`,
    ];
  }

  private async explainStartupFailure(error: unknown): Promise<Error> {
    const original = error instanceof Error ? error : new Error(String(error));

    let report: Awaited<ReturnType<AbapAdtServer['checkReachability']>>;
    try {
      report = await this.checkReachability(STARTUP_PING_TIMEOUT_MS);
    } catch {
      return original;
    }
    if (!report.checked) return original;

    const detail = [
      original.message,
      '',
      `Reachability probe (${report.layer}): ${report.summary}.`,
      ...report.endpoints.map((e) => `  ${e.path} -> ${e.error ?? e.status}`),
      ...(report.advice ? ['', report.advice] : []),
      ...this.describeWrongSystem(report.observed),
    ].join('\n');

    const explained = new Error(detail);
    explained.name = original.name;
    (explained as any).cause = original;
    return explained;
  }

  /**
   * Establishes (or re-establishes) the SAP session and logs the identity SAP
   * confirmed. Public and separate from run() so HTTP hosting can call it once
   * per MCP session — each of which is a distinct AbapAdtServer instance with
   * its own logon — rather than only once at process startup.
   */
  async bootstrapSession(): Promise<void> {
    try {
      await this.ensureSsoSession();
    } catch (error) {
      throw await this.explainStartupFailure(error);
    }
    this.logIdentity();
  }

  async run() {
    if (resolveTransportMode(this.env) === 'http') {
      await this.runHttp();
      return;
    }

    await this.bootstrapSession();

    const transport = new StdioServerTransport();
    await this.connect(transport);
    console.error('MCP ABAP ADT API server running on stdio');

    // Handle shutdown
    process.on('SIGINT', async () => {
      await this.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.close();
      process.exit(0);
    });

    // Handle errors
    this.onerror = (error) => {
      console.error('[MCP Error]', error);
    };
  }

  /**
   * Builds the AbapAdtServer for one HTTP/MCP session. Overridable so a test
   * can stub out the real SAP bootstrap (see handlerContract-style tests using
   * fixedSessionSource) without touching the routing/session-map logic below.
   */
  protected createSessionServer(env: NodeJS.ProcessEnv): AbapAdtServer {
    return new AbapAdtServer({ env });
  }

  /**
   * Serves Streamable HTTP instead of stdio, for a container multiple team
   * members connect to. `Server.connect()` (the MCP SDK's `Protocol` base
   * class) allows exactly one transport per instance for its whole lifetime,
   * so this cannot reuse `this` across connections the way stdio does — one
   * new AbapAdtServer, and one new SAP logon, is built per MCP session
   * instead. That is deliberate rather than a limitation worked around: each
   * HTTP client supplies its own SAP OAuth bearer token on `initialize` (see
   * `extractBearerToken`), which becomes that session's own SAP identity —
   * true per-user isolation, not one shared technical user serving everyone
   * who connects. A caller that also sends `X-SAP-Refresh-Token` gets the
   * `refresh_token` grant instead, and a session that renews itself.
   *
   * Three gates sit in front of that, in this order: the origin/host allow-list
   * (`resolveOriginPolicy`, which a reverse proxy cannot do for us), the
   * per-session rate limit (`createRateLimiter`, off by default), and the
   * credential check. See docs/Authentication.md for the env vars this reads.
   */
  protected async runHttp(): Promise<{ port: number; close(): Promise<void> }> {
    const port = Number(this.env.ABAP_MCP_HTTP_PORT ?? 3000);
    const host = this.env.ABAP_MCP_HTTP_HOST ?? '0.0.0.0';
    const originPolicy = resolveOriginPolicy(this.env);
    const allowedHosts = parseHttpList(this.env.ABAP_MCP_HTTP_ALLOWED_HOSTS);
    const rateLimiter = createRateLimiter(this.env);

    const sessions = new Map<
      string,
      { transport: StreamableHTTPServerTransport; server: AbapAdtServer }
    >();

    const closeSession = async (sessionId: string): Promise<void> => {
      const session = sessions.get(sessionId);
      if (!session) return;
      sessions.delete(sessionId);
      await session.server.close().catch(() => {
        /* already closing */
      });
    };

    const startSession = async (
      req: IncomingMessage,
      res: ServerResponse,
      body: unknown,
    ): Promise<void> => {
      const token = extractBearerToken(req);
      const refreshToken = extractRefreshToken(req);
      if (!token && !refreshToken) {
        writeJsonRpcError(
          res,
          401,
          ErrorCode.InvalidRequest,
          'Missing or malformed Authorization header. This server expects ' +
            '`Authorization: Bearer <SAP OAuth access token>` on every request — that token is this ' +
            "session's own SAP identity, not a shared server credential. A session that should " +
            'renew itself instead sends its own refresh token as `X-SAP-Refresh-Token`.',
        );
        return;
      }

      // The refresh token is the caller's, but the client registration it is
      // redeemed against belongs to the deployment: a token endpoint and a
      // client id have to be configured on the container for the grant to be
      // possible at all. Saying so here beats letting resolveOAuthConfig()
      // reject it as a misconfigured server, which it would look like.
      if (refreshToken && !(this.env.SAP_OAUTH_TOKEN_URL && this.env.SAP_OAUTH_CLIENT_ID)) {
        writeJsonRpcError(
          res,
          400,
          ErrorCode.InvalidRequest,
          'X-SAP-Refresh-Token was supplied, but this container has no OAuth client to redeem it ' +
            'with. Set SAP_OAUTH_TOKEN_URL and SAP_OAUTH_CLIENT_ID (plus SAP_OAUTH_CLIENT_SECRET if ' +
            'the client is confidential) on the container, or send only `Authorization: Bearer ' +
            '<access token>` and reconnect when it expires.',
        );
        return;
      }

      // Two grants, one per credential the caller can present. `static` is the
      // original: the access token is the whole session, and it dies with it.
      // `refresh_token` renews itself against the deployment's client
      // registration — still that caller's own SAP identity, because the
      // refresh token is theirs. Either way nothing here logs on as a shared
      // technical user.
      const sessionEnv: NodeJS.ProcessEnv = { ...this.env, SAP_AUTH_MODE: 'oauth' };
      // The session server is not the process serving HTTP — it is the thing
      // behind one connection, and it does log on. Leaving the transport set
      // would hand it the credential-less session source this process uses.
      delete sessionEnv.ABAP_MCP_TRANSPORT;
      if (refreshToken) {
        sessionEnv.SAP_OAUTH_GRANT = 'refresh_token';
        sessionEnv.SAP_OAUTH_REFRESH_TOKEN = refreshToken;
        delete sessionEnv.SAP_OAUTH_TOKEN;
      } else {
        sessionEnv.SAP_OAUTH_GRANT = 'static';
        sessionEnv.SAP_OAUTH_TOKEN = token;
      }

      const server = this.createSessionServer(sessionEnv);
      server.onerror = (error) => console.error('[MCP Error]', error);

      try {
        await server.bootstrapSession();
      } catch (error: any) {
        writeJsonRpcError(
          res,
          401,
          ErrorCode.InvalidRequest,
          refreshToken
            ? `This session's refresh token was refused: ${error?.message ?? error}`
            : `SAP rejected this session's token: ${error?.message ?? error}`,
        );
        return;
      }

      const transport: StreamableHTTPServerTransport =
        new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id: string) => {
            sessions.set(id, { transport, server });
          },
        });
      transport.onclose = () => {
        if (transport.sessionId) void closeSession(transport.sessionId);
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    };

    const httpServer = createHttpServer(async (req, res) => {
      // Origin first, before the path check and before anything reads a body:
      // a rebinding attempt is not entitled to know what this server serves.
      const origin = req.headers.origin;
      if (typeof origin === 'string' && origin) {
        if (!originAllowed(origin, originPolicy)) {
          writeJsonRpcError(
            res,
            403,
            ErrorCode.InvalidRequest,
            `Origin '${origin}' is not allowed. This endpoint answers browser origins only when ` +
              'ABAP_MCP_HTTP_ALLOWED_ORIGINS names them; MCP clients that are not web pages send no ' +
              'Origin header and are unaffected.',
          );
          return;
        }
        // Echoed rather than `*`: the allow-list is the decision, and a browser
        // will not accept `*` alongside credentialed requests anyway.
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Expose-Headers', CORS_EXPOSED_HEADERS);
      }

      if (!hostAllowed(req, allowedHosts)) {
        writeJsonRpcError(
          res,
          403,
          ErrorCode.InvalidRequest,
          `Host '${req.headers.host ?? ''}' is not allowed. ABAP_MCP_HTTP_ALLOWED_HOSTS names the ` +
            'names this server answers to.',
        );
        return;
      }

      if (
        !req.url ||
        new URL(req.url, 'http://localhost').pathname !== '/mcp'
      ) {
        writeJsonRpcError(
          res,
          404,
          ErrorCode.InvalidRequest,
          'Not found. This server only serves /mcp.',
        );
        return;
      }

      // Answered before the rate limit: a preflight is the browser's overhead,
      // not the client's traffic, and spending budget on it would make the
      // ceiling mean something different for browser clients.
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': CORS_REQUEST_HEADERS,
          'Access-Control-Max-Age': '600',
        });
        res.end();
        return;
      }

      if (rateLimiter) {
        const verdict = rateLimiter.take(rateLimitKey(req));
        if (!verdict.ok) {
          res.setHeader('Retry-After', String(verdict.retryAfter));
          writeJsonRpcError(
            res,
            429,
            ErrorCode.InvalidRequest,
            `Rate limit exceeded for this session: ABAP_MCP_HTTP_RATE_LIMIT allows ` +
              `${this.env.ABAP_MCP_HTTP_RATE_LIMIT} requests per minute. Retry in ` +
              `${verdict.retryAfter}s. If this was one legitimate burst rather than a loop, raise ` +
              'the limit rather than retrying harder — SAP is the resource being protected.',
          );
          return;
        }
      }

      const sessionId = req.headers['mcp-session-id'];
      const existing =
        typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
      if (existing) {
        await existing.transport.handleRequest(req, res);
        return;
      }
      if (typeof sessionId === 'string') {
        writeJsonRpcError(
          res,
          404,
          ErrorCode.InvalidRequest,
          'Session not found.',
        );
        return;
      }

      if (req.method !== 'POST') {
        writeJsonRpcError(
          res,
          400,
          ErrorCode.InvalidRequest,
          'Bad Request: Mcp-Session-Id header required.',
        );
        return;
      }

      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch (error: any) {
        writeJsonRpcError(
          res,
          400,
          ErrorCode.ParseError,
          `Parse error: ${error?.message ?? error}`,
        );
        return;
      }
      if (!isInitializeRequest(body)) {
        writeJsonRpcError(
          res,
          400,
          ErrorCode.InvalidRequest,
          'Bad Request: Mcp-Session-Id header required.',
        );
        return;
      }

      await startSession(req, res, body);
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, host, () => {
        httpServer.off('error', reject);
        resolve();
      });
    });
    const boundPort = (httpServer.address() as { port: number }).port;
    console.error(
      `MCP ABAP ADT API server listening on http://${host}:${boundPort}/mcp`,
    );

    const close = async (): Promise<void> => {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      for (const id of [...sessions.keys()]) await closeSession(id);
    };

    process.on('SIGINT', () => close().then(() => process.exit(0)));
    process.on('SIGTERM', () => close().then(() => process.exit(0)));

    return { port: boundPort, close };
  }
}
