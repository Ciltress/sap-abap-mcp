import { execFile } from "child_process";
import { promisify } from "util";
import { URLSearchParams } from "url";

const execFileAsync = promisify(execFile);
const DEVNULL = process.platform === "win32" ? "NUL" : "/dev/null";

// Pinned to the Windows system curl.exe (Schannel/SSPI backend) rather than
// relying on PATH resolution, since a Git-Bash-bundled curl.exe earlier in
// PATH would shadow it in some shells.
const DEFAULT_CURL_PATH = process.platform === "win32"
  ? "C:\\Windows\\System32\\curl.exe"
  : "curl";

/**
 * Which curl to run. Shared with ./reachability.ts, whose probe has to go out
 * over the same binary as the logon — a probe that succeeded on a different curl
 * would prove nothing about the one that failed.
 */
export function resolveCurlPath(explicit?: string): string {
  return explicit ?? process.env.SSO_CURL_PATH ?? DEFAULT_CURL_PATH;
}

export interface SsoSession {
  cookies: Map<string, string>;
  csrfToken: string;
}

export interface SsoConfig {
  baseUrl: string;
  client: string;
  language: string;
  curlPath?: string;
  insecureTls?: boolean;
  bootstrapPath?: string;
  timeoutMs?: number;
}

export class SsoBootstrapError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SsoBootstrapError";
  }
}

/**
 * Runs one `curl --negotiate` request against a lightweight ADT endpoint to
 * harvest SAP session cookies + a CSRF token, using the current Windows
 * user's Kerberos ticket (SPNEGO/SSO) instead of Basic Auth. No password
 * involved.
 *
 * Verified live against S11 (sapdev.example.com:44352, client 010):
 *   curl -k --negotiate -u : -D - -o NUL -s -H "x-csrf-token: fetch" <url>
 *   -> HTTP/1.1 200, set-cookie: SAP_SESSIONID_S11_010=..., x-csrf-token: <token>
 */
export async function bootstrapSsoSession(cfg: SsoConfig): Promise<SsoSession> {
  const qs = new URLSearchParams();
  if (cfg.client) qs.set("sap-client", cfg.client);
  if (cfg.language) qs.set("sap-language", cfg.language);
  const path = cfg.bootstrapPath ?? "/sap/bc/adt/compatibility/graph";
  const url = `${cfg.baseUrl}${path}?${qs.toString()}`;

  const args = [
    "--negotiate", "-u", ":",
    "-D", "-", "-o", DEVNULL, "-s", "-S",
    "-H", "x-csrf-token: fetch",
    "--max-time", String(Math.ceil((cfg.timeoutMs ?? 15000) / 1000)),
  ];
  if (cfg.insecureTls) args.push("-k");
  args.push(url);

  const curlPath = resolveCurlPath(cfg.curlPath);

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(curlPath, args, { windowsHide: true }));
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new SsoBootstrapError(
        `curl nicht gefunden ('${curlPath}'). SPNEGO-SSO braucht curl mit Schannel/GSS-Support. ` +
        `Pfad ggf. über SSO_CURL_PATH konfigurieren.`,
        err,
      );
    }
    throw new SsoBootstrapError(`SSO-Bootstrap curl-Aufruf fehlgeschlagen: ${err.message}`, err);
  }

  return interpretSsoResponse(stdout);
}

/**
 * Reads the session out of curl's dumped response headers.
 *
 * Separated from the subprocess for the same reason `interpretBootstrapResponse`
 * is separate in ./certauth.ts: everything that can actually go wrong here — a
 * missing ticket, a 200 with no cookie, SAP's `path=/` inside the cookie value —
 * is a property of the text, and welding it to `execFile` meant none of it could
 * be tested without a domain-joined machine.
 */
export function interpretSsoResponse(stdout: string): SsoSession {
  const lines = String(stdout ?? "").split(/\r?\n/);
  const statusMatch = (lines[0] ?? "").match(/HTTP\/\d(?:\.\d)?\s+(\d+)/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;

  // 401 and 403 were handled together here, and both were reported as a Kerberos
  // failure. That is wrong for a 403 and cost two days: SAP returns it *before*
  // offering a logon, so no credential was ever examined — on DEV the ADT ICF
  // node was simply not active, while klist showed a perfectly good ticket.
  // ./reachability.ts proves which layer it was; this says only what the status
  // itself supports.
  if (status === 403) {
    throw new SsoBootstrapError(
      `SAP refused the request before offering a logon (HTTP 403), so no credential was examined ` +
      `and this is not a ticket problem. The ICF node is very likely inactive: check SICF for ` +
      `/default_host/sap/bc/adt, and any Web Dispatcher permission table in front of this port.`,
    );
  }
  if (status === 401) {
    // Falling back to Basic means SAP received a token and would not map it to a
    // user; a bare Negotiate challenge means none was ever sent.
    const tokenRejected = /^www-authenticate:\s*basic/im.test(String(stdout ?? ""));
    throw new SsoBootstrapError(
      tokenRejected
        ? `SAP received a Kerberos token and rejected it (HTTP 401), then offered Basic ` +
          `authentication instead. The ticket did reach SAP, so klist will look healthy: check that ` +
          `the user exists and is unlocked in this client, and that its SPNEGO/USREXTID mapping is ` +
          `maintained.`
        : `SPNEGO/Kerberos authentication failed (SAP: HTTP 401) and no token was sent. Likely ` +
          `causes: no valid Kerberos ticket (check klist), or the domain/VPN is not connected.`,
    );
  }
  if (status < 200 || status >= 300) {
    throw new SsoBootstrapError(`SSO-Bootstrap: unerwarteter HTTP-Status ${status}.`);
  }

  const cookies = new Map<string, string>();
  let csrfToken = "";
  for (const line of lines) {
    const cm = line.match(/^set-cookie:\s*(.+)$/i);
    if (cm) {
      const cleaned = cm[1].replace(/path=\/,/g, "").replace(/path=\//g, "").split(";")[0].trim();
      cookies.set(cleaned.split("=", 1)[0], cleaned);
    }
    const tm = line.match(/^x-csrf-token:\s*(.+)$/i);
    if (tm) csrfToken = tm[1].trim();
  }

  if (cookies.size === 0 || !csrfToken) {
    throw new SsoBootstrapError("SSO-Bootstrap: HTTP 200 aber kein Cookie/CSRF-Token in der Antwort.");
  }
  return { cookies, csrfToken };
}

/**
 * Injects a bootstrapped SSO session into a live ADTClient's underlying
 * AdtHTTP instance, bypassing Basic Auth entirely for all subsequent
 * requests.
 *
 * `cookie` is declared `private` in AdtHTTP's TypeScript source, but TS
 * privacy is not enforced at runtime — it's a real, mutable Map on the
 * compiled JS object. `csrfToken` is a public getter/setter (backed by
 * commonHeaders['x-csrf-token']), so setting it here also flips
 * AdtHTTP.loggedin to true (loggedin = csrfToken !== "fetch"), which
 * prevents AdtHTTP.request() from calling login() (and thus from ever
 * using the placeholder password) on the next tool call.
 */
export function injectSsoSession(adtClient: { httpClient: any }, session: SsoSession): void {
  const http = adtClient.httpClient;
  const cookieMap: Map<string, string> = (http as any).cookie;
  cookieMap.clear();
  for (const [k, v] of session.cookies) cookieMap.set(k, v);
  http.csrfToken = session.csrfToken;
}
