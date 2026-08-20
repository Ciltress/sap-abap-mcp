import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class RevisionHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'revisions',
                    description: 'Version history of an object. Each revision carries a uri you can pass to getObjectSource to diff versions.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            objectUrl: {
                                type: 'string',
                                description: 'ADT object URL, or a whole AbapObjectStructure.'
                            },
                            clsInclude: {
                                type: 'string',
                                description: 'For classes: which include to get the history of.',
                                enum: ['definitions', 'implementations', 'macros', 'testclasses', 'main']
                            }
                        },
                        required: ['objectUrl']
                    }
                },
                onFailure: 'Failed to get revisions',
                run: async args => ({
                    revisions: await this.adtclient.revisions(args.objectUrl, args.clsInclude)
                })
            }
        ];
    }
}
