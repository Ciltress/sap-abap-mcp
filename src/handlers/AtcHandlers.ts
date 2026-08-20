import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class AtcHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'atcCustomizing',
                    description: 'System ATC settings, including the default check variant. Start an ATC workflow here.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to get ATC customizing',
                run: async () => ({ result: await this.adtclient.atcCustomizing() })
            },
            {
                definition: {
                    name: 'atcCheckVariant',
                    description: 'Resolve and validate an ATC check variant name before starting a run.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            variant: {
                                type: 'string',
                                description: 'Check variant name, e.g. DEFAULT_REMOTE.'
                            }
                        },
                        required: ['variant']
                    }
                },
                onFailure: 'Failed to get ATC check variant',
                run: async args => ({ result: await this.adtclient.atcCheckVariant(args.variant) })
            },
            {
                definition: {
                    name: 'createAtcRun',
                    description: 'Start an ATC run over an object or package. Returns the run result id and timestamp needed by atcWorklists.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            variant: {
                                type: 'string',
                                description: 'Check variant name, e.g. DEFAULT_REMOTE.'
                            },
                            mainUrl: {
                                type: 'string',
                                description: 'ADT object URL to check (an object or a package).'
                            },
                            maxResults: {
                                type: 'number',
                                description: 'The maximum number of results to retrieve.'
                            }
                        },
                        required: ['variant', 'mainUrl']
                    }
                },
                onFailure: 'Failed to create ATC run',
                run: async args => ({
                    result: await this.adtclient.createAtcRun(args.variant, args.mainUrl, args.maxResults)
                })
            },
            {
                definition: {
                    name: 'atcWorklists',
                    description: 'Findings of an ATC run: objects[].findings[] with priority, check title and location.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            runResultId: {
                                type: 'string',
                                description: 'The ID of the ATC run result.'
                            },
                            timestamp: {
                                type: 'number',
                                description: 'The timestamp.'
                            },
                            usedObjectSet: {
                                type: 'string',
                                description: 'The used object set.'
                            },
                            includeExempted: {
                                type: 'boolean',
                                description: 'Whether to include exempted findings.'
                            }
                        },
                        required: ['runResultId']
                    }
                },
                onFailure: 'Failed to get ATC worklists',
                run: async args => ({
                    result: await this.adtclient.atcWorklists(
                        args.runResultId,
                        args.timestamp || 0,
                        args.usedObjectSet || "",
                        args.includeExempted
                    )
                })
            },
            {
                definition: {
                    name: 'atcUsers',
                    description: 'Users available as ATC contacts or exemption approvers.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to get ATC users',
                run: async () => ({ result: await this.adtclient.atcUsers() })
            },
            {
                definition: {
                    name: 'atcExemptProposal',
                    description: 'Start an exemption for a finding: returns the proposal object to fill in and submit.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            markerId: {
                                type: 'string',
                                description: 'Marker id, taken from a finding quickfixInfo in the worklist.'
                            }
                        },
                        required: ['markerId']
                    }
                },
                onFailure: 'Failed to get ATC exempt proposal',
                run: async args => ({ result: await this.adtclient.atcExemptProposal(args.markerId) })
            },
            {
                definition: {
                    name: 'atcRequestExemption',
                    description: 'Submit an exemption request. Pass the AtcProposal OBJECT from atcExemptProposal, with your justification filled in.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            proposal: {
                                type: 'object',
                                description: 'The AtcProposal OBJECT returned by atcExemptProposal.'
                            }
                        },
                        required: ['proposal']
                    }
                },
                onFailure: 'Failed to request ATC exemption',
                run: async args => ({ result: await this.adtclient.atcRequestExemption(args.proposal) })
            }
        ];
    }
}
