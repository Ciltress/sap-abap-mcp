import {
    basicAuthHeader,
    interpretPasswordResponse,
    PasswordAuthError,
    readPasswordConfig
} from '../passwordauth';

/**
 * Password mode is the one logon that can damage the system it talks to: every
 * rejected attempt counts against login/fails_to_user_lock, and the account it
 * locks is shared. So what is tested here is mostly restraint — that a refusal
 * is marked permanent, and that the credential does not turn up anywhere it
 * should not.
 */

const ENV = { SAP_USER: 'CLAUDEAGENT', SAP_PASSWORD: 'hunter2' };

describe('readPasswordConfig', () => {
    it('reads the user and the password', () => {
        const cfg = readPasswordConfig(ENV);
        expect(cfg.user).toBe('CLAUDEAGENT');
        expect(cfg.password).toBe('hunter2');
        expect(cfg.rejectUnauthorized).toBe(true);
    });

    it('needs a user, and says which variable is missing', () => {
        expect(() => readPasswordConfig({ SAP_PASSWORD: 'x' })).toThrow(/SAP_USER/);
    });

    it('points at the two safer modes when there is no password', () => {
        // The message is the only place someone reaching for password mode is
        // told the alternatives exist.
        expect(() => readPasswordConfig({ SAP_USER: 'X' })).toThrow(/SAP_PASSWORD/);
        expect(() => readPasswordConfig({ SAP_USER: 'X' })).toThrow(/SAP_CERT_FILE/);
    });

    it('keeps a password that is only whitespace, since SAP might accept it', () => {
        // Trimming it would turn a working credential into a confusing failure.
        expect(readPasswordConfig({ SAP_USER: 'X', SAP_PASSWORD: '  ' }).password).toBe('  ');
    });

    it('follows NODE_TLS_REJECT_UNAUTHORIZED like the other modes', () => {
        expect(readPasswordConfig({ ...ENV, NODE_TLS_REJECT_UNAUTHORIZED: '0' }).rejectUnauthorized)
            .toBe(false);
    });
});

describe('basicAuthHeader', () => {
    it('is a base64 Basic header', () => {
        expect(basicAuthHeader('USER', 'pass')).toBe('Basic ' + Buffer.from('USER:pass').toString('base64'));
    });

    it('handles a password with non-ASCII characters', () => {
        // Latin-1 would mangle these, and the failure would present as a wrong
        // password — i.e. as a locked account.
        const header = basicAuthHeader('USER', 'pä€ß');
        const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString('utf8');
        expect(decoded).toBe('USER:pä€ß');
    });
});

describe('interpretPasswordResponse', () => {
    const ok = {
        'set-cookie': ['SAP_SESSIONID_DEV_100=abc; path=/', 'sap-usercontext=sap-client=100; path=/'],
        'x-csrf-token': 'token-value'
    };

    it('harvests the cookies and the token', () => {
        const session = interpretPasswordResponse(200, ok, 'USER');
        expect(session.csrfToken).toBe('token-value');
        expect([...session.cookies.keys()].sort()).toEqual(['SAP_SESSIONID_DEV_100', 'sap-usercontext']);
    });

    it('marks a rejected password permanent, so nothing retries it', () => {
        // The property this whole module is arranged around: a retry here is a
        // second failed logon, and three of them lock the user.
        try {
            interpretPasswordResponse(401, {}, 'CLAUDEAGENT');
            expect.fail('expected a rejection');
        } catch (error) {
            expect(error).toBeInstanceOf(PasswordAuthError);
            expect((error as PasswordAuthError).permanent).toBe(true);
        }
    });

    it('names the user and the lock policy in the 401', () => {
        expect(() => interpretPasswordResponse(401, {}, 'CLAUDEAGENT'))
            .toThrow(/CLAUDEAGENT/);
        expect(() => interpretPasswordResponse(401, {}, 'CLAUDEAGENT'))
            .toThrow(/login\/fails_to_user_lock/);
    });

    it('never puts the password in the error', () => {
        // The error is logged and shown to a client; the credential is not.
        try {
            interpretPasswordResponse(401, {}, 'CLAUDEAGENT');
        } catch (error) {
            expect((error as Error).message).not.toContain('hunter2');
        }
    });

    it('separates 403 from 401: the password worked, the authorisation did not', () => {
        // Reading a 403 as a bad password is what sends someone to reset a
        // password that was right, and spend logon attempts proving it.
        try {
            interpretPasswordResponse(403, {}, 'CLAUDEAGENT');
            expect.fail('expected a rejection');
        } catch (error) {
            expect((error as PasswordAuthError).permanent).toBe(true);
            expect((error as Error).message).toMatch(/S_DEVELOP/);
            expect((error as Error).message).not.toMatch(/password is wrong/i);
        }
    });

    it('does not mark a transient failure permanent', () => {
        // A 500 is worth trying again; it costs no logon attempt.
        try {
            interpretPasswordResponse(500, {}, 'USER');
            expect.fail('expected a rejection');
        } catch (error) {
            expect((error as PasswordAuthError).permanent).toBe(false);
        }
    });

    it('rejects a 200 that carried no session, rather than returning an empty one', () => {
        expect(() => interpretPasswordResponse(200, {}, 'USER')).toThrow(/anonymously/);
        expect(() => interpretPasswordResponse(200, { 'x-csrf-token': 't' }, 'USER')).toThrow();
    });
});
