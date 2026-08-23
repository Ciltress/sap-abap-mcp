import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class NodeHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'nodeContents',
                    annotations: {
                        title: 'Browse repository tree',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Browse the ABAP repository tree, e.g. list a package with {parent_type:"DEVC/K", parent_name:"ZPKG"}.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            parent_type: {
                                type: 'string',
                                description: 'Kind of node to expand: DEVC/K package, PROG/P program, FUGR/F function group, PROG/PI program include.',
                                enum: ['DEVC/K', 'PROG/P', 'FUGR/F', 'PROG/PI']
                            },
                            parent_name: {
                                type: 'string',
                                description: 'Name of the parent, e.g. the package name ZPKG.'
                            },
                            user_name: {
                                type: 'string',
                                description: 'The user name.'
                            },
                            parent_tech_name: {
                                type: 'string',
                                description: 'The technical name of the parent node.'
                            },
                            rebuild_tree: {
                                type: 'boolean',
                                description: 'Whether to rebuild the tree.'
                            },
                            parentnodes: {
                                type: 'array',
                                description: 'Numeric node ids to expand.',
                                items: { type: 'number' }
                            },
                        },
                        required: ['parent_type']
                    },
                    narrowingHint: 'Expand one subpackage at a time rather than a whole package tree.'
                },
                onFailure: 'Failed to get node contents',
                run: async args => ({
                    nodeContents: await this.adtclient.nodeContents(
                        args.parent_type,
                        args.parent_name,
                        args.user_name,
                        args.parent_tech_name,
                        args.rebuild_tree,
                        args.parentnodes
                    )
                })
            },
            {
                definition: {
                    name: 'mainPrograms',
                    annotations: {
                        title: 'Main programs of an include',
                        readOnlyHint: true,
                        openWorldHint: false
                    },
                    description: 'Which main programs an include belongs to. You need one of these as mainProgram for syntaxCheckCode and findDefinition on includes.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            includeUrl: {
                                type: 'string',
                                description: 'The URL of the include.'
                            }
                        },
                        required: ['includeUrl']
                    }
                },
                onFailure: 'Failed to get main programs',
                run: async args => ({
                    mainPrograms: await this.adtclient.mainPrograms(args.includeUrl)
                })
            }
        ];
    }
}
