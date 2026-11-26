import { describe, expect, test } from "bun:test";

import { shellQuote } from "./code-tabs.tsx";
import { languageForContentType, prettyJson } from "./content-type.ts";
import { highlightLines } from "./highlight.ts";
import { loadLanguage } from "./languages.ts";
import { isLightLanguage, lightHighlightLines, lightLanguageNames } from "./light-highlight.ts";
import { linesHtml, markLines, rangeAround, sliceLines } from "./lines.ts";
import { terminalCommands, terminalLines } from "./terminal-block.tsx";

describe("lines", () => {
  test("rangeAround keeps a few lines either side, cut at the ends", () => {
    const code = Array.from({ length: 10 }, (_, at) => `line ${String(at + 1)}`).join("\n");
    expect(rangeAround(code, 5)).toEqual({ from: 2, to: 8 });
    expect(rangeAround(code, 1, 2)).toEqual({ from: 1, to: 3 });
    expect(rangeAround(code, 10, 2)).toEqual({ from: 8, to: 10 });
    expect(rangeAround(code, 40, 1)).toEqual({ from: 9, to: 10 });
    expect(sliceLines(code, { from: 2, to: 3 })).toBe("line 2\nline 3");
  });

  test("markLines cuts the range and marks a line with its tone and label", () => {
    const lines = ["a", "b", "c", "d"].map((html) => ({ html }));
    const marked = markLines(lines, [{ line: 3, tone: "danger", label: "Failed here" }], {
      from: 2,
      to: 3,
    });
    expect(linesHtml(marked)).toBe(
      '<span data-line>b</span>\n<span data-line data-mark="danger" data-mark-label="Failed here">c</span>',
    );
    expect(linesHtml(markLines(lines, [{ line: 1 }], undefined))).toContain(
      '<span data-line data-mark="neutral">a</span>',
    );
  });

  test("a label is escaped in its attribute", () => {
    const marked = markLines([{ html: "x" }], [{ line: 1, label: 'say "hi" <b>' }], undefined);
    expect(linesHtml(marked)).toBe(
      '<span data-line data-mark="neutral" data-mark-label="say &quot;hi&quot; &lt;b&gt;">x</span>',
    );
  });

  test("highlightLines keeps a block comment's colour on each line it spans", async () => {
    const support = await loadLanguage("typescript");
    expect(highlightLines("/* a\nb */ 1", support)).toEqual([
      '<span class="tok-comment">/* a</span>',
      '<span class="tok-comment">b */</span> <span class="tok-number">1</span>',
    ]);
  });

  test("shell and TOML are bundled grammars", async () => {
    const shell = await loadLanguage("bash");
    expect(highlightLines("# hi\necho $HOME", shell)[0]).toBe(
      '<span class="tok-comment"># hi</span>',
    );
    const toml = await loadLanguage("toml");
    expect(highlightLines('name = "acme"', toml).join("")).toContain(
      '<span class="tok-string">"acme"</span>',
    );
  });
});

describe("the light highlighter", () => {
  test("knows a few snippet languages by name and alias", () => {
    expect(lightLanguageNames().toSorted()).toEqual([
      "json",
      "shell",
      "toml",
      "typescript",
      "yaml",
    ]);
    expect(isLightLanguage("bash")).toBe(true);
    expect(isLightLanguage("JS")).toBe(true);
    expect(isLightLanguage("python")).toBe(false);
  });

  test("colours shell into the shared token classes", () => {
    expect(lightHighlightLines('acme deploy --region "eu west" # now', "sh")).toEqual([
      '<span class="tok-function">acme</span> deploy <span class="tok-property">--region</span> ' +
        '<span class="tok-string">"eu west"</span> <span class="tok-comment"># now</span>',
    ]);
  });

  test("colours JSON, TOML, YAML and TypeScript", () => {
    expect(lightHighlightLines('{"a": 1}', "json")[0]).toBe(
      '<span class="tok-punctuation">{</span><span class="tok-property">"a"</span>' +
        '<span class="tok-punctuation">:</span> <span class="tok-number">1</span>' +
        '<span class="tok-punctuation">}</span>',
    );
    expect(lightHighlightLines("[server]\nport = 80", "toml")).toEqual([
      '<span class="tok-type">[server]</span>',
      '<span class="tok-property">port</span> = <span class="tok-number">80</span>',
    ]);
    expect(lightHighlightLines("name: acme", "yml")[0]).toBe(
      '<span class="tok-property">name</span>: acme',
    );
    expect(lightHighlightLines("const a = await f(1);", "ts")[0]).toBe(
      '<span class="tok-keyword">const</span> a = <span class="tok-keyword">await</span> ' +
        '<span class="tok-function">f</span>(<span class="tok-number">1</span>);',
    );
  });

  test("a token spanning lines is cut at each, and unknown languages are plain and escaped", () => {
    expect(lightHighlightLines("/* a\nb */", "ts")).toEqual([
      '<span class="tok-comment">/* a</span>',
      '<span class="tok-comment">b */</span>',
    ]);
    expect(lightHighlightLines("<a>\n&", "cobol")).toEqual(["&lt;a&gt;", "&amp;"]);
  });
});

describe("content types", () => {
  test("a declared type picks the language, or plain text", () => {
    expect(languageForContentType("application/json; charset=utf-8")).toBe("json");
    expect(languageForContentType("application/problem+json")).toBe("json");
    expect(languageForContentType("text/html")).toBe("html");
    expect(languageForContentType("application/xml")).toBe("xml");
    expect(languageForContentType("text/javascript")).toBe("javascript");
    expect(languageForContentType("text/plain", "{}")).toBeUndefined();
  });

  test("with no type, the body's start decides", () => {
    expect(languageForContentType(undefined, '  {"a":1}')).toBe("json");
    expect(languageForContentType(null, "[1]")).toBe("json");
    expect(languageForContentType("", '<?xml version="1.0"?><a/>')).toBe("xml");
    expect(languageForContentType(undefined, "<!doctype html>")).toBe("html");
    expect(languageForContentType(undefined, "hello")).toBeUndefined();
  });

  test("prettyJson indents what parses and returns what does not", () => {
    expect(prettyJson('{"a":[1,2]}')).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(prettyJson('{"a":[1,')).toBe('{"a":[1,');
  });
});

describe("terminal lines", () => {
  test("every line is a command except a continued or a blank one", () => {
    const lines = terminalLines("docker run \\\n  --name acme \\\n  acme/app\n\nacme status");
    expect(lines.map((one) => one.kind)).toEqual([
      "command",
      "continued",
      "continued",
      "blank",
      "command",
    ]);
    expect(terminalCommands(lines)).toBe(
      "docker run \\\n  --name acme \\\n  acme/app\nacme status",
    );
  });

  test("a transcript's commands start with the prompt, and what they print is output", () => {
    const lines = terminalLines("$ acme status\nAll 3 up\n$ acme logs \\\n  --tail\nok", true);
    expect(lines).toEqual([
      { kind: "command", text: "acme status" },
      { kind: "output", text: "All 3 up" },
      { kind: "command", text: "acme logs \\" },
      { kind: "continued", text: "  --tail" },
      { kind: "output", text: "ok" },
    ]);
    expect(terminalCommands(lines)).toBe("acme status\nacme logs \\\n  --tail");
  });
});

describe("shellQuote", () => {
  test("quotes only what needs it, and keeps a variable expandable", () => {
    expect(shellQuote("eu-west-1")).toBe("eu-west-1");
    expect(shellQuote("https://acme.example.com/a?b=1")).toBe("'https://acme.example.com/a?b=1'");
    expect(shellQuote("$API_TOKEN")).toBe('"$API_TOKEN"');
    expect(shellQuote("*.example.com")).toBe("'*.example.com'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote("")).toBe("''");
  });
});
