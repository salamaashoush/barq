/**
 * Documents for checks that must cover every block, and for timing: what a
 * long document costs to read, draw and type in.
 */

import { $convertFromMarkdownString } from "@lexical/markdown";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  type SerializedEditorState,
} from "lexical";

import { $createColumnNode, $createColumnsNode } from "./columns.tsx";
import { type DocumentOptions, createDocumentEditor, markdownTransformers } from "./document.ts";
import { EmbedBlock } from "./media.tsx";
import { PageBreakBlock } from "./page-break.tsx";
import { HIGHLIGHT_COLOURS, TEXT_COLOURS, TEXT_SIZES } from "./text-style.ts";

const WRITING = [
  "# Every block",
  "Plain **bold** *italic* ~~struck~~ `code` [a link](https://example.com) [@Sam Roe](mention:sam) and a note^[What the note says].",
  "## A list of each kind",
  "- one\n- two\n  - nested",
  "3. third\n4. fourth",
  "- [x] done\n- [ ] to do",
  "> A quote",
  "> [!warning]\n> A callout with **words**",
  "<details open>\n<summary>A toggle</summary>\n\nWhat it holds\n\n</details>",
  '<section data-panels="steps">\n<header>Mix</header>\n\nFlour, then **water**.\n\n<header>Bake</header>\n\nForty minutes.\n\n</section>',
  '<div data-shared-block="kept-block-1"></div>',
  "```ts\nconst a = 1;\nconst b = 2;\n```",
  "| Name | Role |\n| --- | --- |\n| Sam | Owner |",
  "---",
  "![A river at dawn](https://example.com/river.png)",
  '<figure data-gallery><img src="https://example.com/river.png" alt="A river"><img src="https://example.com/bridge.png" alt="A bridge" title="The old bridge"></figure>',
  '<figure data-compare><img src="https://example.com/before.png" alt="The field in May"><img src="https://example.com/after.png" alt="The field in June"></figure>',
  "مرحبا بالعالم، هذا سطر بالعربية",
].join("\n\n");

/**
 * Written text in every form and one of every block the document preset
 * holds, as stored: what a check that must cover all of them reads.
 */
export function everyBlock(options: DocumentOptions = {}): SerializedEditorState {
  const editor = createDocumentEditor(options);
  try {
    editor.update(
      () => {
        $convertFromMarkdownString(WRITING, markdownTransformers(options));
        const root = $getRoot();
        const styled = $createParagraphNode().append(
          $createTextNode("H"),
          $createTextNode("2").toggleFormat("subscript"),
          $createTextNode("O, "),
          $createTextNode("blue").setStyle(`color: ${TEXT_COLOURS.blue}`),
          $createTextNode(" "),
          $createTextNode("marked").setStyle(`background-color: ${HIGHLIGHT_COLOURS.yellow}`),
          $createTextNode(" "),
          $createTextNode("large").setStyle(`font-size: ${TEXT_SIZES.large}`),
        );
        const columns = $createColumnsNode("1:1").append(
          $createColumnNode().append($createParagraphNode().append($createTextNode("Left"))),
          $createColumnNode().append($createParagraphNode().append($createTextNode("Right"))),
        );
        root.append(
          styled,
          columns,
          PageBreakBlock.$create(),
          EmbedBlock.$create({
            url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
            src: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
            title: "A film",
          }),
          $createParagraphNode().append($createTextNode("The end.")),
        );
      },
      { discrete: true },
    );
    return editor.getEditorState().toJSON();
  } finally {
    editor.dispose();
  }
}

const WORDS =
  "the river runs past the old mill and on through the town where the bridge crosses it twice before the sea takes it in".split(
    " ",
  );

function sentence(seed: number, length: number): string {
  return Array.from({ length }, (_, index) => WORDS[(seed * 7 + index * 3) % WORDS.length]).join(
    " ",
  );
}

/**
 * A long document, `sections` headings each over paragraphs with some words
 * bold and some italic, a list and a quote: what timing a long read, draw or
 * keystroke is measured on.
 */
export function largeDocument(sections = 60): string {
  const parts: string[] = [];
  for (let section = 0; section < sections; section++) {
    parts.push(`## Section ${String(section + 1)}`);
    for (let paragraph = 0; paragraph < 5; paragraph++) {
      const seed = section * 5 + paragraph;
      parts.push(
        `${sentence(seed, 24)} **${sentence(seed + 1, 4)}** ${sentence(seed + 2, 18)} *${sentence(seed + 3, 3)}* ${sentence(seed + 4, 12)}.`,
      );
    }
    parts.push(`- ${sentence(section, 6)}\n- ${sentence(section + 1, 6)}`);
    parts.push(`> ${sentence(section + 2, 14)}`);
  }
  return parts.join("\n\n");
}
