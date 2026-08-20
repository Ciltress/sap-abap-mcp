import { execFileSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { TLSSocket } from 'tls';
import { ADTClient } from 'abap-adt-api';

import { injectSsoSession } from '../sso';
import {
    bootstrapCertificateSession,
    createCertificateAgent,
    describeCertificate,
    describeTlsFailure,
    interpretBootstrapResponse,
    readCertificateConfig,
    resolveAuthMode,
    CertificateAuthError,
    type CertificateConfig
} from '../certauth';

/**
 * Certificate authentication, for service and technical users with no Kerberos
 * identity.
 *
 * The mutual-TLS block runs against a real local HTTPS server that demands a
 * client certificate, because that is the part worth proving: a unit test with
 * a stubbed socket would pass whether or not the certificate is ever presented.
 * Its fixtures are generated into a temp directory at run time — no key material
 * is committed — and it skips where openssl is unavailable.
 */

const OPENSSL = (() => {
    try {
        execFileSync('openssl', ['version'], { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
})();

const config = (over: Partial<CertificateConfig> = {}): CertificateConfig =>
    ({ file: 'C:\\SNC\\sec\\agent.p12', rejectUnauthorized: true, ...over });

describe('resolveAuthMode', () => {
    it('stays on Kerberos when nothing is configured', () => {
        expect(resolveAuthMode({})).toBe('kerberos');
    });

    it('switches to certificates when one is configured', () => {
        // Nobody points SAP_CERT_FILE at a file by accident.
        expect(resolveAuthMode({ SAP_CERT_FILE: 'agent.p12' })).toBe('certificate');
    });

    it('lets an explicit mode win over the presence of a certificate', () => {
        expect(resolveAuthMode({ SAP_AUTH_MODE: 'kerberos', SAP_CERT_FILE: 'agent.p12' })).toBe('kerberos');
        expect(resolveAuthMode({ SAP_AUTH_MODE: 'certificate' })).toBe('certificate');
    });

    it.each(['CERTIFICATE', 'cert', 'x509', 'pse'])('accepts %s as certificate mode', mode => {
        expect(resolveAuthMode({ SAP_AUTH_MODE: mode })).toBe('certificate');
    });

    it.each(['sso', 'spnego', 'negotiate'])('accepts %s as Kerberos mode', mode => {
        expect(resolveAuthMode({ SAP_AUTH_MODE: mode })).toBe('kerberos');
    });

    it('rejects a mode it does not know rather than guessing', () => {
        expect(() => resolveAuthMode({ SAP_AUTH_MODE: 'saml' }))
            .toThrow(/Unknown SAP_AUTH_MODE 'saml'/);
        // The message has to name every mode, or an unknown one sends the reader
        // looking for a mode that does exist.
        expect(() => resolveAuthMode({ SAP_AUTH_MODE: 'saml' }))
            .toThrow(/kerberos[\s\S]*certificate[\s\S]*oauth[\s\S]*password/);
    });

    it('takes password mode by name, including the spelling people reach for', () => {
        for (const spelling of ['password', 'basic', 'user', 'PASSWORD', ' basic ']) {
            expect(resolveAuthMode({ SAP_AUTH_MODE: spelling })).toBe('password');
        }
    });

    it.each(['oauth', 'oauth2', 'bearer', 'token', 'OAuth2'])('accepts %s as OAuth mode', mode => {
        expect(resolveAuthMode({ SAP_AUTH_MODE: mode })).toBe('oauth');
    });

    it('lets an OAuth configuration select the mode, the way a certificate does', () => {
        // Each of the three is enough on its own, because each names a different
        // valid shape: a client, a pre-minted token, and an endpoint.
        expect(resolveAuthMode({ SAP_OAUTH_CLIENT_ID: 'sb-agent!t1' })).toBe('oauth');
        expect(resolveAuthMode({ SAP_OAUTH_TOKEN: 'ey.abc' })).toBe('oauth');
        expect(resolveAuthMode({ SAP_OAUTH_TOKEN_URL: 'https://auth/token' })).toBe('oauth');
    });

    it('orders the heuristics from the credential that cannot lock a user to the one that can', () => {
        expect(resolveAuthMode({ SAP_PASSWORD: 'secret' })).toBe('password');
        // A certificate beats both. Preferring the password would silently pick
        // the mode that can lock the account over the one that cannot, which is
        // not a choice to make on someone's behalf.
        expect(resolveAuthMode({ SAP_PASSWORD: 'secret', SAP_CERT_FILE: '/x.p12' }))
            .toBe('certificate');
        expect(resolveAuthMode({ SAP_OAUTH_CLIENT_ID: 'sb-agent!t1', SAP_CERT_FILE: '/x.p12' }))
            .toBe('certificate');
        // OAuth sits between them for the same reason: its usual grant is a
        // client secret, not the password of a dialog user. A password set
        // alongside it is what the ROPC grant reads, not a second mode.
        expect(resolveAuthMode({ SAP_OAUTH_CLIENT_ID: 'sb-agent!t1', SAP_PASSWORD: 'secret' }))
            .toBe('oauth');
        // And an explicit mode still beats every heuristic.
        expect(resolveAuthMode({ SAP_PASSWORD: 'secret', SAP_AUTH_MODE: 'kerberos' }))
            .toBe('kerberos');
        expect(resolveAuthMode({ SAP_OAUTH_CLIENT_ID: 'sb-agent!t1', SAP_AUTH_MODE: 'kerberos' }))
            .toBe('kerberos');
    });
});

describe('readCertificateConfig', () => {
    let dir: string;
    let certFile: string;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'certcfg-'));
        certFile = path.join(dir, 'agent.p12');
        fs.writeFileSync(certFile, 'not a real certificate');
    });

    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('says what is missing when no certificate is configured', () => {
        expect(() => readCertificateConfig({ SAP_AUTH_MODE: 'certificate' }))
            .toThrow(/needs SAP_CERT_FILE/);
    });

    it('names the variable when a path is wrong', () => {
        expect(() => readCertificateConfig({ SAP_CERT_FILE: path.join(dir, 'nope.p12') }))
            .toThrow(/SAP_CERT_FILE points at [\s\S]*nope\.p12[\s\S]*cannot be read/);
    });

    it('checks the key and CA paths too', () => {
        expect(() => readCertificateConfig({ SAP_CERT_FILE: certFile, SAP_CERT_KEY_FILE: path.join(dir, 'no.key') }))
            .toThrow(/SAP_CERT_KEY_FILE/);
        expect(() => readCertificateConfig({ SAP_CERT_FILE: certFile, SAP_CA_FILE: path.join(dir, 'no.crt') }))
            .toThrow(/SAP_CA_FILE/);
    });

    it('reads the whole configuration', () => {
        expect(readCertificateConfig({ SAP_CERT_FILE: certFile, SAP_CERT_PASSPHRASE: 'pin' }))
            .toEqual({ file: certFile, keyFile: undefined, passphrase: 'pin', caFile: undefined, rejectUnauthorized: true });
    });

    it('honours NODE_TLS_REJECT_UNAUTHORIZED, like the Kerberos path', () => {
        // Our own agent does not inherit the global default, so it has to be read.
        expect(readCertificateConfig({ SAP_CERT_FILE: certFile, NODE_TLS_REJECT_UNAUTHORIZED: '0' }))
            .toMatchObject({ rejectUnauthorized: false });
        expect(readCertificateConfig({ SAP_CERT_FILE: certFile })).toMatchObject({ rejectUnauthorized: true });
    });

    it('treats an empty passphrase as none', () => {
        expect(readCertificateConfig({ SAP_CERT_FILE: certFile, SAP_CERT_PASSPHRASE: '' }))
            .toMatchObject({ passphrase: undefined });
    });
});

describe('interpretBootstrapResponse', () => {
    const ok = {
        'set-cookie': [
            'SAP_SESSIONID_DEV_100=abc123; path=/; HttpOnly',
            'sap-usercontext=sap-client=100; path=/'
        ],
        'x-csrf-token': 'TOKEN-123'
    };

    it('harvests the cookies and the CSRF token', () => {
        const session = interpretBootstrapResponse(200, ok);

        expect(session.csrfToken).toBe('TOKEN-123');
        expect([...session.cookies.keys()]).toEqual(['SAP_SESSIONID_DEV_100', 'sap-usercontext']);
        // Attributes stripped, value kept — this is what goes back out as a Cookie header.
        expect(session.cookies.get('SAP_SESSIONID_DEV_100')).toBe('SAP_SESSIONID_DEV_100=abc123');
        expect(session.cookies.get('sap-usercontext')).toBe('sap-usercontext=sap-client=100');
    });

    it('explains a rejected certificate instead of reporting a bare 401', () => {
        const certificate = { subject: 'CN=CLAUDEAGENT, O=ExampleOrg, C=DE', issuer: 'CN=ExampleOrg-SubCA02' };

        expect(() => interpretBootstrapResponse(401, {}, certificate))
            .toThrow(/CERTRULE/);

        try {
            interpretBootstrapResponse(401, {}, certificate);
        } catch (error: any) {
            // The subject is in the message because a mapping mismatch is the
            // usual cause, and comparing it to CERTRULE by eye is the fix.
            expect(error.message).toContain('CN=CLAUDEAGENT, O=ExampleOrg, C=DE');
            expect(error.message).toContain('icm/HTTPS/verify_client');
            expect(error.message).toContain('STRUST');
            // SNC0 governs RFC, and sending someone there for an HTTPS problem
            // costs an afternoon.
            expect(error.message).toMatch(/SNC0 ACL is not involved/);
        }
    });

    it('says so when no certificate was loaded at all', () => {
        expect(() => interpretBootstrapResponse(403, {}))
            .toThrow(/No client certificate was loaded/);
    });

    it('does not mistake an anonymous 200 for a session', () => {
        expect(() => interpretBootstrapResponse(200, { 'x-csrf-token': 'T' }))
            .toThrow(/no session cookie or CSRF token/);
        expect(() => interpretBootstrapResponse(200, { 'set-cookie': ['a=b'] }))
            .toThrow(/no session cookie or CSRF token/);
    });

    it('reports any other status plainly', () => {
        expect(() => interpretBootstrapResponse(500, {})).toThrow(/unexpected HTTP status 500/);
    });
});

describe('describeCertificate', () => {
    it('renders the DN in SAP order, so it can be compared with CERTRULE', () => {
        const info = describeCertificate({
            subject: { C: 'DE', O: 'ExampleOrg', OU: 'SAPsncClaudeCode', CN: 'CLAUDEAGENT' },
            issuer: { CN: 'ExampleOrg-SubCA02', O: 'ExampleOrg', C: 'DE' },
            valid_from: 'Jul  1 00:00:00 2026 GMT',
            valid_to: 'Jun 30 00:00:00 2029 GMT'
        });

        expect(info!.subject).toBe('CN=CLAUDEAGENT, OU=SAPsncClaudeCode, O=ExampleOrg, C=DE');
        expect(info!.issuer).toBe('CN=ExampleOrg-SubCA02, O=ExampleOrg, C=DE');
    });

    it('keeps every value of a repeated attribute', () => {
        const info = describeCertificate({ subject: { CN: 'X', OU: ['A', 'B'] }, issuer: {} });
        expect(info!.subject).toBe('CN=X, OU=A, OU=B');
    });

    it('counts the days left, which is what makes a three-year certificate visible', () => {
        const in90 = new Date(Date.now() + 90 * 86_400_000);
        const info = describeCertificate({ subject: { CN: 'X' }, issuer: {}, valid_to: in90.toUTCString() });

        expect(info!.daysUntilExpiry).toBeGreaterThanOrEqual(89);
        expect(info!.daysUntilExpiry).toBeLessThanOrEqual(90);
    });

    it('returns nothing when the socket had no local certificate', () => {
        // Node answers {} when none is configured, which is itself a diagnosis.
        expect(describeCertificate({})).toBeUndefined();
        expect(describeCertificate(null)).toBeUndefined();
    });
});

describe('describeTlsFailure', () => {
    it('reads a MAC verify failure as a wrong passphrase', () => {
        expect(describeTlsFailure(new Error('mac verify failure'), config()))
            .toMatch(/wrong or missing SAP_CERT_PASSPHRASE/);
    });

    it('recognises the legacy PKCS#12 encryption sapgenpse writes', () => {
        // OpenSSL 3 refuses RC2-40/3DES, and the raw message names neither.
        const error = Object.assign(new Error('error:0308010C:digital envelope routines::unsupported'), {
            code: 'ERR_OSSL_UNSUPPORTED'
        });

        const advice = describeTlsFailure(error, config());
        expect(advice).toMatch(/legacy RC2-40\/3DES/);
        expect(advice).toContain('openssl pkcs12 -legacy');
    });

    it('points at the file naming when a PKCS#12 is read as PEM', () => {
        expect(describeTlsFailure(new Error('error:0909006C:PEM routines:get_name:no start line'), config({ file: 'agent.cer' })))
            .toMatch(/must be named \.p12 or \.pfx/);
    });

    it('passes anything else through rather than inventing a cause', () => {
        expect(describeTlsFailure(new Error('something else entirely'), config()))
            .toMatch(/could not be loaded: something else entirely/);
    });
});

describe('bootstrapCertificateSession', () => {
    it('refuses a plain http URL, which cannot carry a certificate', async () => {
        await expect(bootstrapCertificateSession({
            baseUrl: 'http://sap.example.com:8000',
            agent: new https.Agent()
        })).rejects.toThrow(/needs an https URL/);
    });

    it('rejects a malformed SAP_URL', async () => {
        await expect(bootstrapCertificateSession({ baseUrl: 'not a url', agent: new https.Agent() }))
            .rejects.toThrow(/is not a valid URL/);
    });
});

(OPENSSL ? describe : describe.skip)('mutual TLS against a server that demands a certificate', () => {
    let dir: string;
    let server: https.Server;
    let baseUrl: string;
    /** What the server saw, so the assertions are about the handshake, not our own agent. */
    let seen: { subject: string; url: string };

    const openssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
    const file = (name: string) => path.join(dir, name);

    beforeAll(done => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'certauth-'));

        // A throwaway CA, a localhost server certificate and a client
        // certificate carrying the DN from the corporate naming convention.
        openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt',
            '-days', '2', '-subj', '/CN=Test CA');

        fs.writeFileSync(file('server.ext'), 'subjectAltName=DNS:localhost,IP:127.0.0.1\n');
        openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr',
            '-subj', '/CN=localhost');
        openssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-out', 'server.crt',
            '-days', '2', '-extfile', 'server.ext');

        openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'client.key', '-out', 'client.csr',
            '-subj', '/C=DE/O=ExampleOrg/OU=SAPsncClaudeCode/CN=CLAUDEAGENT');
        openssl('x509', '-req', '-in', 'client.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-out', 'client.crt',
            '-days', '2');

        // Both shapes the module supports: PEM with the key appended, and PKCS#12.
        fs.writeFileSync(file('client.pem'),
            fs.readFileSync(file('client.crt'), 'utf8') + fs.readFileSync(file('client.key'), 'utf8'));
        openssl('pkcs12', '-export', '-in', 'client.crt', '-inkey', 'client.key', '-out', 'client.p12',
            '-passout', 'pass:pse-pin');

        server = https.createServer(
            {
                key: fs.readFileSync(file('server.key')),
                cert: fs.readFileSync(file('server.crt')),
                ca: fs.readFileSync(file('ca.crt')),
                // What icm/HTTPS/verify_client = 2 does.
                requestCert: true,
                rejectUnauthorized: true
            },
            (req, res) => {
                const peer = (req.socket as TLSSocket).getPeerCertificate();
                seen = { subject: (peer as any)?.subject?.CN ?? '', url: req.url ?? '' };
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

    it('presents a PKCS#12 certificate and comes back with a session', async () => {
        const agent = createCertificateAgent({
            file: file('client.p12'), passphrase: 'pse-pin', caFile: file('ca.crt'), rejectUnauthorized: true
        });

        const session = await bootstrapCertificateSession({ baseUrl, client: '100', language: 'EN', agent });

        // The server only answers at all because the handshake carried the certificate.
        expect(seen.subject).toBe('CLAUDEAGENT');
        expect(seen.url).toContain('sap-client=100');
        expect(seen.url).toContain('sap-language=EN');

        expect(session.csrfToken).toBe('CSRF-FROM-SERVER');
        expect([...session.cookies.keys()]).toEqual(['SAP_SESSIONID_DEV_100', 'sap-usercontext']);
        expect(session.certificate?.subject).toBe('CN=CLAUDEAGENT, OU=SAPsncClaudeCode, O=ExampleOrg, C=DE');
        expect(session.certificate?.daysUntilExpiry).toBeGreaterThanOrEqual(0);

        agent.destroy();
    });

    it('accepts a PEM holding the certificate and key together', async () => {
        const agent = createCertificateAgent({
            file: file('client.pem'), caFile: file('ca.crt'), rejectUnauthorized: true
        });

        const session = await bootstrapCertificateSession({ baseUrl, agent });

        expect(seen.subject).toBe('CLAUDEAGENT');
        expect(session.csrfToken).toBe('CSRF-FROM-SERVER');

        agent.destroy();
    });

    it('accepts a PEM whose key is in a separate file', async () => {
        const agent = createCertificateAgent({
            file: file('client.crt'), keyFile: file('client.key'), caFile: file('ca.crt'), rejectUnauthorized: true
        });

        await expect(bootstrapCertificateSession({ baseUrl, agent })).resolves.toBeDefined();

        agent.destroy();
    });

    it('fails at agent creation on a wrong passphrase, not on the first call', async () => {
        expect(() => createCertificateAgent({
            file: file('client.p12'), passphrase: 'wrong', rejectUnauthorized: true
        })).toThrow(CertificateAuthError);

        expect(() => createCertificateAgent({
            file: file('client.p12'), passphrase: 'wrong', rejectUnauthorized: true
        })).toThrow(/SAP_CERT_PASSPHRASE/);
    });

    it('explains an untrusted server certificate as a server problem', async () => {
        // No caFile, so the throwaway CA is unknown: this is the "unable to get
        // local issuer certificate" that internal CAs cause, and it is not about
        // the client certificate at all.
        const agent = createCertificateAgent({
            file: file('client.p12'), passphrase: 'pse-pin', rejectUnauthorized: true
        });

        await expect(bootstrapCertificateSession({ baseUrl, agent }))
            .rejects.toThrow(/The \*server\* certificate .* was not trusted/);

        agent.destroy();
    });

    it('keeps presenting the certificate on ADT calls, not just on the logon', async () => {
        // The half that is easy to get wrong: with icm/HTTPS/verify_client = 2
        // every handshake needs the certificate, so the agent has to be on the
        // ADT client and not only on the bootstrap request.
        const agent = createCertificateAgent({
            file: file('client.p12'), passphrase: 'pse-pin', caFile: file('ca.crt'), rejectUnauthorized: true
        });
        const adtClient = new ADTClient(baseUrl, 'CLAUDEAGENT', 'unused-sso-placeholder', '100', 'EN',
            { httpsAgent: agent });

        const session = await bootstrapCertificateSession({ baseUrl, client: '100', agent });
        injectSsoSession(adtClient, session);
        seen = { subject: '', url: '' };

        await adtClient.httpClient.request('/sap/bc/adt/discovery', {});

        expect(seen.subject).toBe('CLAUDEAGENT');
        expect(seen.url).toBe('/sap/bc/adt/discovery');

        agent.destroy();
    });

    it('connects anyway when certificate checking is switched off', async () => {
        const agent = createCertificateAgent({
            file: file('client.p12'), passphrase: 'pse-pin', rejectUnauthorized: false
        });

        await expect(bootstrapCertificateSession({ baseUrl, agent })).resolves.toBeDefined();

        agent.destroy();
    });
});
