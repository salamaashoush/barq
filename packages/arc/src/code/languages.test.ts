import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LanguageSupport, StreamLanguage } from "@codemirror/language";

import { importGraph } from "../test-graph.ts";
import { highlightHtml } from "./highlight.ts";
import {
  isKnownLanguage,
  languageNames,
  loadLanguage,
  loadedLanguage,
  registerLanguage,
} from "./languages.ts";

describe("the language registry", () => {
  test("knows the languages arc ships, under their names and aliases", async () => {
    expect(languageNames().toSorted()).toEqual([
      "css",
      "html",
      "javascript",
      "json",
      "jsx",
      "markdown",
      "python",
      "shell",
      "sql",
      "toml",
      "tsx",
      "typescript",
      "xml",
      "yaml",
    ]);
    for (const name of languageNames()) {
      const support = await loadLanguage(name);
      expect(support).toBeInstanceOf(LanguageSupport);
    }
    expect(loadedLanguage("TS")).toBe(loadedLanguage("typescript"));
    expect(loadedLanguage("yml")).toBe(loadedLanguage("yaml"));
    expect(loadedLanguage("bash")).toBe(loadedLanguage("shell"));
    expect(isKnownLanguage("md")).toBe(true);
    expect(isKnownLanguage("cobol")).toBe(false);
    expect(await loadLanguage("cobol")).toBeUndefined();
  });

  test("loads each language once", async () => {
    let loads = 0;
    registerLanguage("acme-once", () => {
      loads++;
      return Promise.resolve(
        new LanguageSupport(StreamLanguage.define({ token: (s) => (s.next(), null) })),
      );
    });
    const [a, b] = await Promise.all([loadLanguage("acme-once"), loadLanguage("acme-once")]);
    expect(a).toBe(b as LanguageSupport);
    await loadLanguage("acme-once");
    expect(loads).toBe(1);
  });

  test("a failed import is asked again on the next call", async () => {
    let attempts = 0;
    registerLanguage("acme-flaky", () => {
      attempts++;
      if (attempts === 1) return Promise.reject(new Error("offline"));
      return Promise.resolve(
        new LanguageSupport(StreamLanguage.define({ token: (s) => (s.next(), null) })),
      );
    });
    expect(await loadLanguage("acme-flaky")).toBeUndefined();
    expect(await loadLanguage("acme-flaky")).toBeInstanceOf(LanguageSupport);
    expect(attempts).toBe(2);
  });

  test("an app's own language, a legacy mode, highlights like the rest", async () => {
    registerLanguage(
      "acme-ini",
      () =>
        Promise.resolve(
          new LanguageSupport(
            StreamLanguage.define({
              token: (stream) => {
                if (stream.sol() && stream.match(/^\[[^\]]*\]/)) return "keyword";
                if (stream.match(/^;.*/)) return "comment";
                stream.next();
                return null;
              },
            }),
          ),
        ),
      ["ini"],
    );
    const support = await loadLanguage("ini");
    expect(highlightHtml("[section]\n; note", support)).toBe(
      '<span data-line><span class="tok-keyword">[section]</span></span>\n' +
        '<span data-line><span class="tok-comment">; note</span></span>',
    );
  });

  test("a fenced block in a loaded language is highlighted inside markdown", async () => {
    await loadLanguage("python");
    const markdown = await loadLanguage("markdown");
    const html = highlightHtml("# Title\n\n```python\nreturn 1\n```", markdown);
    expect(html).toContain('<span class="tok-heading">');
    expect(html).toContain('<span class="tok-keyword">return</span>');
  });
});

describe("what an app pays for", () => {
  const src = dirname(dirname(fileURLToPath(import.meta.url)));

  test("arc's main entry reaches no CodeMirror at all", () => {
    const graph = importGraph(join(src, "index.ts")).packages;
    const codemirror = [...graph.keys()].filter(
      (name) => name.startsWith("@codemirror/") || name.startsWith("@lezer/"),
    );
    expect(codemirror).toEqual([]);
  });

  test("the worker entry and the light highlighter reach no CodeMirror", () => {
    for (const file of ["worker.ts", "light-highlight.ts"]) {
      const graph = importGraph(join(src, "code", file)).packages;
      expect([...graph.keys()].filter((name) => name.startsWith("@codemirror/"))).toEqual([]);
    }
  });

  test("the code entry imports every language only on demand", () => {
    const graph = importGraph(join(src, "code", "index.ts")).packages;
    const languages = [...graph.entries()].filter(([name]) => name.startsWith("@codemirror/lang-"));
    expect(languages.length).toBe(9);
    for (const [, kinds] of languages) expect([...kinds]).toEqual(["dynamic-import"]);
  });
});
