import {
    discoveryHrefs,
    evaluateGate,
    gatingEnabled,
    GATED_FEATURES
} from '../lib/collectionGate';
import { collectToolFamilies } from '../lib/toolDocs';

/** A discovery document shaped like the real one, carrying the given hrefs. */
const discoveryWith = (...hrefs: string[]) => [
    {
        title: 'Some category',
        collection: hrefs.map(href => ({ href, title: href, templateLinks: [] }))
    }
];

/**
 * The real catalogue, not a fixture.
 *
 * Which tools a feature gates is declared by the tools now, so testing against
 * the real definitions is what makes this suite notice a git tool that was added
 * — or renamed — without saying which feature it needs.
 */
const CATALOGUE = collectToolFamilies().flatMap(family => family.tools);

/** Same, with the catalogue supplied, since every real call has one. */
const gate = (discovery: any) => evaluateGate(discovery, CATALOGUE);

describe('discoveryHrefs', () => {
    it('reads collection hrefs and template links alike', () => {
        const hrefs = discoveryHrefs([
            {
                title: 'ATC',
                collection: [{
                    href: '/sap/bc/adt/atc/runs',
                    templateLinks: [{ template: '/sap/bc/adt/atc/runs{?worklistId}' }]
                }]
            }
        ]);
        expect(hrefs).toEqual(['/sap/bc/adt/atc/runs', '/sap/bc/adt/atc/runs{?worklistId}']);
    });

    it('survives every shape a missing or odd document can take', () => {
        expect(discoveryHrefs(undefined)).toEqual([]);
        expect(discoveryHrefs(null)).toEqual([]);
        expect(discoveryHrefs('not a document')).toEqual([]);
        expect(discoveryHrefs([{ title: 'empty' }])).toEqual([]);
        expect(discoveryHrefs([{ collection: [{ notAnHref: 1 }] }])).toEqual([]);
    });
});

describe('evaluateGate', () => {
    it('gates the abapGit tools when the system has no abapGit collection', () => {
        // DEV's real situation: gitRepos answers 400 and the discovery document
        // has no abapgit entry at all.
        const { unavailable, missing } = gate(discoveryWith('/sap/bc/adt/oo/classes'));

        expect(missing).toContain('abapgit');
        expect(unavailable.has('gitRepos')).toBe(true);
        expect(unavailable.has('pushRepo')).toBe(true);
        expect(unavailable.get('gitRepos')).toMatch(/does not expose/);
        // The message has to stop a retry, not just report a failure.
        expect(unavailable.get('gitRepos')).toMatch(/calling it again will not help/);
    });

    it('gates the service binding tools when business services are absent', () => {
        const { unavailable, missing } = gate(discoveryWith('/sap/bc/adt/oo/classes'));
        expect(missing).toContain('businessservices');
        expect(unavailable.has('publishServiceBinding')).toBe(true);
        expect(unavailable.has('bindingDetails')).toBe(true);
    });

    it('gates nothing when the collections are present', () => {
        const { unavailable, missing } = gate(discoveryWith(
            '/sap/bc/adt/abapgit/repos',
            '/sap/bc/adt/businessservices/odatav'
        ));
        expect(missing).toEqual([]);
        expect(unavailable.size).toBe(0);
    });

    it('matches a feature found only in a template link', () => {
        const { missing } = gate([{
            collection: [{
                href: '/sap/bc/adt/something',
                templateLinks: [{ template: '/sap/bc/adt/abapgit/repos/{key}' }]
            }, {
                href: '/sap/bc/adt/businessservices/generators'
            }]
        }]);
        expect(missing).toEqual([]);
    });

    it('gates NOTHING when discovery could not be read', () => {
        // The important one. A wrong "missing" verdict makes a working capability
        // vanish silently, which is far worse than a tool that returns an error.
        for (const empty of [undefined, null, [], 'nonsense', [{ collection: [] }]]) {
            const { unavailable, missing } = gate(empty);
            expect(unavailable.size).toBe(0);
            expect(missing).toEqual([]);
        }
    });

    it('describes every gated feature well enough to explain itself', () => {
        for (const feature of GATED_FEATURES) {
            expect(feature.hrefContains.startsWith('/sap/bc/adt/')).toBe(true);
            expect(feature.label.length).toBeGreaterThan(5);
        }
    });

    it('has at least one real tool declaring each feature', () => {
        // The direction that used to rot: a feature listing tool names could keep
        // naming a tool that had been renamed away, and gate nothing.
        for (const feature of GATED_FEATURES) {
            const claimants = CATALOGUE.filter(tool => tool.needsFeature === feature.id);
            expect(`${feature.id}: ${claimants.length} tool(s)`).not.toBe(`${feature.id}: 0 tool(s)`);
        }
    });

    it('never lets a tool need a feature that does not exist', () => {
        const ids = new Set(GATED_FEATURES.map(f => f.id));
        for (const tool of CATALOGUE) {
            if (!tool.needsFeature) continue;
            expect(`${tool.name} -> ${tool.needsFeature}`)
                .toBe(`${tool.name} -> ${ids.has(tool.needsFeature) ? tool.needsFeature : 'UNKNOWN FEATURE'}`);
        }
    });

    it('gates every abapGit tool the handler offers, not a hand-kept subset', () => {
        const { unavailable } = gate(discoveryWith('/sap/bc/adt/oo/classes'));
        const gitTools = CATALOGUE.filter(t => t.needsFeature === 'abapgit');

        expect(gitTools.length).toBe(10);
        for (const tool of gitTools) expect(unavailable.has(tool.name)).toBe(true);
    });
});

describe('gatingEnabled', () => {
    it('is on unless explicitly switched off', () => {
        expect(gatingEnabled({})).toBe(true);
        expect(gatingEnabled({ ABAP_MCP_GATE: 'on' })).toBe(true);
        expect(gatingEnabled({ ABAP_MCP_GATE: '' })).toBe(true);
    });

    it('accepts the usual ways of saying no', () => {
        for (const off of ['off', 'OFF', 'false', '0', 'no', ' off ']) {
            expect(gatingEnabled({ ABAP_MCP_GATE: off })).toBe(false);
        }
    });
});
