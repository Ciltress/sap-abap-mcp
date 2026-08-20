import fs from "fs";
import https from "https";
import tls from "tls";
import { URL, URLSearchParams } from "url";
import type { SsoSession } from "./sso.js";

/**
 * OAuth 2.0, for a system that issues bearer tokens rather than accepting a
 * ticket, a certificate or a password.
 *
 * This is the fourth way in, and the one that fits the systems the other three
 * do not reach: an SAP BTP ABAP environment, where there is no Kerberos realm
 * and no ICM to configure for client certificates, and an on-premise system
 * whose Basis team has published ADT through the OAuth 2.0 authorisation server
 * (`SOAUTH2`) precisely so that no service password has to be handed out.
 *
 * Structurally it is the same shape as the other three, and deliberately so:
 * one HTTP GET carrying a credential, from which SAP session cookies and a CSRF
 * token are harvested and injected into the ADT client. The only difference is
 * where the credential comes from — a token endpoint rather than the Windows
 * ticket cache, a PKCS#12 file or the environment. **After the bootstrap the
 * token plays no further part**: the session cookie carries every later request,
 * exactly as in the other modes, which is why a token whose lifetime is shorter
 * than the SAP session's does not cut the session short.
 *
 * Four grants, because the useful ones differ by system rather than by taste:
 *
 *  - `client_credentials` — the headless default. A registered client id and
 *    secret stand for a technical user, and nothing expires that a restart
 *    cannot fix. This is what a BTP service key gives you.
 *  - `refresh_token` — for the authorisation-code flow someone else completed
 *    in a browser. The long-lived half is handed in, and this exchanges it for
 *    access tokens for as long as it lasts.
 *  - `password` — resource owner password credentials. Supported because some
 *    `SOAUTH2` configurations offer nothing else, and carrying the same hazard
 *    the password mode does: see the note on `permanent` below.
 *  - `static` — a token minted elsewhere (`cf oauth-token`, a proxy, a test).
 *    No endpoint is contacted at all.
 *
 * The authorisation-code flow itself is not here, and that is a decision rather
 * than an omission: it needs a browser and a redirect listener, and an MCP
 * server started by a client over stdio has neither. Complete it once by hand
 * and hand the refresh token in.
 *
 * **What is marked `permanent`, and why it matters.** The retry in server.ts
 * re-establishes the session on a 401, which is right for a session SAP aged out
 * and wrong for a credential SAP will keep refusing. Two of the failures here
 * can also cost a SAP user its account: an OAuth 2.0 client on AS ABAP *is* a
 * user in `SU01`, so a wrong client secret is a failed logon against
 * `login/fails_to_user_lock` in the same way a wrong password is, and the
 * `password` grant is a password logon with extra steps. Those are latched after
 * the first refusal and never retried. A rejection by SAP of a token the
 * endpoint was perfectly willing to mint is *not* latched — that is a mapping or
 * scope problem, retrying it costs nothing, and the fix is usually applied on
 * the SAP side while this server is running.
 */

/** How the access token is obtained. See the module note for which to use. */
export type OAuthGrant = "client_credentials" | "refresh_token" | "password" | "static";

/** How the client identifies itself at the token endpoint. */
export type OAuthClientAuth = "basic" | "post";

export interface OAuthConfig {
  grant: OAuthGrant;
  /** The token endpoint. Absent only for the `static` grant, which contacts nothing. */
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  /** Space-separated, as the wire format wants it. Optional: many servers have a default. */
  scope?: string;
  /** `refresh_token` grant. Replaced in memory when the server rotates it. */
  refreshToken?: string;
  /** `password` grant only — SAP_USER and SAP_PASSWORD. */
  user?: string;
  password?: string;
  /** `static` grant: the access token itself, already minted. */
  staticToken?: string;
  clientAuth: OAuthClientAuth;
  /** Extra CA bundle for verifying the *servers*, as in the other modes. */
  caFile?: string;
  rejectUnauthorized: boolean;
}

/** What healthcheck and the startup line are allowed to say. Never the token. */
export interface OAuthSessionInfo {
  grant: OAuthGrant;
  /** Origin and path only — a token endpoint carries no secret, but a query string might. */
  tokenEndpoint?: string;
  scope?: string;
  /** ISO, when the endpoint said how long the token lasts. */
  expiresAt?: string;
}

export interface AccessToken {
  value: string;
  /** Epoch ms. Absent when the endpoint did not say, in which case nothing is cached. */
  expiresAt?: number;
  scope?: string;
  /** Only when the server rotated it: the next refresh has to use this one. */
  refreshToken?: string;
}

export interface OAuthSessionConfig {
  baseUrl: string;
  client?: string;
  language?: string;
  agent: https.Agent;
  tokens: TokenProvider;
  bootstrapPath?: string;
  timeoutMs?: number;
}

export class OAuthError extends Error {
  /**
   * True when trying again with the same configuration cannot help — and, for
   * the two credential failures that reach a SAP user record, when trying again
   * would cost another failed logon. Read by the latch in server.ts.
   */
  constructor(
    message: string,
    public readonly permanent = false,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

/**
 * Raised when SAP refused the *token* rather than the request, so a second
 * attempt with a freshly minted one is worth making. Separate from `permanent`,
 * which says the opposite about a different layer.
 */
export class OAuthTokenRejected extends OAuthError {
  constructor(message: string, permanent = false) {
    super(message, permanent);
    this.name = "OAuthTokenRejected";
  }
}

/**
 * Renew this long before the token expires. A token that is valid for another
 * two seconds is not usable: SAP checks it after a network hop, and the two
 * clocks are not the same clock.
 */
const EXPIRY_SKEW_MS = 60_000;

const DEFAULT_TIMEOUT_MS = 15_000;

export function readOAuthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig {
  const grant = resolveGrant(env);

  const tokenUrl = String(env.SAP_OAUTH_TOKEN_URL ?? "").trim() || undefined;
  const clientId = String(env.SAP_OAUTH_CLIENT_ID ?? "").trim() || undefined;
  const clientSecret = String(env.SAP_OAUTH_CLIENT_SECRET ?? "") || undefined;
  const refreshToken = String(env.SAP_OAUTH_REFRESH_TOKEN ?? "").trim() || undefined;
  const staticToken = String(env.SAP_OAUTH_TOKEN ?? "").trim() || undefined;

  if (grant === "static") {
    if (!staticToken) {
      throw new OAuthError(
        "The static grant needs SAP_OAUTH_TOKEN — an access token minted somewhere else. Nothing " +
        "here can renew it, so for anything long-running set SAP_OAUTH_TOKEN_URL and a client id " +
        "instead.",
      );
    }
  } else {
    if (!tokenUrl) {
      throw new OAuthError(
        `The ${grant} grant needs SAP_OAUTH_TOKEN_URL — the OAuth 2.0 token endpoint. On AS ABAP ` +
        `that is https://<host>:<port>/sap/bc/sec/oauth2/token; on SAP BTP it is the 'url' in the ` +
        `service key, with /oauth/token appended.`,
      );
    }
    mustBeHttps(tokenUrl, "SAP_OAUTH_TOKEN_URL", "the client credential is sent in a header");
    if (!clientId) {
      throw new OAuthError(
        `The ${grant} grant needs SAP_OAUTH_CLIENT_ID — the OAuth 2.0 client registered in SOAUTH2, ` +
        `or 'clientid' from a BTP service key.`,
      );
    }
  }

  if (grant === "client_credentials" && !clientSecret) {
    throw new OAuthError(
      "The client_credentials grant needs SAP_OAUTH_CLIENT_SECRET: the secret is the whole " +
      "credential, since there is no user logging on behind it.",
    );
  }
  if (grant === "refresh_token" && !refreshToken) {
    throw new OAuthError(
      "The refresh_token grant needs SAP_OAUTH_REFRESH_TOKEN. This server cannot obtain one for " +
      "you — the authorisation-code flow it comes from needs a browser and a redirect URI, which a " +
      "server started over stdio has neither of. Complete that flow once by hand and pass the " +
      "refresh token in.",
    );
  }

  const user = String(env.SAP_USER ?? "").trim() || undefined;
  const password = grant === "password" ? String(env.SAP_PASSWORD ?? "") : undefined;
  if (grant === "password" && (!user || !password)) {
    throw new OAuthError(
      "The password grant sends SAP_USER and SAP_PASSWORD to the token endpoint, and one of them is " +
      "not set. Note this grant carries the same hazard as password mode — a wrong password is a " +
      "failed logon against login/fails_to_user_lock — so prefer client_credentials, which cannot " +
      "lock a dialog user.",
    );
  }

  const caFile = String(env.SAP_CA_FILE ?? "").trim() || undefined;
  if (caFile) {
    try {
      fs.accessSync(caFile, fs.constants.R_OK);
    } catch (error) {
      throw new OAuthError(`SAP_CA_FILE points at '${caFile}', which cannot be read.`, false, error);
    }
  }

  return {
    grant,
    tokenUrl,
    clientId,
    clientSecret,
    scope: String(env.SAP_OAUTH_SCOPE ?? "").trim() || undefined,
    refreshToken,
    user,
    password,
    staticToken,
    clientAuth: resolveClientAuth(env),
    caFile,
    rejectUnauthorized: env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
  };
}

/**
 * Which grant, from an explicit setting or from what is configured. The
 * heuristic mirrors resolveAuthMode()'s: nobody sets a refresh token or an
 * access token by accident, and a client id and secret with neither is a
 * client_credentials configuration.
 */
export function resolveGrant(env: NodeJS.ProcessEnv = process.env): OAuthGrant {
  const explicit = String(env.SAP_OAUTH_GRANT ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (explicit) {
    if (["client_credentials", "client_credential", "client", "cc"].includes(explicit)) {
      return "client_credentials";
    }
    if (["refresh_token", "refresh"].includes(explicit)) return "refresh_token";
    if (["password", "ropc", "resource_owner"].includes(explicit)) return "password";
    if (["static", "token", "bearer"].includes(explicit)) return "static";
    throw new OAuthError(
      `Unknown SAP_OAUTH_GRANT '${env.SAP_OAUTH_GRANT}'. Use 'client_credentials' (the headless ` +
      `default), 'refresh_token', 'password' or 'static'.`,
    );
  }

  if (env.SAP_OAUTH_TOKEN) return "static";
  if (env.SAP_OAUTH_REFRESH_TOKEN) return "refresh_token";
  return "client_credentials";
}

function resolveClientAuth(env: NodeJS.ProcessEnv): OAuthClientAuth {
  const explicit = String(env.SAP_OAUTH_CLIENT_AUTH ?? "").trim().toLowerCase();
  if (!explicit) return "basic";
  if (["basic", "client_secret_basic", "header"].includes(explicit)) return "basic";
  if (["post", "client_secret_post", "body", "form"].includes(explicit)) return "post";
  throw new OAuthError(
    `Unknown SAP_OAUTH_CLIENT_AUTH '${env.SAP_OAUTH_CLIENT_AUTH}'. Use 'basic' (the default: the ` +
    `client id and secret in an Authorization header) or 'post' (both in the form body).`,
  );
}

function mustBeHttps(url: string, variable: string, because: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new OAuthError(`${variable} is '${url}', which is not a valid URL.`, false, error);
  }
  if (parsed.protocol !== "https:") {
    throw new OAuthError(
      `${variable} is '${url}'. It has to be https, because ${because} — over plain http that is a ` +
      `credential in the clear for anyone on the path.`,
    );
  }
  return parsed;
}

/**
 * The agent every request goes out on, both to the token endpoint and to SAP.
 *
 * Unlike the other modes, a configured `SAP_CA_FILE` is *added* to Node's own
 * roots rather than replacing them. The token endpoint is frequently not the SAP
 * host — a BTP one is `*.authentication.<region>.hana.ondemand.com`, signed by a
 * public CA — so a bundle holding only the corporate root would verify SAP and
 * then fail to verify the endpoint that issues the credential for it.
 */
export function createOAuthAgent(cfg: OAuthConfig): https.Agent {
  return new https.Agent({
    keepAlive: true,
    rejectUnauthorized: cfg.rejectUnauthorized,
    ca: cfg.caFile ? [...tls.rootCertificates, fs.readFileSync(cfg.caFile, "utf8")] : undefined,
  });
}

export const bearerAuthHeader = (token: string): string => `Bearer ${token}`;

/**
 * Holds the access token, and knows when it has to be replaced.
 *
 * A provider rather than a function because two things need to be remembered
 * between calls: the token, so that re-establishing a session after SAP's 30
 * minute timeout does not mint a new one every time, and a rotated refresh
 * token, without which the *second* refresh against a server that rotates them
 * (BTP does) fails with `invalid_grant`.
 */
export interface TokenProvider {
  /** The token, minted only when there is no usable one cached. */
  get(): Promise<{ value: string; expiresAt?: number; cached: boolean }>;
  /** Drops the cache, so the next get() mints a new one. */
  forget(): void;
  /** What may be reported. Never includes the token. */
  describe(): OAuthSessionInfo;
}

export function createTokenProvider(
  cfg: OAuthConfig,
  agent: https.Agent,
  options: { timeoutMs?: number } = {},
): TokenProvider {
  // The static grant is a provider with nothing to do: there is no endpoint, so
  // the token cannot be renewed and `cached` is false because a second attempt
  // would present the identical token.
  if (cfg.grant === "static") {
    const value = String(cfg.staticToken);
    return {
      get: async () => ({ value, cached: false }),
      forget: () => { /* nothing to drop */ },
      describe: () => ({ grant: cfg.grant, scope: cfg.scope }),
    };
  }

  let cached: AccessToken | undefined;
  // Rotated in place when the server hands back a new one. Starts as whatever
  // the environment gave us.
  let refreshToken = cfg.refreshToken;
  // Shared by concurrent callers. The reachability probe pings two nodes at
  // once, and without this each of them would mint its own token.
  let inFlight: Promise<AccessToken> | undefined;

  const usable = (token: AccessToken | undefined): boolean =>
    !!token && typeof token.expiresAt === "number" && token.expiresAt - Date.now() > EXPIRY_SKEW_MS;

  const mint = async (): Promise<AccessToken> => {
    if (!inFlight) {
      inFlight = requestAccessToken(cfg, agent, { refreshToken, timeoutMs: options.timeoutMs })
        .finally(() => { inFlight = undefined; });
    }
    const token = await inFlight;
    // A server that does not say how long a token lasts gets no cache at all:
    // guessing a lifetime here would trade one round trip per session for a
    // credential that is silently already dead.
    cached = typeof token.expiresAt === "number" ? token : undefined;
    if (token.refreshToken) refreshToken = token.refreshToken;
    return token;
  };

  return {
    get: async () => {
      if (usable(cached)) {
        return { value: cached!.value, expiresAt: cached!.expiresAt, cached: true };
      }
      const token = await mint();
      return { value: token.value, expiresAt: token.expiresAt, cached: false };
    },
    forget: () => { cached = undefined; },
    describe: () => ({
      grant: cfg.grant,
      tokenEndpoint: cfg.tokenUrl ? endpointForDisplay(cfg.tokenUrl) : undefined,
      // What was granted, when the endpoint said, rather than what was asked
      // for. The two differ more often than they look like they should, and the
      // gap is exactly what a 401 from ADT is usually about.
      scope: cached?.scope ?? cfg.scope,
      expiresAt: cached?.expiresAt ? new Date(cached.expiresAt).toISOString() : undefined,
    }),
  };
}

/** Origin and path. A query string on a token endpoint is unusual and could carry anything. */
function endpointForDisplay(tokenUrl: string): string {
  try {
    const url = new URL(tokenUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return tokenUrl;
  }
}

/** One token request. The grant decides the body; nothing else about it changes. */
export async function requestAccessToken(
  cfg: OAuthConfig,
  agent: https.Agent,
  options: { refreshToken?: string; timeoutMs?: number } = {},
): Promise<AccessToken> {
  const url = mustBeHttps(String(cfg.tokenUrl), "SAP_OAUTH_TOKEN_URL", "the client credential is sent in a header");
  const body = new URLSearchParams({ grant_type: cfg.grant });

  if (cfg.grant === "refresh_token") {
    body.set("refresh_token", String(options.refreshToken ?? cfg.refreshToken));
  }
  if (cfg.grant === "password") {
    body.set("username", String(cfg.user));
    body.set("password", String(cfg.password));
  }
  if (cfg.scope) body.set("scope", cfg.scope);

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };

  if (cfg.clientAuth === "basic" && cfg.clientSecret) {
    // Deliberately not URL-encoded first. RFC 6749 §2.3.1 asks for it; neither
    // SAP's authorisation server nor UAA decodes it, and `curl -u` does not
    // encode either — so encoding a secret containing '+' or '/' would produce a
    // credential that is wrong in a way that reads as a wrong secret.
    // SAP_OAUTH_CLIENT_AUTH=post is the way out if a server ever wants it.
    headers.authorization =
      `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`, "utf8").toString("base64")}`;
  } else {
    // The client id travels even when there is no secret: a public client using
    // a refresh token is still required to identify itself.
    body.set("client_id", String(cfg.clientId));
    if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  }

  const payload = body.toString();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<AccessToken>((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        agent,
        timeout: timeoutMs,
        headers: { ...headers, "content-length": Buffer.byteLength(payload).toString() },
      },
      response => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { raw += chunk; });
        response.on("end", () => {
          try {
            resolve(interpretTokenResponse(response.statusCode ?? 0, raw, cfg));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy();
      reject(new OAuthError(`The token endpoint ${url.host} did not answer within ${timeoutMs} ms.`));
    });
    request.on("error", error =>
      reject(describeConnectionFailure(error as NodeJS.ErrnoException, url, "token endpoint")));
    request.write(payload);
    request.end();
  });
}

/**
 * The token, or the reason there is none.
 *
 * Pure, and separate from the request for the same reason
 * `interpretPasswordResponse` is: everything that decides the answer is a status
 * code and a JSON body, and the decision that must not be got wrong — which
 * failures are latched — should be reachable by a test rather than only by a
 * misconfigured authorisation server.
 */
export function interpretTokenResponse(
  status: number,
  rawBody: string,
  cfg: Pick<OAuthConfig, "grant" | "clientId">,
): AccessToken {
  const body = parseJson(rawBody);

  if (status < 200 || status >= 300) {
    throw tokenEndpointError(status, body, rawBody, cfg);
  }
  if (!body) {
    throw new OAuthError(
      `The token endpoint answered HTTP ${status} with a body that is not JSON. Check that ` +
      `SAP_OAUTH_TOKEN_URL points at the token endpoint itself and not at an ICF logon page or a ` +
      `reverse proxy in front of one.`,
    );
  }

  const value = String(body.access_token ?? "").trim();
  if (!value) {
    throw new OAuthError(
      `The token endpoint answered HTTP ${status} without an access_token. The fields it did return ` +
      `were: ${Object.keys(body).join(", ") || "none"}.`,
    );
  }

  const tokenType = String(body.token_type ?? "bearer");
  if (!/^bearer$/i.test(tokenType)) {
    // A SAML bearer or a JWT-in-a-cookie would need a different presentation
    // than the Authorization header this mode uses, and would fail with a 401
    // that looked like a mapping problem.
    throw new OAuthError(
      `The token endpoint issued a '${tokenType}' token, and this server can only present a bearer ` +
      `token in an Authorization header.`,
    );
  }

  const lifetime = Number(body.expires_in);

  return {
    value,
    expiresAt: Number.isFinite(lifetime) && lifetime > 0 ? Date.now() + lifetime * 1000 : undefined,
    scope: typeof body.scope === "string" ? body.scope : undefined,
    // Rotation: a server that hands back a new refresh token has invalidated the
    // one just used, and the next refresh has to carry this one instead.
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
  };
}

/**
 * The advice for a refused token request, and — more importantly — whether it is
 * ever worth asking again.
 *
 * `invalid_client` and an `invalid_grant` under the password grant are the two
 * that reach a SAP user record: an OAuth 2.0 client on AS ABAP is a user in
 * SU01, so both count against `login/fails_to_user_lock`. They are latched for
 * the same reason password mode latches a 401 — five tool calls must cost one
 * failed logon, not five.
 */
function tokenEndpointError(
  status: number,
  body: Record<string, any> | undefined,
  rawBody: string,
  cfg: Pick<OAuthConfig, "grant" | "clientId">,
): OAuthError {
  const code = String(body?.error ?? "").trim();
  const description = String(body?.error_description ?? "").trim();
  const detail = description ? ` — ${description}` : "";

  if (code === "invalid_client" || status === 401) {
    return new OAuthError(
      `The token endpoint rejected the client credentials for '${cfg.clientId}' (HTTP ${status}` +
      `${code ? `, ${code}` : ""})${detail}.\n\n` +
      `This will not be retried. An OAuth 2.0 client on AS ABAP is a user in SU01, so a wrong ` +
      `secret counts against login/fails_to_user_lock exactly as a wrong password does.\n\n` +
      `Usually, in order:\n` +
      `  1. SAP_OAUTH_CLIENT_SECRET is wrong, or was regenerated in SOAUTH2.\n` +
      `  2. The client id does not exist on this authorisation server, or the tenant in ` +
      `SAP_OAUTH_TOKEN_URL is not the one it was registered in.\n` +
      `  3. The server wants the credentials in the form body rather than in an Authorization ` +
      `header — set SAP_OAUTH_CLIENT_AUTH=post.`,
      true,
    );
  }

  if (code === "invalid_grant") {
    return cfg.grant === "password"
      ? new OAuthError(
        `The token endpoint rejected the user credentials (HTTP ${status}, invalid_grant)${detail}.\n\n` +
        `This will not be retried: the password grant is a password logon, so this attempt already ` +
        `counted against login/fails_to_user_lock and a second would move the user closer to being ` +
        `locked for everything that uses it.\n\n` +
        `Either the password is wrong or expired, or the user cannot log on interactively — a ` +
        `System user (USTYP 'B') cannot. Consider the client_credentials grant, which cannot lock a ` +
        `dialog user.`,
        true,
      )
      : new OAuthError(
        `The token endpoint rejected the refresh token (HTTP ${status}, invalid_grant)${detail}.\n\n` +
        `A refresh token expires, is revoked when the user's password changes, and is invalidated ` +
        `by use on servers that rotate them — SAP BTP does. Run the authorisation-code flow again ` +
        `and put the new refresh token in SAP_OAUTH_REFRESH_TOKEN, or move to the ` +
        `client_credentials grant, which never needs renewing by hand.`,
        true,
      );
  }

  if (code === "unauthorized_client") {
    return new OAuthError(
      `The token endpoint knows this client but will not let it use the ${cfg.grant} grant ` +
      `(HTTP ${status}, unauthorized_client)${detail}. In SOAUTH2 the grant types are per client; ` +
      `on BTP the service key decides. Grant it there, or pick a grant it already has.`,
      true,
    );
  }

  if (code === "invalid_scope") {
    return new OAuthError(
      `The token endpoint refused the requested scope (HTTP ${status}, invalid_scope)${detail}. ` +
      `SAP_OAUTH_SCOPE has to name scopes assigned to this client — in SOAUTH2 that is the scope ` +
      `for the ICF service being called. Leaving it unset asks for the client's default scopes, ` +
      `which is usually what is wanted.`,
      true,
    );
  }

  if (status === 404) {
    return new OAuthError(
      `The token endpoint answered HTTP 404. SAP_OAUTH_TOKEN_URL is very likely not the token ` +
      `endpoint: on AS ABAP it is /sap/bc/sec/oauth2/token, and that ICF node has to be active in ` +
      `SICF like any other.`,
      true,
    );
  }

  // 5xx, 408 and 429 are the endpoint having a bad moment rather than a
  // configuration that will fail identically forever, so they stay retryable.
  const permanent = status >= 400 && status < 500 && status !== 408 && status !== 429;

  return new OAuthError(
    `The token endpoint answered HTTP ${status}${code ? ` (${code})` : ""}${detail}` +
    (code || description ? "." : `: ${rawBody.slice(0, 200) || "no body"}`),
    permanent,
  );
}

function parseJson(raw: string): Record<string, any> | undefined {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Logs on by presenting the bearer token and harvests the session, mirroring
 * what the other three modes do with their own credential.
 *
 * The one thing it adds is a second attempt. A cached token can be rejected for
 * reasons that have nothing to do with the configuration — it was revoked, or
 * the two clocks disagree by more than the skew allows — and minting a new one
 * costs nothing and no failed logon. A token that was *already* fresh is not
 * tried again: the same request would produce the same token and the same 401.
 */
export async function bootstrapOAuthSession(cfg: OAuthSessionConfig): Promise<SsoSession> {
  const token = await cfg.tokens.get();

  try {
    return await requestSession(cfg, token.value);
  } catch (error) {
    if (!shouldRetryWithFreshToken(error, token)) throw error;

    cfg.tokens.forget();
    const minted = await cfg.tokens.get();
    return requestSession(cfg, minted.value);
  }
}

/**
 * Whether the refusal above is worth a second attempt. Extracted because it is
 * the whole of the decision, and welding it to two HTTP requests would make the
 * one case that must not regress — a fresh token refused, retried forever —
 * reachable only from a misconfigured authorisation server.
 */
export function shouldRetryWithFreshToken(error: unknown, token: { cached: boolean }): boolean {
  // Only SAP's own refusal of the token qualifies. A 403, a timeout or a refused
  // token *request* are all answers that a new token would not change.
  return error instanceof OAuthTokenRejected && !error.permanent && token.cached;
}

function requestSession(cfg: OAuthSessionConfig, token: string): Promise<SsoSession> {
  const path = cfg.bootstrapPath ?? "/sap/bc/adt/compatibility/graph";
  let url: URL;
  try {
    url = new URL(`${cfg.baseUrl}${path}`);
  } catch (error) {
    return Promise.reject(new OAuthError(`SAP_URL '${cfg.baseUrl}' is not a valid URL.`, false, error));
  }

  if (url.protocol !== "https:") {
    return Promise.reject(new OAuthError(
      `SAP_URL is '${cfg.baseUrl}'. A bearer token sent over plain http is a credential in the ` +
      `clear, and one that is valid for every other consumer of that token — use https.`,
    ));
  }

  if (cfg.client) url.searchParams.set("sap-client", cfg.client);
  if (cfg.language) url.searchParams.set("sap-language", cfg.language);

  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<SsoSession>((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        agent: cfg.agent,
        timeout: timeoutMs,
        headers: { "x-csrf-token": "fetch", authorization: bearerAuthHeader(token) },
      },
      response => {
        response.resume();
        response.on("end", () => {
          try {
            resolve(interpretOAuthResponse(response.statusCode ?? 0, response.headers as any));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy();
      reject(new OAuthError(`No answer from ${url.host} within ${timeoutMs} ms.`));
    });
    request.on("error", error =>
      reject(describeConnectionFailure(error as NodeJS.ErrnoException, url, "SAP")));
    request.end();
  });
}

/**
 * The session, or the reason there is none. Pure, like its three siblings.
 *
 * A 401 here means SAP would not take a token the endpoint was willing to issue,
 * which is a different problem from a refused token request and is not latched:
 * it is fixed on the SAP side, usually while this server is running.
 */
export function interpretOAuthResponse(
  status: number,
  headers: Record<string, string | string[] | undefined>,
): SsoSession {
  if (status === 401) {
    throw new OAuthTokenRejected(
      `SAP refused the OAuth 2.0 access token (HTTP 401). The token endpoint issued it, so this is ` +
      `not the client secret: SAP will not turn this token into a user.\n\n` +
      `Usually, in order:\n` +
      `  1. The token has no scope covering the ICF node being called. In SOAUTH2 the scope is ` +
      `bound to the service, and a token minted for a different one is refused here.\n` +
      `  2. The resource owner has no usable user in this client — not created, locked, or expired.\n` +
      `  3. The system does not accept OAuth 2.0 on this node at all: SICF logon data has to allow ` +
      `it, and /sap/bc/sec/oauth2 has to be active.\n` +
      `  4. The token is for a different system or tenant than SAP_URL points at.`,
    );
  }
  if (status === 403) {
    throw new OAuthError(
      `SAP accepted the token and refused the resource (HTTP 403). The credential is right; the user ` +
      `behind it is missing an authorisation — S_DEVELOP for the ADT nodes. See ` +
      `docs/Authentication.md, and note ABAP_MCP_RFC_FALLBACK if the RFC tools alone would be useful.`,
      true,
    );
  }
  if (status < 200 || status >= 300) {
    throw new OAuthError(`OAuth2 logon: unexpected HTTP status ${status}.`);
  }

  const cookies = new Map<string, string>();
  for (const raw of toArray(headers["set-cookie"])) {
    const cleaned = raw.replace(/path=\/,/g, "").replace(/path=\//g, "").split(";")[0].trim();
    cookies.set(cleaned.split("=", 1)[0], cleaned);
  }

  const csrfToken = String(first(headers["x-csrf-token"]) ?? "").trim();

  if (cookies.size === 0 || !csrfToken) {
    throw new OAuthError(
      "OAuth2 logon: HTTP 200 but no session cookie or CSRF token in the response. The ICF node " +
      "answered anonymously — check that it requires a logon.",
    );
  }

  return { cookies, csrfToken };
}

function describeConnectionFailure(
  error: NodeJS.ErrnoException,
  url: URL,
  what: string,
): OAuthError {
  const code = String(error.code ?? "");

  if (["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"].includes(code)) {
    return new OAuthError(
      `The server certificate of ${url.host} was not trusted (${code}). Point SAP_CA_FILE at the ` +
      `issuing root CA — it is added to Node's own roots rather than replacing them, so one bundle ` +
      `covers both SAP and a token endpoint signed by a public CA — or set ` +
      `NODE_TLS_REJECT_UNAUTHORIZED=0 for development.`,
      false,
      error,
    );
  }

  return new OAuthError(`The request to the ${what} at ${url.host} failed: ${error.message}`, false, error);
}

const toArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;
