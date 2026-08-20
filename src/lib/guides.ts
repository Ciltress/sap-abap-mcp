import fs from 'fs';
import path from 'path';

/**
 * The server's own documentation, exposed to clients both as MCP resources and
 * through the readServerGuide tool.
 *
 * Two ways out because they reach different consumers: resources are the
 * idiomatic MCP primitive but are typically *user*-attached in a client's UI, so
 * an agent will not discover them on its own. Tools are always in the agent's
 * context, so the tool is what actually lets an agent look something up
 * mid-task. Both read the same files through this module.
 */

export interface GuideDefinition {
    /** Stable id used by the tool and in the resource URI. */
    id: string;
    title: string;
    description: string;
    /** Path relative to the repository root. */
    file: string;
}

export const GUIDES: readonly GuideDefinition[] = [
    {
        // First on purpose: it is the cheapest useful thing to read, and the one
        // that answers the question an agent actually has — "which tool does this?"
        id: 'router',
        title: 'Which tool does what you want',
        file: 'docs/Tool-Router.md',
        description:
            'Intent to tool, in the words people use: "short dump", "where-used", "SE16", "my ' +
            'transports". Hand-written, and the right first stop when you know the job but not the ' +
            'tool name. Includes the terms that lead people to the wrong tool.'
    },
    {
        id: 'tool-reference',
        title: 'Every tool, with its arguments',
        file: 'docs/Tool-Reference.md',
        description:
            'All tools grouped by family, with argument names, types and which are required — ' +
            'generated from the tool definitions, so it cannot drift from the code. Ask for one ' +
            'family by section rather than reading it whole.'
    },
    {
        id: 'tools',
        title: 'Complete tool reference',
        file: 'docs/MCP-Tools.md',
        description:
            'Every tool with its argument schema, the golden-path workflows, ADT URI rules, the ' +
            'response and error model, and a troubleshooting matrix. The reference for using this server.'
    },
    {
        id: 'json-rpc',
        title: 'Calling RFC function modules (JSON-RPC)',
        file: 'docs/JSON-RPC.md',
        description:
            'Design and protocol record for the RFC path: the wire protocol read from /IWBEP/CL_JSRPC_*, ' +
            'why the members of a batch share one LUW, and the traps (silent lower-case keys, CHAR1 ' +
            'language keys, readable-but-not-callable signatures).'
    },
    {
        id: 'authentication',
        title: 'Authentication (Kerberos SSO and X.509 certificates)',
        file: 'docs/Authentication.md',
        description:
            'The two password-less logon modes: SPNEGO/Kerberos for a domain user, and an X.509 client ' +
            'certificate for a service or technical user that has none. Why certificate mode is mutual ' +
            'TLS rather than SNC, what SAP needs configured, and how a rejected certificate reads.'
    },
    {
        id: 'abap-skills',
        title: 'ABAP skills',
        file: 'docs/ABAP-Skills.md',
        description:
            'The 18 bundled SAP/ABAP skills, how each maps onto this server tools, and the gaps that ' +
            'closed - reading source by name, the authoritative syntax check, ATC runs.'
    },
    {
        id: 'development-skills',
        title: 'Development skills',
        file: 'docs/Development-Skills.md',
        description:
            'The 35 bundled general engineering skills (TDD, code review, diagnosing bugs, domain ' +
            'modelling, writing for agents), which are user-invoked, and which fit this repository.'
    },
    {
        id: 'agents',
        title: 'Working on this repository',
        file: 'AGENTS.md',
        description:
            'For agents changing this server rather than using it: layout, conventions, how to test, ' +
            'and how to work safely against a real SAP system.'
    }
];

/** URI scheme for the resource form of a guide. */
export const GUIDE_URI_PREFIX = 'abap-adt://guides/';

export const guideUri = (id: string) => `${GUIDE_URI_PREFIX}${id}`;

export function guideById(id: string): GuideDefinition | undefined {
    return GUIDES.find(g => g.id === String(id ?? '').trim().toLowerCase());
}

export function guideByUri(uri: string): GuideDefinition | undefined {
    const id = String(uri ?? '').startsWith(GUIDE_URI_PREFIX)
        ? String(uri).slice(GUIDE_URI_PREFIX.length)
        : undefined;
    return id ? guideById(id) : undefined;
}

/**
 * Repository root. This file compiles to dist/lib/guides.js and runs from
 * src/lib under ts-jest, and both are two levels below the root — so the same
 * relative hop works either way.
 */
const ROOT = path.resolve(__dirname, '..', '..');

export class GuideNotFoundError extends Error { }

export function readGuideFile(guide: GuideDefinition): string {
    const full = path.join(ROOT, guide.file);
    try {
        return fs.readFileSync(full, 'utf8');
    } catch {
        throw new GuideNotFoundError(
            `The guide '${guide.id}' is not readable at ${guide.file}. ` +
            `Documentation ships alongside the build; check the installation.`
        );
    }
}

export interface GuideSection {
    /** Heading number when the heading is numbered, e.g. '4.9'. */
    number?: string;
    /** Heading text without the leading #s and number. */
    title: string;
    /** 2 for '##', 3 for '###'. */
    level: number;
    /** Line index of the heading within the document. */
    line: number;
}

/** Markdown headings at level 2 and 3 — the granularity worth addressing. */
export function listSections(markdown: string): GuideSection[] {
    const sections: GuideSection[] = [];
    const lines = markdown.split(/\r?\n/);
    let inFence = false;

    lines.forEach((line, index) => {
        // Headings inside a fenced block are content, e.g. a '# comment' in a snippet.
        if (/^\s*```/.test(line)) inFence = !inFence;
        if (inFence) return;

        const heading = line.match(/^(#{2,3})\s+(.*)$/);
        if (!heading) return;

        const level = heading[1].length;
        const text = heading[2].trim();
        const numbered = text.match(/^(\d+(?:\.\d+)*)\.?\s+(.*)$/);

        sections.push({
            number: numbered?.[1],
            title: numbered ? numbered[2].trim() : text,
            level,
            line: index
        });
    });

    return sections;
}

/**
 * Finds one section by heading number ('4.9'), by a case-insensitive fragment of
 * its title, or by both ('6.2 the tools'). Returns the heading and everything
 * below it up to the next heading of the same or a higher level.
 */
export function extractSection(
    markdown: string,
    query: string
): { section: GuideSection; content: string } | undefined {
    const wanted = String(query ?? '').trim().toLowerCase();
    if (!wanted) return undefined;

    const sections = listSections(markdown);
    const match =
        // A bare number must match exactly, so '4' does not select '4.9'.
        sections.find(s => s.number && s.number === wanted) ??
        sections.find(s => s.title.toLowerCase() === wanted) ??
        sections.find(s => `${s.number ?? ''} ${s.title}`.trim().toLowerCase() === wanted) ??
        sections.find(s => s.title.toLowerCase().includes(wanted)) ??
        sections.find(s => !!s.number && s.number.startsWith(`${wanted}.`));

    if (!match) return undefined;

    const lines = markdown.split(/\r?\n/);
    const start = match.line;
    const next = sections.find(s => s.line > start && s.level <= match.level);
    const end = next ? next.line : lines.length;

    return { section: match, content: lines.slice(start, end).join('\n').trimEnd() };
}

/** One entry of the cheap index returned when no particular guide is asked for. */
export function guideIndex() {
    return GUIDES.map(guide => {
        let sections: { number?: string; title: string; level: number }[] = [];
        let bytes = 0;
        try {
            const text = readGuideFile(guide);
            bytes = Buffer.byteLength(text, 'utf8');
            sections = listSections(text).map(({ number, title, level }) => ({ number, title, level }));
        } catch {
            // A missing file must not break the whole index.
        }
        return {
            id: guide.id,
            title: guide.title,
            description: guide.description,
            uri: guideUri(guide.id),
            bytes,
            sections
        };
    });
}
