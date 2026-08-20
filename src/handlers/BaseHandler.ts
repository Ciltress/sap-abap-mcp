import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { ToolDefinition } from "../types/tools";
import type { ADTClient } from "abap-adt-api";
import { performance } from 'perf_hooks';
import { createLogger } from '../lib/logger';

/**
 * One tool: what a caller must know to use it, and what it does.
 *
 * `run` returns the payload and nothing else. The timer, the MCP envelope, the
 * error mapping and the dispatch are BaseHandler's business, not the tool's —
 * 108 of the 127 tools here are a single call to abap-adt-api, and writing that
 * ceremony out per tool produced 3,000 lines that held no behaviour, three
 * different private wrappers, and two spellings of the envelope.
 */
export interface ToolSpec {
  definition: ToolDefinition;
  /** Does the work and returns the payload. Throwing is the way to fail. */
  run(args: any): Promise<any> | any;
  /**
   * Prefix for the message when `run` throws something that is not already an
   * McpError, e.g. 'Failed to lock object'. Kept per tool because it is the part
   * of a failure that tells a reader which call went wrong.
   */
  onFailure?: string;
  /**
   * Set when `run` already calls `trackRequest` itself, so `handle` does not
   * count the same call twice.
   *
   * Only the JSON-RPC tools need this, and for a reason worth keeping: their
   * implementations are also the RFC route that DdicHandlers and BasisHandlers
   * are handed as a callback, so the measurement has to live inside them to
   * cover the calls that never come through a tool at all.
   */
  selfTracked?: boolean;
}

export abstract class BaseHandler {
  protected readonly adtclient: ADTClient;
  protected readonly logger = createLogger(this.constructor.name);
  private readonly metrics = {
    requestCount: 0,
    errorCount: 0,
    successCount: 0,
    totalTime: 0,
    /** Bytes returned to the client, summed. The cheap answer to "what is expensive?". */
    responseBytes: 0,
    /** The single largest answer this handler has given. Where a row limit is missing. */
    maxResponseBytes: 0,
    /** Answers withheld for exceeding the response budget. */
    truncatedCount: 0
  };

  constructor(adtclient: ADTClient) {
    this.adtclient = adtclient;
  }

  protected trackRequest(startTime: number, success: boolean): void {
    const duration = performance.now() - startTime;
    this.metrics.requestCount++;
    this.metrics.totalTime += duration;

    if (success) {
      this.metrics.successCount++;
    } else {
      this.metrics.errorCount++;
    }

    this.logger.info('Request completed', {
      duration,
      success,
      metrics: this.getMetrics()
    });
  }

  /**
   * Records what one answer cost the client. Measurement only — the decision to
   * withhold an oversized answer is made once, centrally, in serializeResult.
   */
  public trackResponseBytes(bytes: number, truncated: boolean): void {
    this.metrics.responseBytes += bytes;
    if (bytes > this.metrics.maxResponseBytes) this.metrics.maxResponseBytes = bytes;
    if (truncated) this.metrics.truncatedCount++;
  }

  /** Per-handler counters, aggregated by the healthcheck tool. */
  public getMetrics() {
    return {
      ...this.metrics,
      averageTime: this.metrics.requestCount > 0
        ? this.metrics.totalTime / this.metrics.requestCount
        : 0,
      averageResponseBytes: this.metrics.requestCount > 0
        ? Math.round(this.metrics.responseBytes / this.metrics.requestCount)
        : 0
    };
  }

  /**
   * The tools this handler offers, declared once.
   *
   * A handler that has not been moved onto this shape overrides `getTools()` and
   * `handle()` directly instead; both still work, which is what let the 29
   * handlers migrate one at a time rather than in one commit.
   */
  protected toolSpecs(): ToolSpec[] {
    return [];
  }

  /** Built once. `toolSpecs()` closes over the handler, so it must not run before construction finishes. */
  private specIndex?: Map<string, ToolSpec>;

  private specs(): Map<string, ToolSpec> {
    if (!this.specIndex) {
      this.specIndex = new Map(this.toolSpecs().map(spec => [spec.definition.name, spec]));
    }
    return this.specIndex;
  }

  /** The tools this handler exposes. Used to build both the tool list and the router. */
  getTools(): ToolDefinition[] {
    return this.toolSpecs().map(spec => spec.definition);
  }

  /** Executes one of this handler's tools. Every name in getTools() must be routable here. */
  async handle(toolName: string, args: any): Promise<any> {
    const spec = this.specs().get(toolName);
    if (!spec) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `${this.constructor.name} has no tool named '${toolName}'.`
      );
    }

    const startTime = performance.now();
    try {
      // Never undefined: a tool reading `args.name` on a call with no arguments
      // would otherwise throw a TypeError, which reads to a client as a bug in
      // the server rather than as a missing argument.
      const payload = await spec.run(args ?? {});
      if (!spec.selfTracked) this.trackRequest(startTime, true);
      return this.envelope(payload);
    } catch (error) {
      if (!spec.selfTracked) this.trackRequest(startTime, false);
      throw this.asMcpError(error, spec.onFailure);
    }
  }

  /**
   * Wraps a payload in the one MCP envelope this server speaks.
   *
   * `status: 'success'` is added for a plain object that does not already carry a
   * `status`, which is what nearly every tool wants. The two exceptions are the
   * reason the rule is stated rather than assumed: `dropSession` answers
   * `status: 'Session cleared'` and keeps it, and the activation tools answer with
   * a bare array, which is serialised as it stands rather than being spread into
   * an object with numeric keys.
   *
   * Compact, never pretty-printed. Indentation costs response budget and buys a
   * model nothing; 12 sites used to spend it and 115 did not.
   */
  protected envelope(payload: any) {
    const isPlainObject =
      !!payload && typeof payload === 'object' && !Array.isArray(payload);

    const body = isPlainObject && !('status' in payload)
      ? { status: 'success', ...payload }
      : payload;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(body, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        )
      }]
    };
  }

  /**
   * The single place a failure becomes something a client can read.
   *
   * An McpError is passed through untouched: the tools that raise one have
   * already chosen the code and written the message, and both carry information
   * a generic wrapper would destroy. Anything else keeps SAP's own detail when
   * abap-adt-api attached one, because `error.message` is frequently just
   * "Request failed with status code 400".
   */
  protected asMcpError(error: unknown, onFailure?: string): McpError {
    if (error instanceof McpError) return error;

    const raw = error as any;
    const detail =
      raw?.response?.data?.message ||
      raw?.message ||
      'Unknown error';

    return new McpError(
      ErrorCode.InternalError,
      onFailure ? `${onFailure}: ${detail}` : String(detail)
    );
  }
}
