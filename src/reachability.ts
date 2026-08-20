import { execFile } from "child_process";
import https from "https";
import { promisify } from "util";
import { URL } from "url";
import { resolveCurlPath } from "./sso.js";
import { parseSessionCookies } from "./lib/systemIdentity.js";
import type { AuthMode } from "./certauth.js";

const execFileAsync = promisify(execFile);
const DEVNULL = process.platform === "win32" ? "NUL" : "/dev/null";

/**
 * Whether SAP is reachable, and when it is not, which layer stopped the request.
 *
 * This exists because of a failure that took two days to read. Two servers would
 * not start, and both said the same thing: "SPNEGO/Kerberos authentication
 * failed — no valid Kerberos ticket, check klist, check VPN". The ticket was
 * fine. The ADT ICF node had been switched off on both systems, and SAP was
 * answering HTTP 403 *before offering a logon at all* — a status ./sso.ts read as
 * an authentication failure because it handles 401 and 403 together.
 *
 * The evidence that settles it was already on the wire and nothing looked at it:
 *
 *   GET /sap/public/ping  -> 200          the host, the ICM and TLS are fine
 *   GET /sap/bc/ping      -> 403          ...and SAP still will not serve this
 *                        no www-authenticate header: no logon was ever offered
 *
 * So the probe is two requests at two layers, and the pair is the point. The
 * public node needs no logon, which separates "nothing is listening" from "SAP is
 * listening and refusing". The authenticated node needs one, which separates "the
 * ICF is not serving this path" from "SAP would not accept who I am". Either one
 * alone cannot tell those apart, which is exactly how the original message came
 * to blame Kerberos for a service that was switched off.
 *
 * Everything that decides the answer is a property of two status codes and a
 * header, so `interpretReachability` is pure and the two transports are thin.
 */

/** The always-on ICF node. Answers without a logon, so it isolates the network. */
export const PUBLIC_PING = "/sap/public/ping";

/**
 * Needs a logon, and hands back `SAP_SESSIONID_<SID>_<CLIENT>` — so a successful
 * probe also says which system answered, in 54 bytes rather than the 31 KB the
 * bootstrap endpoint returns. It does *not* return an `x-csrf-token`, which is
 * why it cannot replace the bootstrap in ./sso.ts.
 */
export const AUTHENTICATED_PING = "/sap/bc/ping";

/** Why a request never produced a status. Classified, so the diagnosis can branch on it. */
export interface ProbeError {
  /**
   * 'DNS' | 'CONNECT' | 'TIMEOUT' | 'TLS' | 'CREDENTIAL' | 'OTHER'.
   *
   * 'CREDENTIAL' is the odd one: the request was never sent, because the
   * credential to send it with could not be obtained. Only OAuth mode produces
   * it — a token endpoint that refuses is a logon failure, and reporting it as
   * an unreachable SAP would send the reader to the wrong host entirely.
   */
  code: string;
  message: string;
}

export interface HttpProbe {
  /** Status of the final response, or 0 when there never was one. */
  status: number;
  /**
   * Lower-cased headers of the final response, repeats joined with ", ". Good
   * enough for `www-authenticate`, whose values carry no commas.
   */
  headers: Record<string, string>;
  /** Raw `set-cookie` values, left unjoined — a cookie value can contain a comma. */
  cookies: string[];
  error?: ProbeError;
}

/** One bare HTTP GET, carrying whatever credentials this server logs on with. */
export type ProbeTransport = (url: string, timeoutMs: number) => Promise<HttpProbe>;

export type ReachabilityLayer =
  /** Both nodes answered and SAP accepted the logon. */
  | "ok"
  /** Nothing answered: DNS, routing, the port, or the VPN. */
  | "network"
  /** The TLS handshake failed, so no HTTP request was ever made. */
  | "tls"
  /** SAP answered but will not serve the path, without offering a logon. */
  | "icf"
  /** The ICF serves it; SAP refused the credentials. */
  | "logon"
  /** Answered, but not in any shape this knows how to read. */
  | "unknown";

export interface ReachabilityReport {
  /** False for every layer but `ok`. */
  ok: boolean;
  layer: ReachabilityLayer;
  /** One line. Safe to log, and the first thing a reader sees. */
  summary: string;
  /** What to do about it, ordered by how often it is the cause. Absent when ok. */
  advice?: string;
  endpoints: Array<{ path: string; status: number; error?: string }>;
  /**
   * The system SAP named for itself — from the session cookie when the logon
   * worked, and from the Basic realm when it did not. Worth having in both
   * cases: it catches a server pointed at the wrong system without needing a
   * session to do it.
   */
  observed?: { systemId?: string; client?: string };
}

/** `Basic realm="SAP NetWeaver Application Server [P01/200]"` — SAP names itself even while refusing. */
const LOGON_REALM = /realm="[^"]*\[([A-Za-z0-9]{3})\/(\d{3})\]"/;

/**
 * Runs both probes and reads the pair.
 *
 * The two run together: they are independent, and this sits inside `healthcheck`,
 * which a client waits on.
 */
export async function probeReachability(cfg: {
  baseUrl: string;
  client?: string;
  language?: string;
  authMode: AuthMode;
  transport: ProbeTransport;
  /** Per request, not for the pair. */
  timeoutMs?: number;
}): Promise<ReachabilityReport> {
  const timeoutMs = cfg.timeoutMs ?? 5_000;

  const [publicPing, authPing] = await Promise.all([
    cfg.transport(pingUrl(cfg.baseUrl, PUBLIC_PING, cfg), timeoutMs),
    cfg.transport(pingUrl(cfg.baseUrl, AUTHENTICATED_PING, cfg), timeoutMs)
  ]);

  return interpretReachability({ publicPing, authPing }, cfg);
}

function pingUrl(
  baseUrl: string,
  path: string,
  cfg: { client?: string; language?: string }
): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}${path}`);
  if (cfg.client) url.searchParams.set("sap-client", cfg.client);
  if (cfg.language) url.searchParams.set("sap-language", cfg.language);
  return url.toString();
}

/**
 * The diagnosis. Pure, because every input that decides it is a status code, an
 * error class or one header — none of which needs a SAP system to reproduce.
 *
 * Order matters. A successful authenticated ping settles the question no matter
 * what the public one did, and `/sap/public/ping` is itself deactivated on some
 * hardened systems, so it is never allowed to veto a logon that plainly worked.
 */
export function interpretReachability(
  probes: { publicPing: HttpProbe; authPing: HttpProbe },
  context: { baseUrl: string; authMode: AuthMode }
): ReachabilityReport {
  const { publicPing, authPing } = probes;
  const host = hostOf(context.baseUrl);
  const endpoints = [
    describeEndpoint(PUBLIC_PING, publicPing),
    describeEndpoint(AUTHENTICATED_PING, authPing)
  ];
  const observed = observedSystem(authPing) ?? observedSystem(publicPing);
  const report = (layer: ReachabilityLayer, summary: string, advice?: string): ReachabilityReport =>
    ({ ok: layer === "ok", layer, summary, ...(advice ? { advice } : {}), endpoints, ...(observed ? { observed } : {}) });

  if (isSuccess(authPing.status)) {
    return report(
      "ok",
      `${host} answered on both ${PUBLIC_PING} and ${AUTHENTICATED_PING}; the logon was accepted` +
      (observed?.systemId ? ` on ${observed.systemId}/${observed.client ?? "?"}` : "")
    );
  }

  // Nothing was sent, because there was nothing to send it with. SAP is not
  // implicated and must not be blamed: the failure is at the token endpoint.
  const credential = authPing.error?.code === "CREDENTIAL" ? authPing.error : undefined;
  if (credential) {
    return report(
      "logon",
      `No ${credentialName(context.authMode)} could be obtained, so ${host} was never asked ` +
      `(${credential.message})`,
      `This is the credential half of the logon and has nothing to do with SAP being reachable — ` +
      `the request was never made. The message above comes from the token endpoint in ` +
      `SAP_OAUTH_TOKEN_URL, which is frequently a different host from SAP_URL.`
    );
  }

  // No status at all, from either node: the request did not reach an HTTP server.
  const failure = publicPing.error ?? authPing.error;
  if (failure && !isSuccess(publicPing.status)) {
    return failure.code === "TLS"
      ? report("tls", `The TLS handshake with ${host} failed (${failure.message})`, tlsAdvice(host, failure))
      : report("network", `No answer from ${host} (${failure.message})`, networkAdvice(host, failure));
  }

  if (authPing.status === 401) {
    return report(
      "logon",
      `${host} serves ${AUTHENTICATED_PING} but refused the ${credentialName(context.authMode)} (HTTP 401)`,
      logonAdvice(context.authMode, authPing, observed)
    );
  }

  if (authPing.status === 403 || authPing.status === 404) {
    return report(
      "icf",
      `${host} is up — ${PUBLIC_PING} answered ${publicPing.status} — but will not serve ` +
      `${AUTHENTICATED_PING} (HTTP ${authPing.status}), and offered no logon`,
      icfAdvice(authPing.status, publicPing)
    );
  }

  return report(
    "unknown",
    `${AUTHENTICATED_PING} answered HTTP ${authPing.status || "nothing"} on ${host}, ` +
    `which is neither a logon problem nor a served page`,
    authPing.error
      ? `The request failed with ${authPing.error.code}: ${authPing.error.message}.`
      : undefined
  );
}

const isSuccess = (status: number) => status >= 200 && status < 300;

const credentialName = (mode: AuthMode) => {
  switch (mode) {
    case "certificate": return "client certificate";
    case "oauth": return "OAuth 2.0 access token";
    case "password": return "user and password";
    default: return "Kerberos token";
  }
};

function describeEndpoint(path: string, probe: HttpProbe) {
  return {
    path,
    status: probe.status,
    ...(probe.error ? { error: `${probe.error.code}: ${probe.error.message}` } : {})
  };
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * Which system SAP said it was. The cookie is authoritative and free; the realm
 * is the fallback that still works when the logon was refused, which is the case
 * where a wrongly pointed server is hardest to spot.
 */
function observedSystem(probe: HttpProbe): { systemId?: string; client?: string } | undefined {
  const fromCookie = parseSessionCookies(probe.cookies.map(c => c.split("=", 1)[0]));
  if (fromCookie.systemId) return fromCookie;

  const realm = LOGON_REALM.exec(probe.headers["www-authenticate"] ?? "");
  return realm ? { systemId: realm[1].toUpperCase(), client: realm[2] } : undefined;
}

/**
 * The 403 that started all this. Said at length because the cheap reading —
 * "authentication failed" — is wrong, and sends the reader to `klist` and the
 * VPN for a problem that is neither.
 */
function icfAdvice(status: number, publicPing: HttpProbe): string {
  const lines = [
    `Nothing was authenticated here. SAP returned ${status} without offering a logon, so this is not ` +
    `about your Kerberos ticket, your user, or your authorisations — no credential was ever examined.`,
    "",
    "In the order this is usually wrong:",
    "  1. SICF: the node must be active, and so must every node above it.",
    "     Transaction SICF -> /default_host/sap/bc/adt -> Activate Service (with its subtree).",
    "  2. If a Web Dispatcher or reverse proxy fronts this port, its permission table has to",
    "     allow /sap/bc/adt/* — a whitelist that permits only /sap/public and /sap/opu looks",
    "     exactly like this from here.",
    `  3. ${AUTHENTICATED_PING} is itself a routine target of ICF hardening (SAP note 1422273),`,
    "     so on its own a 403 here need not mean ADT is blocked. Check /sap/bc/adt/discovery",
    "     before concluding either way.",
    "",
    "ADT in Eclipse fails against this system in exactly the same way. That is the quickest way to",
    "confirm the block is on the system rather than in this server."
  ];

  if (!isSuccess(publicPing.status)) {
    lines.push(
      "",
      `Note ${PUBLIC_PING} answered ${publicPing.status} too. That node is normally always on, so ` +
      `whatever is refusing may sit in front of the ICF rather than in it.`
    );
  }

  return lines.join("\n");
}

/**
 * A 401 has two quite different causes, and the final `www-authenticate` header
 * tells them apart: SAP falling back to Basic means it received a credential and
 * would not map it, while a bare repeat of the challenge means nothing was ever
 * sent.
 */
function logonAdvice(
  mode: AuthMode,
  probe: HttpProbe,
  observed?: { systemId?: string; client?: string }
): string {
  const challenge = probe.headers["www-authenticate"] ?? "";
  const where = observed?.systemId
    ? `${observed.systemId}/${observed.client ?? "?"}`
    : "this system and client";

  if (mode === "certificate") {
    return [
      "SAP refused the client certificate. See the four checks in certauth.ts (CERTRULE mapping,",
      "VCLIENT on the port, the issuing CA in STRUST, certificate logon allowed on the ICF node),",
      "which is the same list that applies here.",
      `The certificate has to map to a user that exists in ${where}.`
    ].join("\n");
  }

  if (mode === "oauth") {
    return [
      "SAP refused the access token, which the token endpoint had already issued — so this is not",
      "the client secret. The list is in oauth.ts, and in the order it is usually wrong:",
      "  1. The token's scope does not cover this ICF node. In SOAUTH2 a scope is bound to a",
      "     service, and a token minted for another one is refused here.",
      `  2. The resource owner has no usable user in ${where}.`,
      "  3. The node does not accept OAuth 2.0 logon at all (SICF logon data), or",
      "     /sap/bc/sec/oauth2 is inactive.",
      "  4. The token belongs to a different system or tenant than SAP_URL points at."
    ].join("\n");
  }

  if (mode === "password") {
    return [
      "SAP refused the password, and that attempt counted against login/fails_to_user_lock — so",
      "this is not something to try repeatedly. The server will not retry it by itself.",
      "",
      "  1. The password is wrong, or has expired and must be changed in SAP GUI first.",
      `  2. The user does not exist in ${where}, or is locked already (SU01).`,
      "  3. A System user (USTYP 'B') cannot log on this way; it needs to be Service or Dialog."
    ].join("\n");
  }

  if (/basic/i.test(challenge)) {
    return [
      `SAP received a Kerberos token and rejected it, then offered Basic authentication instead.`,
      "The ticket therefore reached SAP — this is a mapping problem, not a ticket problem, and",
      "`klist` will look perfectly healthy.",
      "",
      "In the order this is usually wrong:",
      `  1. The user has no usable master record in ${where} — not created there, locked, or expired.`,
      "     A user that exists in one client of a system does not exist in another.",
      "  2. The SPNEGO mapping is missing for this user: SU01 -> SNC tab, or the USREXTID entry",
      "     the SPNEGO wizard (SPNEGO transaction) maintains.",
      "  3. The service principal this host answers for is not the one SAP holds a keytab for,",
      "     so the token decrypts to nothing SAP recognises."
    ].join("\n");
  }

  return [
    "SAP asked for SPNEGO/Kerberos and no token was sent, so there was nothing to map.",
    "",
    "  1. `klist` — is there a TGT at all, and has it not expired? A locked workstation overnight",
    "     is the common way to lose one.",
    "  2. Is this machine on the domain network or the VPN right now?",
    `  3. Can Windows resolve a service ticket for this host? \`klist get HTTP/${"<host>"}\` shows it.`
  ].join("\n");
}

function networkAdvice(host: string, failure: ProbeError): string {
  if (failure.code === "DNS") {
    return `${host} did not resolve. Check the name in SAP_URL, and that this machine is on the ` +
      `network or VPN that carries the internal DNS.`;
  }
  if (failure.code === "TIMEOUT") {
    return `${host} accepted no answer in time. Usually the VPN is down or a firewall is dropping ` +
      `the port rather than refusing it.`;
  }
  return `Nothing is listening on ${host}, or the route to it is blocked. Check the host and port in ` +
    `SAP_URL, the VPN, and that the SAP instance is up.`;
}

function tlsAdvice(host: string, failure: ProbeError): string {
  return [
    `The server certificate of ${host} was not trusted here (${failure.message}). This is about`,
    "verifying SAP, not about your own credentials.",
    "Point SAP_CA_FILE at the issuing root CA, or set NODE_TLS_REJECT_UNAUTHORIZED=0 for development."
  ].join("\n");
}

/**
 * SPNEGO over `curl --negotiate`, the same way ./sso.ts logs on — so the probe
 * exercises the credential the server actually uses rather than a lookalike.
 */
export function curlProbeTransport(
  options: { insecureTls?: boolean; curlPath?: string } = {}
): ProbeTransport {
  return async (url, timeoutMs) => {
    const args = [
      "--negotiate", "-u", ":",
      "-D", "-", "-o", DEVNULL, "-s", "-S",
      "--max-time", String(Math.max(1, Math.ceil(timeoutMs / 1000)))
    ];
    if (options.insecureTls) args.push("-k");
    args.push(url);

    try {
      const { stdout } = await execFileAsync(resolveCurlPath(options.curlPath), args, { windowsHide: true });
      return interpretCurlProbe(stdout);
    } catch (error: any) {
      // curl exits non-zero for a status it still received (--fail is not set, so
      // this is rarer than it looks) as well as for never getting one. If headers
      // came back, they are the better answer.
      const stdout = String(error?.stdout ?? "");
      if (/^HTTP\//m.test(stdout)) return interpretCurlProbe(stdout);
      return { status: 0, headers: {}, cookies: [], error: describeCurlFailure(error) };
    }
  };
}

/**
 * Reads `curl -D -`, which dumps every response in the exchange: with
 * `--negotiate` that is the 401 challenge *and* the answer to the retry. The last
 * block is the one that decides, and on a rejected token it is the 401 carrying
 * `www-authenticate: Basic` — the header this whole diagnosis turns on.
 */
export function interpretCurlProbe(stdout: string): HttpProbe {
  const blocks: string[][] = [];
  for (const line of String(stdout ?? "").split(/\r?\n/)) {
    if (/^HTTP\/\d/.test(line)) blocks.push([]);
    if (blocks.length) blocks[blocks.length - 1].push(line);
  }

  const last = blocks[blocks.length - 1];
  if (!last) {
    return {
      status: 0,
      headers: {},
      cookies: [],
      error: { code: "OTHER", message: "curl returned no response headers" }
    };
  }

  const status = parseInt((last[0].match(/HTTP\/\d(?:\.\d)?\s+(\d+)/) ?? [])[1] ?? "0", 10);
  const headers: Record<string, string> = {};
  const cookies: string[] = [];

  for (const line of last.slice(1)) {
    const match = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (!match) continue;
    const name = match[1].toLowerCase();
    const value = match[2].trim();

    if (name === "set-cookie") {
      cookies.push(value);
      continue;
    }
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }

  return { status, headers, cookies };
}

/** curl's exit codes, in the classes the diagnosis branches on. */
export function describeCurlFailure(error: any): ProbeError {
  const exit = typeof error?.code === "number" ? error.code : undefined;
  const stderr = String(error?.stderr ?? "").trim();
  const message = stderr || String(error?.message ?? "curl failed");

  if (error?.code === "ENOENT") {
    return { code: "OTHER", message: "curl was not found; SPNEGO needs one with GSS/Schannel support" };
  }
  if (exit === 6) return { code: "DNS", message: message || "could not resolve host" };
  if (exit === 7) return { code: "CONNECT", message: message || "could not connect" };
  if (exit === 28) return { code: "TIMEOUT", message: message || "timed out" };
  if (exit !== undefined && [35, 51, 58, 59, 60, 77, 83].includes(exit)) {
    return { code: "TLS", message };
  }
  return { code: "OTHER", message };
}

/**
 * The transport for the three modes Node can speak natively — certificate,
 * password and OAuth. The agent is the one the ADT client uses, so the probe
 * presents the same credential the session does, which is what makes a 401 here
 * mean something.
 */
export function agentProbeTransport(
  agent: https.Agent,
  /**
   * Sent on every probe request. Password mode puts its Basic header here, for
   * the same reason certificate mode passes its agent: a probe that went out
   * without the credential would report `logon` for every system, including the
   * ones that are working.
   *
   * A function instead, when the credential is not a constant. OAuth mode passes
   * one that resolves the current access token, so a probe run hours after
   * startup carries a live one rather than the token the server booted with.
   */
  headers: Record<string, string> | (() => Promise<Record<string, string>>) = {}
): ProbeTransport {
  return async (url, timeoutMs) => {
    if (typeof headers !== "function") return probeWithHeaders(agent, url, timeoutMs, headers);

    try {
      return await probeWithHeaders(agent, url, timeoutMs, await headers());
    } catch (error) {
      // The credential could not be obtained, so nothing was sent. Reported as
      // its own class rather than as an unreachable SAP, which is a different
      // host and a different problem — see ProbeError.
      return {
        status: 0,
        headers: {},
        cookies: [],
        error: { code: "CREDENTIAL", message: (error as Error).message }
      };
    }
  };
}

function probeWithHeaders(
  agent: https.Agent,
  url: string,
  timeoutMs: number,
  headers: Record<string, string>
): Promise<HttpProbe> {
  return new Promise<HttpProbe>(resolve => {
    const request = https.request(url, { method: "GET", agent, timeout: timeoutMs, headers }, response => {
      // Drained so the keep-alive agent can reuse the socket.
      response.resume();
      response.on("end", () => {
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(response.headers)) {
          if (name === "set-cookie" || value === undefined) continue;
          headers[name] = Array.isArray(value) ? value.join(", ") : String(value);
        }
        resolve({
          status: response.statusCode ?? 0,
          headers,
          cookies: response.headers["set-cookie"] ?? []
        });
      });
    });

    // A probe never throws: an unreachable system is the answer, not an error.
    request.on("timeout", () => {
      request.destroy();
      resolve({ status: 0, headers: {}, cookies: [], error: { code: "TIMEOUT", message: `no answer within ${timeoutMs} ms` } });
    });
    request.on("error", (error: NodeJS.ErrnoException) => {
      resolve({ status: 0, headers: {}, cookies: [], error: describeNodeFailure(error) });
    });
    request.end();
  });
}

const TLS_CODES = [
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_HAS_EXPIRED", "EPROTO", "ECONNRESET"
];

export function describeNodeFailure(error: NodeJS.ErrnoException): ProbeError {
  const code = String(error.code ?? "");
  const message = error.message || code || "request failed";

  if (TLS_CODES.includes(code)) return { code: "TLS", message };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return { code: "DNS", message };
  if (code === "ETIMEDOUT") return { code: "TIMEOUT", message };
  if (["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH"].includes(code)) return { code: "CONNECT", message };
  return { code: "OTHER", message };
}
