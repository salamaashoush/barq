/** A place in a text, counted as an editor's gutter counts it: from 1. */
export interface SourcePosition {
  line: number;
  /** @default 1 */
  column?: number;
}

/**
 * A place in one document, or a span of it: where a problem was found, a
 * test is written, a check refers to.
 *
 * Lines and columns count from 1, as a reader sees them; a language server's
 * positions count from 0 and are one less.
 */
export interface SourceLocation extends SourcePosition {
  /** The document: a path, or a URI. */
  uri: string;
  /** Where the span ends, when it is one. */
  endLine?: number;
  endColumn?: number;
}

/** `12:5`: the line and column a location starts at. */
export function positionText(position: SourcePosition): string {
  return `${String(position.line)}:${String(position.column ?? 1)}`;
}

/** The last segment of a path or a URI, decoded: `main.toy`. */
export function documentName(uri: string): string {
  const path = uri.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const name = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** What leads to the document's name: `src/lib` of `file:///src/lib/main.toy`. */
export function documentFolder(uri: string): string {
  const path = uri
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
  const folder = path.slice(0, Math.max(0, path.lastIndexOf("/"))).replace(/^\/+/, "");
  try {
    return decodeURIComponent(folder);
  } catch {
    return folder;
  }
}
