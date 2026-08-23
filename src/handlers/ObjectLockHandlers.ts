import { BaseHandler } from './BaseHandler.js';
import type { ToolSpec } from './BaseHandler.js';

export class ObjectLockHandlers extends BaseHandler {
  protected toolSpecs(): ToolSpec[] {
    return [
      {
        definition: {
          name: 'lock',
          annotations: {
            title: 'Lock object',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
          },
          description:
            'Lock an ABAP object for editing and return the lock handle. The lock lives in the stateful ' +
            'session — dropSession or a server restart invalidates it. Always unLock when done. ' +
            'The result also reports the transport the object is already in (CORRNR) and whether it is local.',
          inputSchema: {
            type: 'object',
            properties: {
              objectUrl: {
                type: 'string',
                description: "ADT object URL, e.g. '/sap/bc/adt/oo/classes/zcl_foo'."
              },
              accessMode: {
                type: 'string',
                description: "Access mode. Defaults to ADT's MODIFY."
              }
            },
            required: ['objectUrl']
          }
        },
        onFailure: 'Failed to lock object',
        run: async args => {
          const lockResult = await this.adtclient.lock(args.objectUrl, args.accessMode);
          return {
            lockHandle: lockResult.LOCK_HANDLE,
            // The rest of the AdtLock answers "which transport is this object
            // in, and is it local?" — dropping it forced a second round trip.
            lock: lockResult,
            message: 'Object locked successfully'
          };
        }
      },
      {
        definition: {
          name: 'unLock',
          annotations: {
            title: 'Release lock',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
          },
          description: 'Release a lock. Call this even when the operation in between failed.',
          inputSchema: {
            type: 'object',
            properties: {
              objectUrl: {
                type: 'string',
                description: 'The same object URL that was locked.'
              },
              lockHandle: {
                type: 'string',
                description: 'Lock handle returned by the lock tool.'
              }
            },
            required: ['objectUrl', 'lockHandle']
          }
        },
        onFailure: 'Failed to unlock object',
        run: async args => {
          await this.adtclient.unLock(args.objectUrl, args.lockHandle);
          return { message: 'Object unlocked successfully' };
        }
      }
    ];
  }
}
