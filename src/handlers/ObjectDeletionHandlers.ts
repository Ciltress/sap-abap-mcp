import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class ObjectDeletionHandlers extends BaseHandler {
  protected toolSpecs(): ToolSpec[] {
    return [
      {
        definition: {
          name: 'deleteObject',
          description: 'Delete an ABAP object. IRREVERSIBLE - requires an active lock handle, and a transport for non-local objects.',
          inputSchema: {
            type: 'object',
            properties: {
              objectUrl: {
                type: 'string',
                description: 'URL of the object to delete'
              },
              lockHandle: {
                type: 'string',
                description: 'Lock handle for the object'
              },
              transport: {
                type: 'string',
                description: 'Transport request number'
              }
            },
            required: ['objectUrl', 'lockHandle']
          }
        },
        onFailure: 'Failed to delete object',
        run: async args => ({
          result: await this.adtclient.deleteObject(args.objectUrl, args.lockHandle, args.transport),
          message: 'Object deleted successfully'
        })
      }
    ];
  }
}
