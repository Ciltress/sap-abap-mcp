#!/usr/bin/env node

/**
 * The entry point, and only the entry point.
 *
 * The server itself lives in ./server.ts. It is split off because this file runs
 * on import — it loads .env, builds a server and connects it to a transport
 * (stdio by default, or Streamable HTTP when `ABAP_MCP_TRANSPORT=http`) — and a
 * module that does that cannot be imported by a test. 747 lines of routing,
 * session recovery and gate handling were unreachable as a result, including the
 * retry after SAP drops a session and the rule that the gate must never fail
 * closed.
 *
 * The path does not move: package.json `main` and `bin`, the Dockerfile, `npm
 * start` and every registered MCP client all run dist/index.js.
 */

import { config } from 'dotenv';
import path from 'path';
import { AbapAdtServer } from './server.js';

config({ path: path.resolve(__dirname, '../.env') });

export { AbapAdtServer } from './server.js';
export type { ServerDependencies } from './server.js';

const server = new AbapAdtServer();
server.run().catch((error) => {
  // The message carries the diagnosis assembled by explainStartupFailure() and
  // runs to many lines. Printing the Error object as well buries it under a
  // stack that says only that a logon failed, which was never the question.
  console.error(`Failed to start MCP server: ${error?.message ?? error}`);
  if (error?.cause?.stack) console.error(error.cause.stack);
  process.exit(1);
});
