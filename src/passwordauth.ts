import fs from "fs";
import https from "https";
import { URL } from "url";
import type { SsoSession } from "./sso.js";

/**
 * User and password, over HTTP Basic.
 *
 * The other two modes exist largely to avoid this one, and the reason is in
 * docs/Authentication.md: a failed Basic Auth attempt counts against
 * `login/fails_to_user_lock`, so a wrong password here locks the SAP user for
 * every consumer of it — not just this server. Kerberos and client certificates
 * carry no such hazard, which is why they stay the default.
 *
 * It is here anyway because not every system has either. A sandbox, a trial, a
 * system outside the corporate domain, or a partner system reached over the
 * internet has a user and a password and nothing else, and refusing to talk to
 * those helps nobody.
 *
 * Two things this deliberately does not do, both of them about the lock:
 *
 *  - **It never retries a rejected credential.** One attempt per session. The
 *    session-expiry retry in server.ts re-runs `establish()` on a 401, which is
 *    right when a session has aged out and catastrophic when the password is
 *    simply wrong — three tool calls would be three failed logons. `permanent`
 *    on the error is what stops that.
 *  - **The password reaches SAP and nothing else.** It is not logged, not put in
 *    the URL where it would land in an ICM trace, and not included in the error.
 */

export interface PasswordConfig {
  user: string;
  password: string;
  /** Extra CA bundle for verifying the *server*, as in the other modes. */
  caFile?: string;
  rejectUnauthorized: boolean;
}

export interface PasswordSessionConfig {
  baseUrl: string;
  client?: string;
  language?: string;
  agent: https.Agent;
  user: string;
  password: string;
  bootstrapPath?: string;
  timeoutMs?: number;
}

export class PasswordAuthError extends Error {
  /**
   * True when trying again with the same credential cannot help and would cost
   * another failed logon. Read by the retry in server.ts, which is the whole
   * point of distinguishing it.
   */
  constructor(message: string, public readonly permanent = false, public readonly cause?: unknown) {
    super(message);
    this.name = "PasswordAuthError";
  }
}

export function readPasswordConfig(env: NodeJS.ProcessEnv = process.env): PasswordConfig {
  const user = String(env.SAP_USER ?? "").trim();
  const password = String(env.SAP_PASSWORD ?? "");

  if (!user) {
    throw new PasswordAuthError(
      "Password authentication needs SAP_USER — the SAP user to log on as.",
    );
  }
  if (!password) {
    throw new PasswordAuthError(
      "Password authentication needs SAP_PASSWORD. Leave it unset to use Kerberos (SAP_AUTH_MODE=" +
      "kerberos) or a client certificate (SAP_CERT_FILE), neither of which can lock the account.",
    );
  }

  const caFile = String(env.SAP_CA_FILE ?? "").trim() || undefined;
  if (caFile) {
    try {
      fs.accessSync(caFile, fs.constants.R_OK);
    } catch (error) {
      throw new PasswordAuthError(`SAP_CA_FILE points at '${caFile}', which cannot be read.`, false, error);
    }
  }

  return {
    user,
    password,
    caFile,
    rejectUnauthorized: env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
  };
}

/**
 * The agent every request goes out on. No client certificate here — the only
 * reason this exists rather than using Node's default is the CA bundle and the
 * `rejectUnauthorized` escape hatch, which the other two modes also have.
 */
export function createPasswordAgent(cfg: PasswordConfig): https.Agent {
  return new https.Agent({
    keepAlive: true,
    rejectUnauthorized: cfg.rejectUnauthorized,
    ca: cfg.caFile ? fs.readFileSync(cfg.caFile) : undefined,
  });
}

export const basicAuthHeader = (user: string, password: string): string =>
  `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;

/**
 * Logs on with Basic and harvests the session, mirroring the other two modes.
 * Once this returns, the cookies and CSRF token carry every later request and
 * the password is not sent again.
 */
export async function bootstrapPasswordSession(
  cfg: PasswordSessionConfig,
): Promise<SsoSession> {
  const path = cfg.bootstrapPath ?? "/sap/bc/adt/compatibility/graph";
  let url: URL;
  try {
    url = new URL(`${cfg.baseUrl}${path}`);
  } catch (error) {
    throw new PasswordAuthError(`SAP_URL '${cfg.baseUrl}' is not a valid URL.`, false, error);
  }

  if (url.protocol !== "https:") {
    throw new PasswordAuthError(
      `SAP_URL is '${cfg.baseUrl}'. A password sent over plain http crosses the network in base64, ` +
      `which is not encryption — use https, or Kerberos where there is no password to expose.`,
    );
  }

  if (cfg.client) url.searchParams.set("sap-client", cfg.client);
  if (cfg.language) url.searchParams.set("sap-language", cfg.language);

  const timeoutMs = cfg.timeoutMs ?? 15000;

  return new Promise<SsoSession>((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        agent: cfg.agent,
        timeout: timeoutMs,
        headers: {
          "x-csrf-token": "fetch",
          authorization: basicAuthHeader(cfg.user, cfg.password),
        },
      },
      response => {
        response.resume();
        response.on("end", () => {
          try {
            resolve(interpretPasswordResponse(
              response.statusCode ?? 0,
              response.headers as any,
              cfg.user,
            ));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy();
      reject(new PasswordAuthError(`No answer from ${url.host} within ${timeoutMs} ms.`));
    });
    request.on("error", error => reject(describeConnectionFailure(error as NodeJS.ErrnoException, url)));
    request.end();
  });
}

/**
 * The session, or the reason there is none. Split out from the request so the
 * status handling is testable without a SAP system — and so the one case that
 * must not be retried is decided in a place a test can reach.
 */
export function interpretPasswordResponse(
  status: number,
  headers: Record<string, string | string[] | undefined>,
  user: string,
): SsoSession {
  if (status === 401) {
    throw new PasswordAuthError(
      `SAP rejected the password for '${user}' (HTTP 401).\n\n` +
      `This attempt counted against login/fails_to_user_lock, so it will not be retried — a second ` +
      `and third would lock the user for everything that uses it, not just this server.\n\n` +
      `Usually, in order:\n` +
      `  1. The password is wrong, or has expired and must be changed in SAP GUI first.\n` +
      `  2. The user does not exist in this client, or is locked already (SU01).\n` +
      `  3. The user type forbids it: a System user cannot log on interactively.`,
      true,
    );
  }
  if (status === 403) {
    throw new PasswordAuthError(
      `SAP accepted the logon and refused the resource (HTTP 403). The password is right; this user ` +
      `is missing an authorisation — S_DEVELOP for the ADT nodes. See docs/Authentication.md, and ` +
      `note ABAP_MCP_RFC_FALLBACK if the RFC tools alone would be useful.`,
      true,
    );
  }
  if (status < 200 || status >= 300) {
    throw new PasswordAuthError(`Password logon: unexpected HTTP status ${status}.`);
  }

  const cookies = new Map<string, string>();
  for (const raw of toArray(headers["set-cookie"])) {
    const cleaned = raw.replace(/path=\/,/g, "").replace(/path=\//g, "").split(";")[0].trim();
    cookies.set(cleaned.split("=", 1)[0], cleaned);
  }

  const csrfToken = String(first(headers["x-csrf-token"]) ?? "").trim();

  if (cookies.size === 0 || !csrfToken) {
    throw new PasswordAuthError(
      "Password logon: HTTP 200 but no session cookie or CSRF token in the response. " +
      "The ICF node answered anonymously — check that it requires a logon.",
    );
  }

  return { cookies, csrfToken };
}

function describeConnectionFailure(error: NodeJS.ErrnoException, url: URL): PasswordAuthError {
  const code = String(error.code ?? "");

  if (["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"].includes(code)) {
    return new PasswordAuthError(
      `The server certificate of ${url.host} was not trusted (${code}). Point SAP_CA_FILE at the ` +
      `issuing root CA, or set NODE_TLS_REJECT_UNAUTHORIZED=0 for development. Note this matters ` +
      `more here than in the other modes: without it there is nothing proving the host being sent ` +
      `a password is really SAP.`,
      false,
      error,
    );
  }

  return new PasswordAuthError(`Password logon to ${url.host} failed: ${error.message}`, false, error);
}

const toArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;
