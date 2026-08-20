import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class FeedHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'listFeeds',
                    description:
                        'ADT feeds available on this system - short dumps, ATC results and whatever else ' +
                        'this release publishes - with the queries each one accepts. Call it to find out ' +
                        'what is subscribable here before reaching for a specific feed.',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                onFailure: 'Failed to get feeds',
                run: async () => ({ feeds: await this.adtclient.feeds() })
            },
            {
                definition: {
                    name: 'readShortDumps',
                    description:
                        'Recent ABAP short dumps - the ST22 list. The fastest way to find out why ' +
                        'something you just ran failed, and the first thing to check after a runtime ' +
                        'error, a failed activation or an RFC call that died without a message.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'An optional query string to filter the dumps.'
                            }
                        }
                    }
                },
                onFailure: 'Failed to get dumps',
                run: async args => ({ dumps: await this.adtclient.dumps(args.query) })
            }
        ];
    }
}
