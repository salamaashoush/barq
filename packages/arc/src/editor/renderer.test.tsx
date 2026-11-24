import { afterEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { ariaViolations, cleanup, render, screen, waitFor } from "@barqjs/testing";

import { loadLanguage } from "../code/languages.ts";
import { hydrates } from "../test-arc.ts";
import { serverProcess } from "../ssr-harness.ts";
import { defineBlock } from "./blocks.tsx";
import { markdownToDocument } from "./document.ts";
import { RichTextRenderer } from "./renderer.tsx";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

const NOTES = [
  "# Release",
  "",
  "Some **bold**, *italic*, ~~old~~ and `code`, see [the docs](https://example.com/docs) or [settings](/settings).",
  "",
  "- [x] shipped",
  "- [ ] next",
  "",
  "| Name | Role |",
  "| --- | --- |",
  "| Salama | Owner |",
  "",
  "```ts",
  "const a = 1;",
  "```",
  "",
  "Thanks [@Sam Roe](mention:sam)",
].join("\n");

interface NoteData {
  text: string;
}

describe("RichTextRenderer", () => {
  test("draws markdown as plain elements in Prose's type", async () => {
    await loadLanguage("typescript");
    render(() => <RichTextRenderer markdown={NOTES} />);
    const root = document.querySelector('[data-slot="rich-text"]');
    expect(root?.querySelector("h1")?.textContent).toBe("Release");
    expect(root?.querySelector("strong")?.textContent).toBe("bold");
    expect(root?.querySelector("em")?.textContent).toBe("italic");
    expect(root?.querySelector("p code")?.textContent).toBe("code");
    expect(screen.getByRole("link", { name: /the docs/ }).getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: "settings" }).getAttribute("href")).toBe("/settings");
    const checks = screen.getAllByRole("checkbox");
    expect(checks.map((one) => one.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(root?.querySelector("th")?.textContent).toBe("Name");
    expect(root?.querySelector("td")?.textContent).toBe("Salama");
    await waitFor(() =>
      expect(root?.querySelector('[data-slot="code-block"] .tok-keyword')?.textContent).toBe(
        "const",
      ),
    );
    const mention = root?.querySelector<HTMLElement>('[data-slot="mention"]');
    expect(mention?.textContent).toBe("@Sam Roe");
    expect(mention?.dataset.mentionId).toBe("sam");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("draws a stored document, its headings shifted under a page's own", () => {
    const value = markdownToDocument("# Title\n\n## Part");
    render(() => <RichTextRenderer value={value} headingOffset={1} />);
    expect(document.querySelector("h2")?.textContent).toBe("Title");
    expect(document.querySelector("h3")?.textContent).toBe("Part");
    expect(document.querySelector("h1")).toBeNull();
  });

  test("hands mentions to the app and links to its routes", () => {
    render(() => (
      <RichTextRenderer
        markdown="Ask [@Sam Roe](mention:sam) about [the plan](https://app.example.com/plan)"
        renderMention={(mention) => <a href={`/people/${mention.id}`}>{mention.name}</a>}
        linkHref={(url) => url.replace("https://app.example.com", "")}
      />
    ));
    expect(screen.getByRole("link", { name: "Sam Roe" }).getAttribute("href")).toBe("/people/sam");
    expect(screen.getByRole("link", { name: "the plan" }).getAttribute("href")).toBe("/plan");
  });

  test("an app's block draws with its own component, read-only", () => {
    const Note = defineBlock<NoteData>({
      type: "acme-note",
      label: "Note",
      defaultData: () => ({ text: "" }),
      component: (props) => <aside data-editable={String(props.editable)}>{props.data.text}</aside>,
      fromMarkdown: { regExp: /^> \[!note\] (.+)$/, data: (match) => ({ text: match[1] ?? "" }) },
    });
    render(() => <RichTextRenderer markdown="> [!note] Bring water" extensions={[Note]} />);
    const aside = document.querySelector("aside");
    expect(aside?.textContent).toBe("Bring water");
    expect(aside?.getAttribute("data-editable")).toBe("false");
  });

  test("each block takes the direction of its own text", () => {
    render(() => <RichTextRenderer markdown={"مرحبا\n\nHello"} />);
    const paragraphs = [...document.querySelectorAll("p")];
    expect(paragraphs.map((one) => one.getAttribute("dir"))).toEqual(["auto", "auto"]);
  });

  test("takes a class per part", () => {
    render(() => (
      <RichTextRenderer
        markdown={"x [@A](mention:a)\n\n| a |\n| --- |\n| b |"}
        class="mine"
        classes={{ root: "r", mention: "m", tableScroller: "t" }}
      />
    ));
    const root = document.querySelector('[data-slot="rich-text"]');
    expect(root?.classList.contains("mine")).toBe(true);
    expect(root?.classList.contains("r")).toBe(true);
    expect(root?.querySelector('[data-slot="mention"]')?.classList.contains("m")).toBe(true);
    expect(root?.querySelector("table")?.parentElement?.classList.contains("t")).toBe(true);
  });
});

describe("RichTextRenderer on a server", () => {
  test("writes the whole document, code highlighted, in a process with no DOM", async () => {
    const { code, html, errors } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { RichTextRenderer } from ${entry};
      export async function page() {
        return await renderToStringAsync(() => (
          <RichTextRenderer markdown={${JSON.stringify(NOTES)}} />
        ));
      }
    `);
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('data-slot="rich-text"');
    expect(html).toContain("<h1");
    expect(html).toContain('<span class="tok-keyword">const</span>');
    expect(html).toContain('data-mention-id="sam"');
    expect(html).toContain('role="checkbox"');
  });

  test("hydrates what the server wrote", async () => {
    const result = await hydrates(`
      import { RichTextRenderer } from ${entry};
      export function Page() {
        return <RichTextRenderer markdown={"# Hi\\n\\nSee [@Sam](mention:s) and **this**"} />;
      }
    `);
    expect(result.container.querySelector("h1")?.textContent).toBe("Hi");
    result.unmount();
  });
});
