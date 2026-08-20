import fs from 'fs';
import path from 'path';

/**
 * Agent skills bundled under skills/, discovered from disk and served the same
 * two ways as the guides: as MCP resources and through the readSkill tool.
 *
 * A "collection" is one directory under skills/ — normally a cloned upstream
 * repository, e.g. skills/Development or skills/ABAP. Inside it, every
 * directory containing a SKILL.md is one skill. The nesting between the
 * collection's own `skills/` folder and the skill differs per collection
 * (Development groups by category, ABAP does not), so discovery walks rather
 * than assuming a fixed depth.
 *
 * Nothing here is required at runtime: a missing skills/ directory simply means
 * no skills are offered.
 */

export interface Skill {
    /** Collection id, lower-cased directory name, e.g. 'development'. */
    collection: string;
    /** Directory name of the collection as it is on disk, e.g. 'Development'. */
    collectionDir: string;
    /** Grouping between the collection's skills/ folder and the skill, may be ''. */
    category: string;
    /** `name` from the SKILL.md frontmatter. */
    name: string;
    /** `description` from the frontmatter — what tells an agent when to use it. */
    description: string;
    /** Skill directory, relative to the repository root. */
    dir: string;
    /** Supporting files beside SKILL.md, relative to the skill directory. */
    files: string[];
}

export const SKILL_URI_PREFIX = 'abap-adt://skills/';

export const skillUri = (skill: Pick<Skill, 'collection' | 'name'>) =>
    `${SKILL_URI_PREFIX}${skill.collection}/${skill.name}`;

/** Repository root — this file sits two levels below it in both src/ and dist/. */
const ROOT = path.resolve(__dirname, '..', '..');
const SKILLS_ROOT = path.join(ROOT, 'skills');

/**
 * Minimal YAML front matter reader: the `key: value` pairs at the top level of
 * the leading `---` block. Enough for `name` and `description`, which is all a
 * SKILL.md is required to carry, and tolerant of quoting.
 */
export function parseFrontmatter(markdown: string): Record<string, string> {
    const block = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!block) return {};

    const fields: Record<string, string> = {};
    let current: string | undefined;

    for (const line of block[1].split(/\r?\n/)) {
        const pair = line.match(/^([A-Za-z][\w-]*):\s?(.*)$/);
        if (pair) {
            current = pair[1];
            fields[current] = pair[2].trim();
            continue;
        }
        // A folded continuation line belongs to the previous key.
        if (current && /^\s+\S/.test(line)) {
            fields[current] = `${fields[current]} ${line.trim()}`.trim();
        }
    }

    for (const key of Object.keys(fields)) {
        fields[key] = fields[key].replace(/^["'](.*)["']$/, '$1').trim();
    }
    return fields;
}

function walkForSkills(dir: string, onFound: (skillDir: string) => void): void {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }

    if (entries.some(e => e.isFile() && e.name === 'SKILL.md')) {
        onFound(dir);
        // A skill's own subdirectories are its supporting files, not more skills.
        return;
    }

    for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
            walkForSkills(path.join(dir, entry.name), onFound);
        }
    }
}

/** Supporting files beside SKILL.md, relative to the skill directory. */
function supportingFiles(skillDir: string): string[] {
    const found: string[] = [];
    const walk = (dir: string, prefix: string) => {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(path.join(dir, entry.name), relative);
            else if (entry.name !== 'SKILL.md') found.push(relative);
        }
    };
    walk(skillDir, '');
    return found.sort();
}

let cache: Skill[] | undefined;

/** Discovers every skill under skills/. Cached; call resetSkillCache() in tests. */
export function discoverSkills(): Skill[] {
    if (cache) return cache;

    const skills: Skill[] = [];
    let collections: fs.Dirent[];
    try {
        collections = fs.readdirSync(SKILLS_ROOT, { withFileTypes: true });
    } catch {
        return (cache = []);
    }

    for (const collection of collections) {
        if (!collection.isDirectory() || collection.name.startsWith('.')) continue;

        // Prefer the collection's own skills/ folder; fall back to its root.
        const base = path.join(SKILLS_ROOT, collection.name);
        const inner = path.join(base, 'skills');
        const searchRoot = fs.existsSync(inner) ? inner : base;

        walkForSkills(searchRoot, skillDir => {
            let frontmatter: Record<string, string>;
            try {
                frontmatter = parseFrontmatter(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'));
            } catch {
                return;
            }

            const name = frontmatter.name || path.basename(skillDir);
            const category = path.relative(searchRoot, path.dirname(skillDir)).split(path.sep).join('/');

            skills.push({
                collection: collection.name.toLowerCase(),
                collectionDir: collection.name,
                category: category === '.' ? '' : category,
                name,
                description: frontmatter.description ?? '',
                dir: path.relative(ROOT, skillDir).split(path.sep).join('/'),
                files: supportingFiles(skillDir)
            });
        });
    }

    skills.sort((a, b) =>
        a.collection === b.collection
            ? (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
            : (a.collection < b.collection ? -1 : 1));

    return (cache = skills);
}

export function resetSkillCache(): void {
    cache = undefined;
}

export function findSkill(name: string, collection?: string): Skill | undefined {
    const wanted = String(name ?? '').trim().toLowerCase();
    const inCollection = collection ? String(collection).trim().toLowerCase() : undefined;
    return discoverSkills().find(s =>
        s.name.toLowerCase() === wanted && (!inCollection || s.collection === inCollection));
}

export function skillByUri(uri: string): Skill | undefined {
    if (!String(uri ?? '').startsWith(SKILL_URI_PREFIX)) return undefined;
    const [collection, ...rest] = String(uri).slice(SKILL_URI_PREFIX.length).split('/');
    return rest.length ? findSkill(rest.join('/'), collection) : undefined;
}

export class SkillFileError extends Error { }

/**
 * Reads SKILL.md, or one supporting file of the skill.
 *
 * `file` is resolved inside the skill directory and rejected if it escapes it —
 * the argument reaches this from a tool call, so '../../.env' must not resolve.
 */
export function readSkillFile(skill: Skill, file?: string): string {
    const skillDir = path.resolve(ROOT, skill.dir);
    const requested = file?.trim() ? file.trim() : 'SKILL.md';
    const full = path.resolve(skillDir, requested);

    const relative = path.relative(skillDir, full);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new SkillFileError(
            `'${requested}' is outside the skill directory. Ask for one of: ${skill.files.join(', ') || 'SKILL.md'}`
        );
    }

    try {
        return fs.readFileSync(full, 'utf8');
    } catch {
        throw new SkillFileError(
            `Skill '${skill.name}' has no file '${requested}'. Available: ` +
            `SKILL.md${skill.files.length ? `, ${skill.files.join(', ')}` : ''}`
        );
    }
}

export interface SkillCollectionSummary {
    collection: string;
    skillCount: number;
    categories: { category: string; skills: string[] }[];
}

/** Cheap top-level index: collections, their categories and skill names only. */
export function skillCollections(): SkillCollectionSummary[] {
    const byCollection = new Map<string, Skill[]>();
    for (const skill of discoverSkills()) {
        const list = byCollection.get(skill.collection) ?? [];
        list.push(skill);
        byCollection.set(skill.collection, list);
    }

    return [...byCollection.entries()].map(([collection, skills]) => {
        const byCategory = new Map<string, string[]>();
        for (const skill of skills) {
            const list = byCategory.get(skill.category) ?? [];
            list.push(skill.name);
            byCategory.set(skill.category, list);
        }
        return {
            collection,
            skillCount: skills.length,
            categories: [...byCategory.entries()]
                .map(([category, names]) => ({ category, skills: names.sort() }))
                .sort((a, b) => (a.category < b.category ? -1 : 1))
        };
    });
}
