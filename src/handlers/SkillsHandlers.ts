import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';
import {
    SkillFileError,
    discoverSkills,
    findSkill,
    readSkillFile,
    skillCollections,
    skillUri
} from '../lib/skills.js';

/**
 * Serves the bundled agent skills.
 *
 * Same reasoning as DocsHandlers: the skills are also MCP resources, but
 * resources are usually attached by the *user*, so a tool is what lets an agent
 * find and read a skill by itself.
 *
 * Reading is a three-step drill-down because the descriptions are what make a
 * skill findable and they are long — all of them together are ~19 kB. So no
 * arguments lists collections and skill names only, a collection adds the
 * descriptions, and a skill returns its SKILL.md.
 */
export class SkillsHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'readSkill',
                    description:
                        'Bundled agent skills — reusable procedures for ABAP work (Clean ABAP review, RAP, CDS, ' +
                        'ABAP Unit, abapGit, ATC, OData…) and for general engineering (TDD, code review, ' +
                        'diagnosing bugs, domain modelling…). Call with no arguments to see which exist, then ' +
                        "pass `collection` for their descriptions and `skill` to read one. Consult a skill's " +
                        'SKILL.md before starting a task it covers: they carry the conventions and checklists ' +
                        'that make the result acceptable, which the tool descriptions alone do not.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            collection: {
                                type: 'string',
                                description:
                                    "Which collection to describe, e.g. 'abap' or 'development'. Returns every " +
                                    'skill in it with its description. Omit for the cheap top-level index.'
                            },
                            skill: {
                                type: 'string',
                                description:
                                    "A skill name from the index, e.g. 'rap' or 'tdd'. Returns its SKILL.md."
                            },
                            file: {
                                type: 'string',
                                description:
                                    "A supporting file of that skill, as listed in its `files`, e.g. " +
                                    "'references/CleanABAP.md'. Requires `skill`."
                            }
                        }
                    },
                    narrowingHint:
                        'Ask for one file of the skill instead of a large one: call readSkill with no `file` first ' +
                        'to see what the skill offers, then request the smallest file that covers your topic. Some ' +
                        'topics are genuinely too large for this profile.'
                },
                onFailure: 'Failed to read the skill',
                run: args => this.readSkill(args)
            }
        ];
    }

    /**
     * @description Lists collections, describes one collection, or reads one skill.
     * @param args.collection - Collection id, for the described listing.
     * @param args.skill - Skill name, to read its SKILL.md.
     * @param args.file - Supporting file of that skill.
     * @returns The requested index or markdown.
     * @throws {McpError} If the skill, collection or file does not exist.
     */
    private readSkill(args: any): Record<string, any> {
        const skillName = args?.skill ? String(args.skill).trim() : undefined;
        const collection = args?.collection ? String(args.collection).trim().toLowerCase() : undefined;
        const file = args?.file ? String(args.file).trim() : undefined;

        if (file && !skillName) {
            throw new McpError(ErrorCode.InvalidParams, 'A file was requested without a skill.');
        }

        const all = discoverSkills();
        if (!all.length) {
            throw new McpError(
                ErrorCode.InvalidRequest,
                'No skills are installed. Skill collections live under skills/ — each one is a ' +
                'directory containing SKILL.md files.'
            );
        }

        try {
            // 3. One skill.
            if (skillName) {
                const skill = findSkill(skillName, collection);
                if (!skill) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `There is no skill '${skillName}'${collection ? ` in '${collection}'` : ''}. ` +
                        `Call readSkill with no arguments for the list.`
                    );
                }
                return {
                    skill: {
                        name: skill.name,
                        collection: skill.collection,
                        category: skill.category || undefined,
                        description: skill.description,
                        uri: skillUri(skill),
                        path: skill.dir,
                        files: skill.files
                    },
                    file: file ?? 'SKILL.md',
                    content: readSkillFile(skill, file)
                };
            }

            // 2. One collection, with descriptions.
            if (collection) {
                const inCollection = all.filter(s => s.collection === collection);
                if (!inCollection.length) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `There is no collection '${collection}'. Available: ` +
                        `${[...new Set(all.map(s => s.collection))].join(', ')}`
                    );
                }
                return {
                    collection,
                    skillCount: inCollection.length,
                    skills: inCollection.map(s => ({
                        name: s.name,
                        category: s.category || undefined,
                        description: s.description,
                        uri: skillUri(s),
                        files: s.files
                    }))
                };
            }

            // 1. The cheap top-level index.
            return {
                collections: skillCollections(),
                skillCount: all.length,
                hint: 'Descriptions: {"collection":"abap"}. One skill: {"skill":"rap"}.'
            };
        } catch (error) {
            // A file the skill lists but does not have is the caller asking for the
            // wrong thing, so it reads as an argument problem rather than a fault.
            if (error instanceof SkillFileError) {
                throw new McpError(ErrorCode.InvalidParams, error.message);
            }
            throw error;
        }
    }
}
