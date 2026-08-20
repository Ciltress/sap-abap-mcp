import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class AuthHandlers extends BaseHandler {
  protected toolSpecs(): ToolSpec[] {
    return [
      {
        definition: {
          // `login` and `logout` were removed: the server bootstraps its own
          // session and re-establishes it when SAP drops it, so both only gave an
          // agent a way to break something that was working. `dropSession` stays
          // because a lock that `unLock` could not release is otherwise stuck
          // until the server restarts — and on a shared system that blocks other
          // developers, not just this one.
          name: 'dropSession',
          description:
            'End the stateful session, releasing every lock it holds. The escape hatch for a lock ' +
            'that unLock could not release; the next tool call establishes a new session by itself. ' +
            'Locks are session-bound, so anything you locked and did not unlock is freed by this.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        onFailure: 'Drop session failed',
        run: async () => {
          await this.adtclient.dropSession();
          // Its own status, deliberately: BaseHandler only supplies 'success'
          // when a payload does not already say what happened.
          return { status: 'Session cleared' };
        }
      }
    ];
  }
}
