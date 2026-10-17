/**
 * The next `;`, `{` or `}` that is not inside a string, a comment, or brackets.
 *
 * Brackets are why this is a scanner rather than a `split`: `url(a;b)` and
 * `:is(a, b)` both carry a delimiter that ends nothing.
 */
export function scan(source: string, from: number): { end: number; found: string } {
  let depth = 0;
  for (let index = from; index < source.length; index++) {
    const character = source[index];
    if (character === "\\") {
      index++;
    } else if (character === '"' || character === "'") {
      const quote = character;
      index++;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") index++;
        index++;
      }
    } else if (character === "/" && source[index + 1] === "*") {
      const close = source.indexOf("*/", index + 2);
      if (close < 0) return { end: source.length, found: "" };
      index = close + 1;
    } else if (character === "(" || character === "[") {
      depth++;
    } else if (character === ")" || character === "]") {
      depth--;
    } else if (depth === 0 && (character === ";" || character === "{" || character === "}")) {
      return { end: index, found: character };
    }
  }
  return { end: source.length, found: "" };
}

export function closingBrace(source: string, open: number): number {
  let index = open + 1;
  let depth = 1;
  while (index < source.length && depth > 0) {
    const { end, found } = scan(source, index);
    if (found === "{") depth++;
    else if (found === "}") depth--;
    else if (found === "") return source.length;
    index = end + 1;
  }
  return index - 1;
}
