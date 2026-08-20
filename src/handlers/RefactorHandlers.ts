import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class RefactorHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'extractMethodEvaluate',
                    description:
                        'Step 1 of 3 of an extract-method refactoring: propose a method for a source range. ' +
                        'Feed the result to extractMethodPreview, then extractMethodExecute.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            uri: {
                                type: 'string',
                                description: 'Source URL of the object.'
                            },
                            range: {
                                type: 'object',
                                description:
                                    'Range to extract: {start:{line,column}, end:{line,column}}. Lines are ' +
                                    '1-based, columns 0-based.',
                                properties: {
                                    start: {
                                        type: 'object',
                                        properties: { line: { type: 'number' }, column: { type: 'number' } },
                                        required: ['line', 'column']
                                    },
                                    end: {
                                        type: 'object',
                                        properties: { line: { type: 'number' }, column: { type: 'number' } },
                                        required: ['line', 'column']
                                    }
                                },
                                required: ['start', 'end']
                            }
                        },
                        required: ['uri', 'range']
                    }
                },
                onFailure: 'Failed to evaluate extract method',
                run: async args => ({
                    result: await this.adtclient.extractMethodEvaluate(args.uri, args.range)
                })
            },
            {
                definition: {
                    name: 'extractMethodPreview',
                    description:
                        'Step 2 of 3: turn the proposal into a concrete refactoring with the resulting source ' +
                        'deltas. Set the method name and visibility on the proposal object first.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            proposal: {
                                type: 'object',
                                description: 'The ExtractMethodProposal OBJECT from extractMethodEvaluate.'
                            }
                        },
                        required: ['proposal']
                    }
                },
                onFailure: 'Failed to preview extract method',
                run: async args => ({
                    result: await this.adtclient.extractMethodPreview(args.proposal)
                })
            },
            {
                definition: {
                    name: 'extractMethodExecute',
                    description: 'Step 3 of 3: apply the refactoring. This WRITES source code.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            refactoring: {
                                type: 'object',
                                description: 'The GenericRefactoring OBJECT from extractMethodPreview.'
                            }
                        },
                        required: ['refactoring']
                    }
                },
                onFailure: 'Failed to execute extract method',
                run: async args => ({
                    result: await this.adtclient.extractMethodExecute(args.refactoring)
                })
            }
        ];
    }
}
