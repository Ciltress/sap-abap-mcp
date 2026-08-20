import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class RenameHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'renameEvaluate',
                    description:
                        'Step 1 of 3 of a rename refactoring: propose a rename for the symbol at a position. ' +
                        'Feed the result to renamePreview, then renameExecute.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            uri: {
                                type: 'string',
                                description: 'Source URL of the object containing the symbol.'
                            },
                            line: {
                                type: 'number',
                                description: '1-based line number.'
                            },
                            startColumn: {
                                type: 'number',
                                description: '0-based column where the identifier starts.'
                            },
                            endColumn: {
                                type: 'number',
                                description: '0-based column where the identifier ends.'
                            }
                        },
                        required: ['uri', 'line', 'startColumn', 'endColumn']
                    }
                },
                onFailure: 'Failed to evaluate rename',
                run: async args => ({
                    result: await this.adtclient.renameEvaluate(
                        args.uri,
                        args.line,
                        args.startColumn,
                        args.endColumn
                    )
                })
            },
            {
                definition: {
                    name: 'renamePreview',
                    description:
                        'Step 2 of 3: compute every affected source change. Set the new name on the proposal ' +
                        'object before calling, and show the result to a human before executing.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            renameRefactoring: {
                                type: 'object',
                                description:
                                    'The RenameRefactoringProposal OBJECT from renameEvaluate, with the new name set.'
                            },
                            transport: {
                                type: 'string',
                                description: 'Transport request for the changes. Omit for local objects.'
                            }
                        },
                        required: ['renameRefactoring']
                    }
                },
                onFailure: 'Failed to preview rename',
                run: async args => ({
                    result: await this.adtclient.renamePreview(args.renameRefactoring, args.transport)
                })
            },
            {
                definition: {
                    name: 'renameExecute',
                    description:
                        'Step 3 of 3: apply the rename. This WRITES source code across every affected object.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            refactoring: {
                                type: 'object',
                                description: 'The RenameRefactoring OBJECT from renamePreview.'
                            }
                        },
                        required: ['refactoring']
                    }
                },
                onFailure: 'Failed to execute rename',
                run: async args => ({
                    result: await this.adtclient.renameExecute(args.refactoring)
                })
            }
        ];
    }
}
