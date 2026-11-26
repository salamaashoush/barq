/**
 * The language to highlight a body in, by its content type or, with none,
 * by how it starts: `json`, `html`, `xml` or `javascript`. `undefined` is
 * plain text, which is what any other declared type gets.
 *
 * ```ts
 * languageForContentType("application/problem+json"); // "json"
 * languageForContentType(undefined, "<?xml version=\"1.0\"?>"); // "xml"
 * ```
 */
export function languageForContentType(
  contentType: string | null | undefined,
  body = "",
): string | undefined {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (type !== "") {
    if (type.includes("json")) return "json";
    if (type.includes("html")) return "html";
    if (type.includes("xml") || type.endsWith("+svg")) return "xml";
    if (type.includes("javascript") || type.includes("ecmascript")) return "javascript";
    return undefined;
  }
  const start = body.trimStart();
  const first = start[0];
  if (first === "{" || first === "[") return "json";
  if (first === "<") return start.slice(0, 5).toLowerCase() === "<?xml" ? "xml" : "html";
  return undefined;
}

/**
 * JSON indented for reading. Text that does not parse, such as a preview cut
 * off part way, comes back as it was rather than failing.
 */
export function prettyJson(text: string, indent = 2): string {
  try {
    return JSON.stringify(JSON.parse(text), null, indent);
  } catch {
    return text;
  }
}
