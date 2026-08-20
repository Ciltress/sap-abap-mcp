import fs from "fs";
import https from "https";
import tls from "tls";
import { URL } from "url";
import type { SsoSession } from "./sso.js";

/**
 * X.509 client-certificate authentication, for service and technical users that
 * have no Kerberos identity.
 *
 * The Kerberos path (./sso.ts) shells out to `curl --negotiate` because Node
 * cannot do SPNEGO. A client certificate needs no such help: it is presented in
 * the TLS handshake, which Node does natively — so this module talks to SAP
 * directly.
 *
 * Note this is *not* SNC. SNC secures the RFC protocol; ADT is HTTPS, so the
 * equivalent is mutual TLS. The certificate and PSE are the same, but the
 * SAP-side configuration differs: the SNC0 ACL plays no part, the ICM must ask
 * for a client certificate (`icm/HTTPS/verify_client` >= 1) and the issuing CA
 * must be in the server's SSL PSE trust list (STRUST). The certificate-to-user
 * mapping is the same CERTRULE rule either way. See docs/Authentication.md.
 *
 * Both paths end in the same place: SAP session cookies plus a CSRF token,
 * injected into the ADT client by injectSsoSession(). No password anywhere.
 */

export type AuthMode = "kerberos" | "certificate" | "password" | "oauth";

/** Where the client certificate lives and how to open it. */
export interface CertificateConfig {
  /** PKCS#12 (.p12/.pfx) or PEM file holding the certificate. */
  file: string;
  /** Separate PEM private key, when it is not in `file`. */
  keyFile?: string;
  /** PSE PIN / PKCS#12 password, or the PEM key passphrase. */
  passphrase?: string;
  /** Extra CA bundle for verifying the *server*, e.g. an internal root CA. */
  caFile?: string;
  rejectUnauthorized: boolean;
}

/** The identity this server presents, for diagnostics and expiry warnings. */
export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom?: string;
  validTo?: string;
  daysUntilExpiry?: number;
}

export interface CertificateSession extends SsoSession {
  certificate?: CertificateInfo;
}

export interface CertificateSessionConfig {
  baseUrl: string;
  client?: string;
  language?: string;
  /** The agent carrying the client certificate — the same one the ADT client uses. */
  agent: https.Agent;
  bootstrapPath?: string;
  timeoutMs?: number;
}

export class CertificateAuthError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "CertificateAuthError";
  }
}

/**
 * Which authentication to use. An explicit SAP_AUTH_MODE wins; otherwise a
 * configured SAP_CERT_FILE selects certificate mode, since nobody points that
 * at a file by accident.
 *
 * OAuth 2.0 and SAP_PASSWORD select their modes the same way, but the order is
 * not arbitrary. It runs from the credential that cannot lock a SAP user to the
 * one that can: a configuration carrying both a certificate and a password is
 * one that has been *given* a certificate, and silently preferring the password
 * would pick the mode that can lock the account over the one that cannot. OAuth
 * sits between them for the same reason — its usual grant is a client secret,
 * not a user password.
 */
export function resolveAuthMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  const explicit = String(env.SAP_AUTH_MODE ?? "").trim().toLowerCase();
  if (explicit) {
    if (["certificate", "cert", "x509", "pse"].includes(explicit)) return "certificate";
    if (["kerberos", "sso", "spnego", "negotiate"].includes(explicit)) return "kerberos";
    if (["password", "basic", "user"].includes(explicit)) return "password";
    if (["oauth", "oauth2", "bearer", "token"].includes(explicit)) return "oauth";
    throw new CertificateAuthError(
      `Unknown SAP_AUTH_MODE '${env.SAP_AUTH_MODE}'. Use 'kerberos' (SPNEGO SSO), 'certificate' ` +
      `(X.509), 'oauth' (OAuth 2.0 bearer token) or 'password' (HTTP Basic).`,
    );
  }
  if (env.SAP_CERT_FILE) return "certificate";
  if (env.SAP_OAUTH_CLIENT_ID || env.SAP_OAUTH_TOKEN || env.SAP_OAUTH_TOKEN_URL) return "oauth";
  if (env.SAP_PASSWORD) return "password";
  return "kerberos";
}

export function readCertificateConfig(env: NodeJS.ProcessEnv = process.env): CertificateConfig {
  const file = String(env.SAP_CERT_FILE ?? "").trim();
  if (!file) {
    throw new CertificateAuthError(
      "Certificate authentication needs SAP_CERT_FILE — the PKCS#12 (.p12/.pfx) or PEM file " +
      "holding the client certificate and its private key.",
    );
  }

  const keyFile = String(env.SAP_CERT_KEY_FILE ?? "").trim() || undefined;
  const caFile = String(env.SAP_CA_FILE ?? "").trim() || undefined;

  mustBeReadable(file, "SAP_CERT_FILE");
  if (keyFile) mustBeReadable(keyFile, "SAP_CERT_KEY_FILE");
  if (caFile) mustBeReadable(caFile, "SAP_CA_FILE");

  return {
    file,
    keyFile,
    passphrase: String(env.SAP_CERT_PASSPHRASE ?? "") || undefined,
    caFile,
    // The same escape hatch the Kerberos path uses for internal CAs.
    rejectUnauthorized: env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
  };
}

function mustBeReadable(file: string, variable: string): void {
  try {
    fs.accessSync(file, fs.constants.R_OK);
  } catch (error) {
    throw new CertificateAuthError(`${variable} points at '${file}', which cannot be read.`, error);
  }
}

const isPkcs12 = (file: string) => /\.(p12|pfx)$/i.test(file);

/** The key material, in whichever of the two forms the files are in. */
function credentials(cfg: CertificateConfig): tls.SecureContextOptions {
  const ca = cfg.caFile ? fs.readFileSync(cfg.caFile) : undefined;

  if (isPkcs12(cfg.file)) {
    return { pfx: fs.readFileSync(cfg.file), passphrase: cfg.passphrase, ca };
  }
  return {
    cert: fs.readFileSync(cfg.file),
    // A PEM export normally carries certificate and key in one file.
    key: fs.readFileSync(cfg.keyFile ?? cfg.file),
    passphrase: cfg.passphrase,
    ca,
  };
}

/**
 * The agent every request goes out on — the bootstrap here and, once it is
 * handed to ADTClient, all ADT and JSON-RPC traffic. It has to be all of them:
 * with `icm/HTTPS/verify_client = 2` the ICM demands a certificate on every
 * handshake, not just the one that logs on.
 */
export function createCertificateAgent(cfg: CertificateConfig): https.Agent {
  const material = credentials(cfg);

  // Parse it now. Otherwise a wrong passphrase or an unsupported PKCS#12
  // surfaces as a confusing failure on the first tool call instead of a clear
  // one at startup.
  try {
    tls.createSecureContext(material);
  } catch (error) {
    throw new CertificateAuthError(describeTlsFailure(error, cfg), error);
  }

  return new https.Agent({ keepAlive: true, rejectUnauthorized: cfg.rejectUnauthorized, ...material });
}

/** Turns OpenSSL's wording into the thing that is actually wrong. */
export function describeTlsFailure(error: unknown, cfg: CertificateConfig): string {
  const message = String((error as any)?.message ?? error);
  const code = String((error as any)?.code ?? "");

  if (/mac verify failure|bad decrypt|wrong final block length|bad password/i.test(message)) {
    return `The certificate in '${cfg.file}' could not be opened — wrong or missing SAP_CERT_PASSPHRASE ` +
      `(for a PSE export this is the PSE PIN).`;
  }

  if (code === "ERR_OSSL_UNSUPPORTED" || /digital envelope routines.*unsupported/i.test(message)) {
    return `'${cfg.file}' uses a PKCS#12 encryption that OpenSSL ${process.versions.openssl} refuses ` +
      `(the legacy RC2-40/3DES algorithms sapgenpse writes by default). Re-wrap it:\n` +
      `  openssl pkcs12 -legacy -in "${cfg.file}" -nodes -out cert.pem\n` +
      `  openssl pkcs12 -export -in cert.pem -out cert-modern.p12\n` +
      `or point SAP_CERT_FILE at the PEM directly.`;
  }

  if (/no start line|PEM routines|DECODER routines/i.test(message)) {
    return `'${cfg.file}' is not readable as PEM. A PKCS#12 file must be named .p12 or .pfx so it is ` +
      `opened as one; a DER file has to be converted first (certutil -encode).`;
  }

  return `The client certificate in '${cfg.file}' could not be loaded: ${message}`;
}

/**
 * Logs on by presenting the certificate and harvests the session, mirroring
 * what bootstrapSsoSession() does over curl.
 */
export async function bootstrapCertificateSession(
  cfg: CertificateSessionConfig,
): Promise<CertificateSession> {
  const path = cfg.bootstrapPath ?? "/sap/bc/adt/compatibility/graph";
  let url: URL;
  try {
    url = new URL(`${cfg.baseUrl}${path}`);
  } catch (error) {
    throw new CertificateAuthError(`SAP_URL '${cfg.baseUrl}' is not a valid URL.`, error);
  }

  if (url.protocol !== "https:") {
    throw new CertificateAuthError(
      `Certificate authentication needs an https URL, but SAP_URL is '${cfg.baseUrl}'. The certificate ` +
      `is presented during the TLS handshake, so plain http cannot carry it.`,
    );
  }

  if (cfg.client) url.searchParams.set("sap-client", cfg.client);
  if (cfg.language) url.searchParams.set("sap-language", cfg.language);

  const timeoutMs = cfg.timeoutMs ?? 15000;

  return new Promise<CertificateSession>((resolve, reject) => {
    const request = https.request(
      url,
      { method: "GET", agent: cfg.agent, headers: { "x-csrf-token": "fetch" }, timeout: timeoutMs },
      response => {
        const certificate = readLocalCertificate(response.socket as tls.TLSSocket);
        // Nothing here needs the body, but it has to be drained for the socket
        // to be reusable by the keep-alive agent.
        response.resume();
        response.on("end", () => {
          try {
            resolve(interpretBootstrapResponse(response.statusCode ?? 0, response.headers as any, certificate));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy();
      reject(new CertificateAuthError(`No answer from ${url.host} within ${timeoutMs} ms.`));
    });
    request.on("error", error => reject(describeConnectionFailure(error, url)));
    request.end();
  });
}

/**
 * The session, or the reason there is none. Split out from the request so the
 * status handling is testable without a SAP system.
 */
export function interpretBootstrapResponse(
  status: number,
  headers: Record<string, string | string[] | undefined>,
  certificate?: CertificateInfo,
): CertificateSession {
  if (status === 401 || status === 403) {
    throw new CertificateAuthError(rejectionAdvice(status, certificate));
  }
  if (status < 200 || status >= 300) {
    throw new CertificateAuthError(`Certificate logon: unexpected HTTP status ${status}.`);
  }

  const cookies = new Map<string, string>();
  for (const raw of toArray(headers["set-cookie"])) {
    const cleaned = raw.replace(/path=\/,/g, "").replace(/path=\//g, "").split(";")[0].trim();
    cookies.set(cleaned.split("=", 1)[0], cleaned);
  }

  const csrfToken = String(first(headers["x-csrf-token"]) ?? "").trim();

  if (cookies.size === 0 || !csrfToken) {
    throw new CertificateAuthError(
      "Certificate logon: HTTP 200 but no session cookie or CSRF token in the response. " +
      "The ICF node answered anonymously — check that it requires a logon.",
    );
  }

  return { cookies, csrfToken, certificate };
}

/** What to look at when SAP refuses the certificate. */
function rejectionAdvice(status: number, certificate?: CertificateInfo): string {
  const presented = certificate?.subject
    ? `The certificate loaded here is '${certificate.subject}' (issued by '${certificate.issuer}').`
    : "No client certificate was loaded for this connection at all.";

  return [
    `SAP rejected the client certificate (HTTP ${status}). ${presented}`,
    "",
    "The four things that have to be true, in the order they are usually wrong:",
    "  1. CERTRULE maps this exact subject to a SAP user (explicit mapping is simplest).",
    "  2. The ICM asks for a certificate on this port: VCLIENT=1 or 2 in the port's",
    "     icm/server_port_<n>, which overrides the global icm/HTTPS/verify_client.",
    "  3. The issuing CA is in the server's SSL PSE certificate list (STRUST).",
    "  4. The ICF node allows certificate logon.",
    "",
    "Note the SNC0 ACL is not involved: that governs SNC/RFC, and ADT is HTTPS.",
  ].join("\n");
}

function describeConnectionFailure(error: NodeJS.ErrnoException, url: URL): CertificateAuthError {
  const code = String(error.code ?? "");

  if (["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"].includes(code)) {
    return new CertificateAuthError(
      `The *server* certificate of ${url.host} was not trusted (${code}). This is about verifying SAP, ` +
      `not about your client certificate: point SAP_CA_FILE at the issuing root CA, or set ` +
      `NODE_TLS_REJECT_UNAUTHORIZED=0 for development.`,
      error,
    );
  }

  if (code === "ECONNRESET" || code === "EPROTO") {
    return new CertificateAuthError(
      `The TLS handshake with ${url.host} failed (${code}). If the ICM requires client certificates, ` +
      `this is what a certificate it will not accept looks like — check the issuing CA is trusted in ` +
      `STRUST and that the certificate has not expired.`,
      error,
    );
  }

  return new CertificateAuthError(`Certificate logon to ${url.host} failed: ${error.message}`, error);
}

/**
 * The certificate this process presents, read off the live socket. It says what
 * was loaded rather than what SAP accepted, which is exactly what is needed to
 * check a DN against the CERTRULE mapping — and to notice an expiry coming.
 */
export function readLocalCertificate(socket: tls.TLSSocket | undefined): CertificateInfo | undefined {
  const raw = typeof socket?.getCertificate === "function" ? socket.getCertificate() : undefined;
  return describeCertificate(raw);
}

export function describeCertificate(raw: any): CertificateInfo | undefined {
  if (!raw || !raw.subject) return undefined;

  const validTo = raw.valid_to ? Date.parse(raw.valid_to) : NaN;

  return {
    subject: formatDn(raw.subject),
    issuer: formatDn(raw.issuer),
    validFrom: raw.valid_from,
    validTo: raw.valid_to,
    daysUntilExpiry: Number.isNaN(validTo)
      ? undefined
      : Math.floor((validTo - Date.now()) / 86_400_000),
  };
}

/**
 * Node hands back the DN as an object. Rendered in SAP's order (CN first), so it
 * can be compared with a CERTRULE entry by eye.
 */
function formatDn(parts: any): string {
  if (typeof parts === "string") return parts;
  if (!parts || typeof parts !== "object") return "";

  const preferred = ["CN", "OU", "O", "L", "ST", "C"];
  const keys = [...preferred.filter(k => k in parts), ...Object.keys(parts).filter(k => !preferred.includes(k))];

  return keys
    .flatMap(key => toArray(parts[key]).map(value => `${key}=${value}`))
    .join(", ");
}

const toArray = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;
