/**
 * Reusable RFC 6570 *level-1* URI-template helpers.
 *
 * MCP resource templates advertise a `uriTemplate` such as `greeting://{who}`;
 * a server has to (a) recognise which concrete URI a `resources/read` request
 * matches and (b) extract the `{var}` bindings, and authors frequently want to
 * (c) produce a concrete URI from bindings. The generated server bakes an inline
 * matcher for (a)/(b); this module exposes the same behaviour as a small, pure,
 * dependency-free library so callers, tests, and tooling can use it directly.
 *
 * Level-1 only: simple `{name}` expansions. Percent-encoding is handled the way
 * a browser/URI would — `expandUriTemplate` encodes reserved characters in a
 * value, and `matchUriTemplate` decodes the captured text. Reserved-expansion
 * (`{+var}`), fragments, path segments, and the higher levels of RFC 6570 are
 * intentionally out of scope.
 *
 * Original Cognis Digital implementation.
 */

/** Characters that carry meaning in a regular expression and must be escaped. */
const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/** A single `{name}` expansion, capturing the variable name. */
const VAR_EXPANSION = /\{([^{}]+)\}/g;

/**
 * The variable names referenced by a template, in order of first appearance.
 *
 * @example
 * templateVariables("file:///{dir}/{name}") // ["dir", "name"]
 */
export function templateVariables(template: string): string[] {
  if (typeof template !== "string") {
    throw new TypeError("template must be a string");
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(VAR_EXPANSION)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/**
 * True if `template` contains at least one `{variable}` expansion. A template
 * with no expansions is really a plain resource URI.
 */
export function isUriTemplate(template: string): boolean {
  return typeof template === "string" && VAR_EXPANSION.test(template);
}

/**
 * Match a concrete `uri` against a level-1 `template`. Returns the `{var}`
 * bindings (percent-decoded) when it matches, or `null` when it does not.
 *
 * A variable matches one or more characters that are not a `/`, mirroring the
 * matcher embedded in generated servers so behaviour is identical.
 *
 * @example
 * matchUriTemplate("greeting://{who}", "greeting://ada") // { who: "ada" }
 * matchUriTemplate("greeting://{who}", "other://ada")    // null
 */
export function matchUriTemplate(
  template: string,
  uri: string
): Record<string, string> | null {
  if (typeof template !== "string" || typeof uri !== "string") {
    return null;
  }
  const names: string[] = [];
  // Escape every regex metacharacter *except* the template braces, so that the
  // subsequent pass can turn `{name}` into a capture group.
  const escaped = template.replace(REGEX_META, (ch) =>
    ch === "{" || ch === "}" ? ch : "\\" + ch
  );
  const regexSrc =
    "^" +
    escaped.replace(VAR_EXPANSION, (_m, name: string) => {
      names.push(name);
      return "([^/]+)";
    }) +
    "$";
  const match = new RegExp(regexSrc).exec(uri);
  if (!match) return null;
  const vars: Record<string, string> = {};
  names.forEach((name, i) => {
    try {
      vars[name] = decodeURIComponent(match[i + 1]);
    } catch {
      // Malformed percent-encoding: fall back to the raw captured text.
      vars[name] = match[i + 1];
    }
  });
  return vars;
}

/**
 * Expand a level-1 `template` by substituting `vars`. Each value is coerced to a
 * string and percent-encoded (via `encodeURIComponent`), so the result is a
 * well-formed URI. Throws if a referenced variable is missing from `vars`.
 *
 * @example
 * expandUriTemplate("greeting://{who}", { who: "Ada Lovelace" })
 * // "greeting://Ada%20Lovelace"
 */
export function expandUriTemplate(
  template: string,
  vars: Record<string, unknown>
): string {
  if (typeof template !== "string") {
    throw new TypeError("template must be a string");
  }
  return template.replace(VAR_EXPANSION, (_m, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, name)) {
      throw new Error(`missing template variable: ${name}`);
    }
    const value = vars[name];
    return encodeURIComponent(value === null ? "" : String(value));
  });
}
