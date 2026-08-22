import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * server.json — the MCP registry manifest — held against the code it describes.
 *
 * This exists because of what it found. The manifest declared `SAP_PASSWORD` as
 * required *and* secret, for a server whose entire premise is that there is no
 * password: no source file has ever read that variable, and every document says
 * so in as many words. Nothing checked, so it survived a fork, a rewrite of both
 * logon modes and two releases — a published manifest telling clients to collect
 * a credential this server cannot use, while the eleven variables it does read
 * went undeclared.
 *
 * So the rule is the one `toolDocs.test.ts` applies to the tool reference: what
 * ships has to agree with the code, and disagreeing fails the build rather than
 * reaching a registry. Both directions matter — an undeclared variable is a
 * feature nobody can configure, and a declared one that nothing reads is a lie.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'server.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const npmPackage = manifest.packages[0];
const declared: Array<{ name: string; isRequired?: boolean; isSecret?: boolean; description?: string }> =
    npmPackage.environmentVariables;
const declaredNames = declared.map(v => v.name);

/**
 * Every environment variable src/ actually reads, tests excluded — they set
 * variables that are inputs to a fixture rather than to the server.
 *
 * The two access shapes in this codebase are `env.NAME` (an injected
 * NodeJS.ProcessEnv, which is how nearly everything reads) and
 * `process.env.NAME`. Both end in `env.NAME`, so one pattern covers them.
 */
function environmentVariablesReadBySource(): Set<string> {
    const found = new Set<string>();

    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== '__tests__') walk(full);
                continue;
            }
            if (!entry.name.endsWith('.ts')) continue;
            for (const match of fs.readFileSync(full, 'utf8').matchAll(/\benv(?:\.|\[["'])([A-Z][A-Z_0-9]{2,})/g)) {
                found.add(match[1]);
            }
        }
    };

    walk(path.join(ROOT, 'src'));
    return found;
}

/**
 * Read by the server but deliberately absent from the manifest. Empty today, and
 * an entry here should carry the reason: the container-only Kerberos variables
 * (SAP_KRB_*, KRB5CCNAME, KRB5_CONFIG) are *not* candidates, because they are
 * read by docker-entrypoint.sh rather than by the npm package this section
 * describes.
 */
const DELIBERATELY_UNDECLARED: string[] = [];

describe('server.json', () => {
    it('parses, and identifies the package package.json publishes', () => {
        expect(manifest.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
        expect(manifest.version).toBe(packageJson.version);
        expect(npmPackage.identifier).toBe(packageJson.name);
        expect(npmPackage.version).toBe(packageJson.version);
        expect(npmPackage.transport.type).toBe('stdio');
    });

    it('keeps the description inside the 100 characters the registry schema allows', () => {
        expect(manifest.description.length).toBeGreaterThan(0);
        expect(manifest.description.length).toBeLessThanOrEqual(100);
    });

    it('declares every environment variable the server reads, and no others', () => {
        const read = environmentVariablesReadBySource();

        const undeclared = [...read]
            .filter(name => !declaredNames.includes(name))
            .filter(name => !DELIBERATELY_UNDECLARED.includes(name));
        const unread = declaredNames.filter(name => !read.has(name));

        expect({ undeclared, unread }).toEqual({ undeclared: [], unread: [] });
    });

    it('keeps every password optional, and marked as the secret it is', () => {
        // This used to assert no password existed at all, when both logon modes
        // were password-less. Password mode was added for systems that offer
        // neither Kerberos nor certificates, so the invariant is now narrower but
        // still worth holding: a password is something a server can be given, not
        // something it asks for.
        //
        // isRequired would make every client collect one, including the modes
        // whose entire point is that there is nothing to collect.
        const secrets = declared.filter(v => /PASSWORD|PASSWD|SECRET$/.test(v.name));
        expect(secrets.map(v => v.name)).toEqual(['SAP_PASSWORD', 'SAP_OAUTH_CLIENT_SECRET']);

        for (const secret of secrets) {
            expect(secret.isSecret).toBe(true);
            expect(secret.isRequired).toBeFalsy();
        }
    });

    it('says in the password description what choosing it costs', () => {
        // The one property of this mode a reader has to know before picking it,
        // and the manifest is where a client surfaces the choice.
        const password = declared.find(v => v.name === 'SAP_PASSWORD');
        expect(password?.description).toMatch(/lock/i);
    });

    it('says the same about the OAuth client secret, which locks a user the same way', () => {
        // Not obvious, and the reason it has to be written down: an OAuth 2.0
        // client on AS ABAP is a user in SU01, so a wrong secret is a failed
        // logon against login/fails_to_user_lock exactly as a wrong password is.
        const secret = declared.find(v => v.name === 'SAP_OAUTH_CLIENT_SECRET');
        expect(secret?.description).toMatch(/lock/i);
    });

    it('requires exactly what the server refuses to start without', () => {
        const source = fs.readFileSync(path.join(ROOT, 'src/server.ts'), 'utf8');
        const check = /const missingVars = \[([^\]]*)\]/.exec(source);

        // Not a soft assertion: if this moved, the manifest's isRequired flags
        // are no longer being compared with anything, and saying so is the point.
        expect(check).not.toBeNull();

        const enforced = [...check![1].matchAll(/'([A-Z_0-9]+)'/g)].map(m => m[1]).sort();
        const required = declared.filter(v => v.isRequired).map(v => v.name).sort();

        expect(required).toEqual(enforced);
    });

    it('marks every credential secret, and nothing that is not one', () => {
        // The three OAuth entries are all credentials in their own right: a token
        // is a bearer credential by definition, and a refresh token is the means
        // of minting more of them.
        expect(declared.filter(v => v.isSecret).map(v => v.name).sort())
            .toEqual([
                'SAP_CERT_PASSPHRASE',
                'SAP_OAUTH_CLIENT_SECRET',
                'SAP_OAUTH_REFRESH_TOKEN',
                'SAP_OAUTH_TOKEN',
                'SAP_PASSWORD'
            ]);
    });

    it('offers no default for SAP_AUTH_MODE', () => {
        // Kerberos is the fallback, but it is conditional: resolveAuthMode()
        // picks certificate mode whenever SAP_CERT_FILE is set, OAuth whenever an
        // OAuth client is, and password mode whenever SAP_PASSWORD is. A client
        // that materialised a "kerberos" default into the environment would turn
        // that fallback into an override and silently disable all three for
        // anyone who configured one and nothing else.
        const authMode = declared.find(v => v.name === 'SAP_AUTH_MODE') as any;
        expect(authMode.choices).toEqual(['kerberos', 'certificate', 'oauth', 'password']);
        expect(authMode.default).toBeUndefined();
    });
});
