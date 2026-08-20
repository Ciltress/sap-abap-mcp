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
}
