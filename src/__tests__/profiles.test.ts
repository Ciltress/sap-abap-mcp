import {
    applyProfile,
    resolveProfile,
    DEFAULT_PROFILE,
    PROFILES,
    PROFILE_NAMES,
    ProfileError
} from '../lib/profiles';
import type { ProfileName } from '../lib/profiles';
import type { ToolDefinition } from '../types/tools';
import * as handlers from '../handlers/index.js';

const tool = (name: string): ToolDefinition => ({
    name,
    description: `does ${name}`,
    inputSchema: { type: 'object', properties: {} }
});

describe('resolveProfile', () => {
    it('defaults to all when unset, so an existing setup is unchanged', () => {
        expect(resolveProfile({})).toBe(DEFAULT_PROFILE);
        expect(resolveProfile({ ABAP_MCP_PROFILE: '' })).toBe('all');
        expect(resolveProfile({ ABAP_MCP_PROFILE: '   ' })).toBe('all');
    });

    it('accepts every defined profile, case- and space-insensitively', () => {
        for (const name of PROFILE_NAMES) {
            expect(resolveProfile({ ABAP_MCP_PROFILE: name.toUpperCase() })).toBe(name);
            expect(resolveProfile({ ABAP_MCP_PROFILE: ` ${name} ` })).toBe(name);
        }
    });

    it('throws on an unknown name rather than falling back', () => {
        // Falling back to `all` would hand 138 tools to something that asked for
        // 11, which is the exact failure profiles exist to prevent.
        expect(() => resolveProfile({ ABAP_MCP_PROFILE: 'minimal' })).toThrow(ProfileError);
        expect(() => resolveProfile({ ABAP_MCP_PROFILE: 'minimal' })).toThrow(/core, analyst, rfc, dev, all/);
    });
});

describe('applyProfile', () => {
    const tools = [
        tool('readAbapObject'),
        tool('setObjectSource'),
        tool('debuggerStep'),
        tool('readServerGuide')
    ];

    it('returns everything for all', () => {
        expect(applyProfile('all', tools)).toHaveLength(4);
    });

    it('keeps only the profile members, in tools/list order', () => {
        const kept = applyProfile('core', [
            tool('debuggerStep'),
            tool('readAbapObject'),
            tool('editAbapSource'),
            tool('searchPackages'),
            tool('nodeContents'),
            tool('syntaxCheckCode'),
            tool('tableContents'),
            tool('readServerGuide'),
            tool('readSkill')
        ]).map(t => t.name);

        expect(kept).not.toContain('debuggerStep');
        expect(kept).toHaveLength(8);
        // Order follows the input, not the profile definition.
        expect(kept[0]).toBe('readAbapObject');
    });

    it('throws when a profile names a tool no handler provides', () => {
        // A rename that misses profiles.ts must break the build, not silently
        // drop the tool from every profile that listed it.
        expect(() => applyProfile('core', [tool('readAbapObject')])).toThrow(ProfileError);
        expect(() => applyProfile('core', [tool('readAbapObject')])).toThrow(/Update src\/lib\/profiles\.ts/);
    });
});

describe('profile definitions', () => {
    const named = (name: ProfileName) => PROFILES[name].tools ?? [];

    it('gives every profile the guides and skills, which is what weak models rely on', () => {
        for (const name of PROFILE_NAMES) {
            const tools = named(name);
            if (!tools.length) continue; // `all` has them by definition
            expect(tools).toContain('readServerGuide');
            expect(tools).toContain('readSkill');
        }
    });

    it('gives core a complete edit cycle', () => {
        // A profile that can lock but not activate can start an edit it cannot
        // finish, which is worse than one that cannot edit at all. core gets the
        // whole cycle as one tool, which is also the version that cannot be
        // half-performed by a model that loses track of the order.
        expect(named('core')).toContain('editAbapSource');
    });

    it('gives dev the steps as well as the whole cycle', () => {
        // Some edits genuinely need them apart — writing several objects under one
        // lock, or leaving a change inactive to activate as a group.
        for (const step of ['editAbapSource', 'lock', 'setObjectSource', 'activateByName', 'unLock']) {
            expect(named('dev')).toContain(step);
        }
    });

    it('makes analyst read-only, as a boundary rather than a hint', () => {
        for (const write of ['editAbapSource', 'setObjectSource', 'lock', 'unLock', 'activateByName',
            'deleteObject', 'createObject']) {
            expect(named('analyst')).not.toContain(write);
        }
        expect(named('analyst')).toContain('callFunctionViaJsonRpc');
    });

    it('makes dev a superset of core', () => {
        for (const name of named('core')) expect(named('dev')).toContain(name);
    });

    it('keeps every ADT-backed tool out of rfc', () => {
        // The profile's whole claim is that everything it lists still answers when
        // SAP refuses this user /sap/bc/adt/*. One ADT tool in here and an agent
        // is back to retrying calls that will never succeed.
        for (const adtOnly of ['readAbapObject', 'searchPackages', 'nodeContents', 'tableContents',
            'runQuery', 'getObjectSource', 'syntaxCheckCode', 'readShortDumps', 'editAbapSource']) {
            expect(named('rfc')).not.toContain(adtOnly);
        }
    });

    it('gives rfc the JSON-RPC route and the tools that ride on it', () => {
        for (const overRfc of ['callFunctionViaJsonRpc', 'callFunctionsViaJsonRpc',
            'checkJsonRpcEndpoint', 'describeAbapTable', 'readProfileParameters',
            'checkLogonConfiguration', 'listLoggedOnUsers']) {
            expect(named('rfc')).toContain(overRfc);
        }
    });

    it('lists no tool twice', () => {
        for (const name of PROFILE_NAMES) {
            const tools = named(name);
            expect(new Set(tools).size).toBe(tools.length);
        }
    });

    it('describes every profile', () => {
        for (const name of PROFILE_NAMES) {
            expect(PROFILES[name].description.length).toBeGreaterThan(30);
        }
    });
});

describe('profiles against the real handlers', () => {
    it('names only tools the handlers actually provide', () => {
        // Guards the rename step: every profile member must exist somewhere.
        // Read from the handlers barrel rather than by scanning the directory —
        // ESM has no synchronous require for a path computed at run time.
        const available = new Set<string>();
        for (const key of Object.keys(handlers)) {
            const ctor = (handlers as Record<string, any>)[key];
            if (typeof ctor !== 'function' || !ctor.prototype?.getTools) continue;
            let tools: ToolDefinition[] = [];
            try {
                tools = Object.create(ctor.prototype).getTools() ?? [];
            } catch {
                continue;
            }
            for (const t of tools) available.add(t.name);
        }

        expect(available.size).toBeGreaterThan(100);

        const missing = PROFILE_NAMES.flatMap(name =>
            (PROFILES[name].tools ?? [])
                .filter(toolName => !available.has(toolName))
                .map(toolName => `${name}: ${toolName}`)
        );
        expect(missing).toEqual([]);
    });
});
