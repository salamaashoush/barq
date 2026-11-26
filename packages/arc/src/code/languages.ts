import type { LanguageSupport } from "@codemirror/language";

/** A language by its registered name or an alias, or a `LanguageSupport` an app built itself. */
export type CodeLanguage = string | LanguageSupport;

/** Loads a language's support. Called once; the promise is kept. */
export type LanguageLoader = () => Promise<LanguageSupport>;

interface Entry {
  readonly load: LanguageLoader;
  promise?: Promise<LanguageSupport | undefined>;
  support?: LanguageSupport;
}

const entries = new Map<string, Entry>();
const aliases = new Map<string, string>();

/**
 * Adds a language, or replaces one, under `name` and `alias`es, case-insensitive.
 *
 * ```ts
 * registerLanguage("shell", async () => {
 *   const [{ StreamLanguage, LanguageSupport }, { shell }] = await Promise.all([
 *     import("@codemirror/language"),
 *     import("@codemirror/legacy-modes/mode/shell"),
 *   ]);
 *   return new LanguageSupport(StreamLanguage.define(shell));
 * }, ["sh", "bash"]);
 * ```
 */
export function registerLanguage(
  name: string,
  load: LanguageLoader,
  alias: readonly string[] = [],
): void {
  const key = name.toLowerCase();
  entries.set(key, { load });
  for (const one of alias) aliases.set(one.toLowerCase(), key);
}

function entryOf(name: string): Entry | undefined {
  const key = name.toLowerCase();
  return entries.get(aliases.get(key) ?? key);
}

/** Every registered name, aliases left out. */
export function languageNames(): string[] {
  return [...entries.keys()];
}

/**
 * The language's support, loaded on first ask. `undefined` for a name nobody
 * registered, and for one whose import failed, which is then asked again on
 * the next call rather than failing for the life of the page.
 */
export function loadLanguage(language: CodeLanguage): Promise<LanguageSupport | undefined> {
  if (typeof language !== "string") return Promise.resolve(language);
  const entry = entryOf(language);
  if (entry === undefined) return Promise.resolve(undefined);
  entry.promise ??= entry.load().then(
    (support) => {
      entry.support = support;
      return support;
    },
    () => {
      entry.promise = undefined;
      return undefined;
    },
  );
  return entry.promise;
}

/**
 * The language's support if it is here already: what lets a component that
 * renders after the import landed skip a frame of plain text.
 */
export function loadedLanguage(language: CodeLanguage): LanguageSupport | undefined {
  return typeof language === "string" ? entryOf(language)?.support : language;
}

/** Whether `language` names something this registry knows, or is a support itself. */
export function isKnownLanguage(language: CodeLanguage): boolean {
  return typeof language !== "string" || entryOf(language) !== undefined;
}

registerLanguage(
  "javascript",
  async () => (await import("@codemirror/lang-javascript")).javascript(),
  ["js", "mjs", "cjs"],
);
registerLanguage("jsx", async () =>
  (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
);
registerLanguage(
  "typescript",
  async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
  ["ts", "mts", "cts"],
);
registerLanguage("tsx", async () =>
  (await import("@codemirror/lang-javascript")).javascript({ jsx: true, typescript: true }),
);
registerLanguage("json", async () => (await import("@codemirror/lang-json")).json(), ["jsonc"]);
registerLanguage("html", async () => (await import("@codemirror/lang-html")).html(), ["htm"]);
registerLanguage("css", async () => (await import("@codemirror/lang-css")).css());
registerLanguage(
  "markdown",
  async () => {
    const [{ markdown }, { LanguageDescription }] = await Promise.all([
      import("@codemirror/lang-markdown"),
      import("@codemirror/language"),
    ]);
    // A fenced block in a language already loaded is highlighted at once,
    // which a static render needs; any other loads when an editor shows it.
    return markdown({
      codeLanguages: (info) => {
        const name = info.trim().split(/\s+/)[0] ?? "";
        if (name === "" || entryOf(name) === undefined) return null;
        const ready = loadedLanguage(name);
        if (ready !== undefined) return ready.language;
        return LanguageDescription.of({
          name,
          load: async () => {
            const support = await loadLanguage(name);
            if (support === undefined) throw new Error(`The ${name} language did not load.`);
            return support;
          },
        });
      },
    });
  },
  ["md"],
);
registerLanguage("python", async () => (await import("@codemirror/lang-python")).python(), ["py"]);
registerLanguage("xml", async () => (await import("@codemirror/lang-xml")).xml(), ["svg"]);
registerLanguage("yaml", async () => (await import("@codemirror/lang-yaml")).yaml(), ["yml"]);
registerLanguage("sql", async () => (await import("@codemirror/lang-sql")).sql());
registerLanguage(
  "shell",
  async () => {
    const [{ LanguageSupport, StreamLanguage }, { shell }] = await Promise.all([
      import("@codemirror/language"),
      import("@codemirror/legacy-modes/mode/shell"),
    ]);
    return new LanguageSupport(StreamLanguage.define(shell));
  },
  ["sh", "bash", "zsh", "console"],
);
registerLanguage("toml", async () => {
  const [{ LanguageSupport, StreamLanguage }, { toml }] = await Promise.all([
    import("@codemirror/language"),
    import("@codemirror/legacy-modes/mode/toml"),
  ]);
  return new LanguageSupport(StreamLanguage.define(toml));
});
