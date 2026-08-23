/**
 * A single entry of an `inputSchema`. Deliberately a subset of JSON Schema —
 * enough to describe every argument this server takes, including the structured
 * ones (objects handed back from a previous call, arrays of rows, closed value
 * sets).
 */
export interface ToolProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  /** Element schema, for properties of type 'array'. */
  items?: ToolProperty;
  /** Component schemas, for properties of type 'object'. */
  properties?: Record<string, ToolProperty>;
  /** Mandatory components, for properties of type 'object'. */
  required?: string[];
  /** Allowed values, when the property is a closed set. */
  enum?: readonly (string | number)[];
  /** Value used by the handler when the caller omits the property. */
  default?: string | number | boolean;
}

/**
 * The MCP tool annotations: hints a client uses to decide how much ceremony a
 * call deserves — auto-approve it, ask first, or warn loudly.
 *
 * They are **hints, not guarantees**. Nothing here is enforced by the server;
 * a client that trusts them blindly on an untrusted server is the case the
 * specification warns about. What they buy on a trusted server is the thing
 * this catalogue badly needs: 82 of the 129 tools it can list only read, and a
 * client that cannot tell them apart from `deleteObject` has to prompt for all
 * of them.
 *
 * Conventions used across this server, so the flags mean the same thing on
 * every tool:
 *
 * - `readOnlyHint` — true only when the call leaves the SAP system exactly as
 *   it found it. A check that sends source but persists nothing (`syntaxCheckCode`,
 *   `prettyPrinter`, `fixEdits`) is read-only; anything that executes ABAP is not,
 *   because the code decides, not us.
 * - `destructiveHint` — true when the call overwrites or removes something that
 *   existed: source, a lock, a transport, a published service, a variable in a
 *   running debuggee. Creating something new is not destructive.
 * - `idempotentHint` — true only when repeating the call really does leave the
 *   same state. A source write does not qualify even when the text is identical:
 *   it adds a version to the object's history every time.
 * - `openWorldHint` — false for the ordinary case, because this server is bound
 *   to one SAP system and its repository is a closed domain. True where the call
 *   reaches past that system: an external Git remote, a transport released
 *   towards the next system in the landscape, an OData service published to its
 *   consumers, or arbitrary ABAP that can do any of those itself.
 */
export interface ToolAnnotations {
  /** Human-readable name for the tool, for UIs that show one instead of `name`. */
  title?: string;
  /** True when the tool does not modify its environment. Default: false. */
  readOnlyHint?: boolean;
  /** True when the tool may destroy or overwrite existing state. Meaningful only when `readOnlyHint` is false. Default: true. */
  destructiveHint?: boolean;
  /** True when repeating the call with the same arguments has no further effect. Meaningful only when `readOnlyHint` is false. Default: false. */
  idempotentHint?: boolean;
  /** True when the tool interacts with entities outside the SAP system this server is bound to. Default: true. */
  openWorldHint?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, ToolProperty>;
    /**
     * The only optionality marker clients act on: anything not listed here is
     * optional. There is no `optional: true` flag — it was never JSON Schema.
     */
    required?: string[];
  };
  /**
   * What "narrow it" means for this tool, used when an answer is withheld for
   * exceeding the response budget.
   *
   * It lives here rather than in a map keyed by tool name because that map went
   * stale silently: renaming a tool simply stopped matching, and the model got
   * generic advice at the exact moment it needed the specific move. Omit it and
   * the caller gets the generic hint, which is the honest default for a tool
   * that has no particular way to be narrowed.
   */
  narrowingHint?: string;
  /**
   * Id of the GatedFeature this tool cannot work without, e.g. 'abapgit'. Absent
   * means the tool works on any system that runs ADT at all.
   *
   * Declared on the tool for the same reason as the hint: the gate used to list
   * tool names on the feature, where a rename un-gated a tool without a word.
   */
  needsFeature?: string;
  /**
   * Behavioural hints for the client: read-only, destructive, idempotent, open-world.
   *
   * Passed straight through to `tools/list`, and declared per tool for the same
   * reason as the two fields above — a table keyed by tool name goes stale the
   * moment a tool is renamed, and here that would silently downgrade a
   * destructive tool to the client's defaults.
   */
  annotations?: ToolAnnotations;
}
