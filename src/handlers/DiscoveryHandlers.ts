import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class DiscoveryHandlers extends BaseHandler {
    protected toolSpecs(): ToolSpec[] {
        return [
            {
                definition: {
                    name: 'adtDiscovery',
                    description:
                        'Every ADT collection this system exposes — the authoritative answer to whether a ' +
                        'feature exists on this release. Returns category and collection titles only, which ' +
                        'is what "does X exist here?" needs; pass full:true for the hrefs and URI templates, ' +
                        'which is several times larger.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            full: {
                                type: 'boolean',
                                description:
                                    'Return the complete document including every href and URI template. ' +
                                    'Large — ~48KB on 7.50. Defaults to false.',
                                default: false
                            }
                        }
                    },
                    narrowingHint:
                        'Drop full:true — the default returns category and collection titles only, which answers ' +
                        '"does this system expose X?" on its own.'
                },
                onFailure: 'Failed to perform ADT discovery',
                run: async args => {
                    const discovery = await this.adtclient.adtDiscovery();

                    // The full document on a 7.50 system is ~48KB — five times the entire
                    // tool list of the `core` profile, in one answer. Almost every reason
                    // to call this is answered by "does collection X exist here?", which
                    // the titles alone settle, so summarising is the default and the URI
                    // templates are opt-in.
                    if (args?.full === true) return { full: true, discovery };

                    return {
                        full: false,
                        categories: (discovery ?? []).map((category: any) => ({
                            title: category?.title,
                            collections: (category?.collection ?? []).map((c: any) => c?.title)
                        })),
                        categoryCount: (discovery ?? []).length,
                        collectionCount: (discovery ?? []).reduce(
                            (n: number, c: any) => n + (c?.collection?.length ?? 0), 0),
                        note:
                            'Titles only. Call again with {"full":true} for the hrefs and URI templates, ' +
                            'and search the titles for the collection you need.'
                    };
                }
            }
        ];
    }
}
