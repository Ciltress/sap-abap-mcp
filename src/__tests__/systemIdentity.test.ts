import {
    describeSystem,
    parseSessionCookies,
    resolveSystemIdentity,
    serverInstructions
} from '../lib/systemIdentity';

/**
 * Which system a server speaks for.
 *
 * The fixtures use the cookie names DEV actually sets, because the whole
 * observed half rests on SAP putting the system id and client in the session
 * cookie name.
 */
const DEV_COOKIES = ['SPNegoTokenRequested', 'sap-usercontext', 'MYSAPSSO2', 'SAP_SESSIONID_DEV_100'];

describe('parseSessionCookies', () => {
    it('reads the system and client SAP names in the session cookie', () => {
        expect(parseSessionCookies(DEV_COOKIES)).toEqual({ systemId: 'DEV', client: '100' });
    });

    it('ignores the other cookies of the logon', () => {
        expect(parseSessionCookies(['MYSAPSSO2', 'sap-usercontext'])).toEqual({});
    });

    it('is not fooled by a cookie that merely starts the same way', () => {
        expect(parseSessionCookies(['SAP_SESSIONID_DEV', 'SAP_SESSIONID_TOOLONG_100'])).toEqual({});
    });

    it('upper-cases the system id', () => {
        expect(parseSessionCookies(['SAP_SESSIONID_dev_010'])).toEqual({ systemId: 'DEV', client: '010' });
    });

    it('copes with no session at all', () => {
        expect(parseSessionCookies(undefined)).toEqual({});
        expect(parseSessionCookies([])).toEqual({});
    });
});

describe('resolveSystemIdentity', () => {
    it('takes the declaration when there is no session yet', () => {
        // The state at construction time, which is when instructions are built.
        const identity = resolveSystemIdentity({ SAP_SYSTEM_ID: 'dev', SAP_CLIENT: '100' });

        expect(identity).toMatchObject({
            declaredSystemId: 'DEV', systemId: 'DEV', client: '100', observedSystemId: undefined
        });
        expect(identity.mismatch).toBeUndefined();
    });

    it('prefers what SAP said over what the configuration claims', () => {
        const identity = resolveSystemIdentity({ SAP_SYSTEM_ID: 'DEV', SAP_CLIENT: '100' }, DEV_COOKIES);

        expect(identity).toMatchObject({ systemId: 'DEV', client: '100', observedSystemId: 'DEV' });
        expect(identity.mismatch).toBeUndefined();
    });

    it('fills in the system id when none was configured', () => {
        const identity = resolveSystemIdentity({ SAP_CLIENT: '100' }, DEV_COOKIES);

        expect(identity.declaredSystemId).toBeUndefined();
        expect(identity.systemId).toBe('DEV');
    });

    it('catches a server pointed at the wrong system', () => {
        // Every tool would work perfectly — on the wrong system. This is the
        // failure the observed half exists to catch.
        const identity = resolveSystemIdentity(
            { SAP_SYSTEM_ID: 'DEV', SAP_CLIENT: '100' },
            ['SAP_SESSIONID_P01_100']
        );

        expect(identity.systemId).toBe('P01');
        expect(identity.mismatch).toMatch(/SAP_SYSTEM_ID says DEV but the session is on P01/);
        expect(identity.mismatch).toMatch(/tools act on P01\/100/);
    });

    it('catches the wrong client too', () => {
        const identity = resolveSystemIdentity(
            { SAP_SYSTEM_ID: 'DEV', SAP_CLIENT: '200' },
            DEV_COOKIES
        );

        expect(identity.mismatch).toMatch(/SAP_CLIENT says 200 but the session is on 100/);
        expect(identity.client).toBe('100');
    });

    it('reports both when both are wrong', () => {
        const identity = resolveSystemIdentity(
            { SAP_SYSTEM_ID: 'DEV', SAP_CLIENT: '200' },
            ['SAP_SESSIONID_P01_100']
        );

        expect(identity.mismatch).toMatch(/SAP_SYSTEM_ID says DEV.*SAP_CLIENT says 200/);
    });

    it('does not call 100 and 0100 a mismatch', () => {
        // SAP_CLIENT is commonly written without its leading zeros.
        expect(resolveSystemIdentity({ SAP_CLIENT: '10' }, ['SAP_SESSIONID_DEV_010']).mismatch)
            .toBeUndefined();
        expect(resolveSystemIdentity({ SAP_CLIENT: '010' }, ['SAP_SESSIONID_DEV_010']).mismatch)
            .toBeUndefined();
    });

    it('says nothing about a declaration it cannot check', () => {
        // No session, so no evidence either way — silence beats a false alarm.
        expect(resolveSystemIdentity({ SAP_SYSTEM_ID: 'DEV' }).mismatch).toBeUndefined();
    });

    it('survives an empty environment', () => {
        expect(resolveSystemIdentity({})).toEqual({
            declaredSystemId: undefined, declaredClient: undefined,
            observedSystemId: undefined, observedClient: undefined,
            systemId: undefined, client: undefined
        });
    });
});

describe('describeSystem', () => {
    it('reads as SAP writes it', () => {
        expect(describeSystem({ systemId: 'DEV', client: '100' })).toBe('DEV/100');
    });

    it('degrades rather than printing undefined', () => {
        expect(describeSystem({ systemId: 'DEV' })).toBe('DEV');
        expect(describeSystem({ client: '100' })).toBe('(unknown system)/100');
        expect(describeSystem({})).toBe('(unknown system)');
    });
});

describe('serverInstructions', () => {
    it('names the system and client a client is connecting to', () => {
        const text = serverInstructions(
            resolveSystemIdentity({ SAP_SYSTEM_ID: 'DEV', SAP_CLIENT: '100' }),
            'https://sapdev.example.com:44301'
        );

        expect(text).toContain('**DEV**');
        expect(text).toContain('client 100');
        expect(text).toContain('https://sapdev.example.com:44301');
    });

    it('says the binding is fixed, which is what makes routing necessary', () => {
        const text = serverInstructions(resolveSystemIdentity({ SAP_SYSTEM_ID: 'DEV', SAP_CLIENT: '100' }));

        expect(text).toMatch(/cannot switch system or client at runtime/);
        expect(text).toMatch(/use the MCP server configured for that one/);
        // Better to say nothing is registered than to act on the wrong system.
        expect(text).toMatch(/say so rather than acting here/);
    });

    it('falls back to the URL when no system id is configured', () => {
        const text = serverInstructions(resolveSystemIdentity({ SAP_CLIENT: '100' }), 'https://sap.example.com');

        expect(text).toContain('client 100');
        expect(text).toContain('https://sap.example.com');
        // And says how to find out, rather than pretending it knows.
        expect(text).toMatch(/No SAP_SYSTEM_ID is configured/);
        expect(text).toMatch(/healthcheck/);
    });

    it('still produces something usable with nothing configured', () => {
        const text = serverInstructions(resolveSystemIdentity({}));

        expect(text).toContain('the configured URL');
        expect(text).toMatch(/No SAP_SYSTEM_ID is configured/);
    });
});
