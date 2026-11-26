# Editor parity

What `@barqjs/arc/editor` has of the rich-text editor it is generalised
from, line by line, and what is left, by phase. The source is a React and
Lexical 0.53 editor package of about 50,500 lines in 191 files; every path
below is relative to that package's `src/`.

Each line reads: **feature**: classification; status; source file.

- **generic** is in arc: any document editor wants it.
- **domain** stays in the app, built from arc's pieces through
  `defineEditorExtension` and `defineBlock`. A domain line is never pending
  in arc; its status says what arc gives the app to build it with.
- **done** names the arc test that pins it. **pending** names the phase that
  owns it (see "Phases" at the end).

Stored node types and their fields keep the source's names (`callout` with
`tone`, `columns` with `layout`, `toggle` with `open`, `pagebreak`,
`footnote` with `note` and `source`, `image` with `fileId`, `alt`, `size`
and `credit`), so documents saved by the source open in arc unchanged. A
block made with `defineBlock` is stored as its data's fields beside the
node's own `type`, `version` and `format`, the shape the source's hand-made
nodes have.

Borderline calls are justified where they are made.

## Extension architecture

- **One registration for a feature**: generic; done, extension.test.tsx; blocks.ts, extensions.ts, markdown.ts, view.tsx, theme.ts, strings.ts. The source spreads a block over six places joined by a type string; `defineEditorExtension` holds nodes, blocks, Lexical extensions, transforms, theme, commands, toolbar, floating-bar and block-menu items, keys, paste rules, markdown, HTML and Word rules, renderer output, collaboration exclusions, plugins, a footer and a lazy module in one value.
- **Every built-in on the same API**: generic; done, extension.test.tsx, typeahead.test.tsx; blocks.ts. Rich text, tables, dividers, images, embeds, mentions and every phase-1 block are extensions; `defineBlock` returns one.
- **Presets** (document, chat, comment): generic; done, extension.test.tsx, chat-composer.test.tsx, comment-composer.test.tsx; Editor.tsx (variants document, field, message).
- **Add, remove or replace a built-in**: generic; done, extension.test.tsx; blocks.ts (`offered` scope gating).
- **Dependencies resolved before what needs them, each once**: generic; done, extension.test.tsx; headless.ts.
- **Lazy heavy module per extension**: generic; done, extension.test.tsx, docx-import.test.tsx; modals.ts, math.tsx.
- **Insert command per place** (slash, toolbar Insert, block picker): generic; done, typeahead.test.tsx, extension.test.tsx; blocks.ts, plugins/SlashMenu.tsx, plugins/insert-tool.tsx.
- **Scope gating by host capability** (`available`): generic; done, media.test.tsx (an editor with no upload offers no image); blocks.ts.
- **Block-menu choices for a block** (a callout's tone, columns' layout): generic; done, callout.test.tsx, containers.test.tsx, extension.test.tsx; plugins/BlockHandle.tsx.
- **Strings through `ArcMessages`**: generic; done, every phase-1 test reads arc's words; strings.ts.
- **Renderer output per node and after the document**: generic; done, footnote.test.tsx, callout.test.tsx; view.tsx.
- **Server drawing that the editor takes over**: generic; done, callout.test.tsx, containers.test.tsx, footnote.test.tsx; face.tsx, nodes/drawn.ts.
- **Words for listeners with no component** (`editorMessages`): generic; done, containers.test.tsx (a toggle's announcement); context.tsx.
- **Collaboration exclusions per extension**: generic; pending, phase 12; Editor.tsx.
- **Why a block is not offered, for an assistant**: generic; pending, phase 13; blocks.ts (`whyNotOffered`).

## Editor shell

- **Document, field and message variants**: generic; done, rich-text-editor.test.tsx, chat-composer.test.tsx; Editor.tsx, frame.ts.
- **Change handed over after typing pauses, at once on blur and unmount**: generic; done, rich-text-editor.test.tsx (the pause), shell.test.tsx (blur and unmount); Editor.tsx.
- **Validity callback and an invalid line**: generic (the app's schema check becomes `validate`); done, shell.test.tsx; Editor.tsx.
- **Character count for a field, words and reading time for a document**: generic; done, rich-text-editor.test.tsx, find.test.tsx; Editor.tsx, plugins/document-status.tsx.
- **Undo history capped, none on a shared document**: generic; done, shell.test.tsx (`historyLimit`, 200 by default); Editor.tsx.
- **`replace` the whole content as one edit, quietly or not**: generic; done, shell.test.tsx (`replaceDocument`, a function on the editor rather than a prop); Editor.tsx.
- **Disabled, initial focus, placeholder, label**: generic; done, rich-text-editor.test.tsx, shell.test.tsx (`autoFocus`); Editor.tsx.
- **Document direction and language, detected or set**: generic (any BCP 47 `language`, not two); done, shell.test.tsx; Editor.tsx, plugins/Direction.tsx, direction.spec.tsx, language.spec.tsx.
- **Lines without letters follow the document's direction**: generic; done, shell.test.tsx; plugins/Direction.tsx.
- **Each block's direction from its own text**: generic; done, rich-text-editor.test.tsx; plugins/Direction.tsx.
- **Focus mode**: generic; done, find.test.tsx; Editor.tsx, plugins/document-status.tsx.
- **Arabic digits for numbers the document draws**: generic; done, footnote.test.tsx; format.ts, view.tsx.
- **Young readers' sizing**: domain (sized for early readers, chosen per course); arc gives `classes` and `theme`; Editor.tsx.
- **Editor found by its field's id after a late upload**: generic; pending, phase 4; slots.ts.
- **Host services for media, mentions, comments, the assistant**: generic; done for uploads and mentions (media.test.tsx, typeahead.test.tsx), pending for the rest by their phases; context.tsx.
- **Host services for studio, puzzles, bank and standards**: domain; arc gives `defineEditorExtension` with plugins and commands; context.tsx.
- **Feature flags for questions, forms, gates, draws, starter, narration**: domain; arc gives presets and `customizeExtensions`; Editor.tsx, context.tsx.
- **Large-document and every-block fixtures for performance and coverage**: generic; done, fixtures.test.tsx (every node type the document preset knows, read, drawn and hydrated; a long document's budgets); large-document.ts, every-block.ts.

## Text and formatting

- **Bold, italic, underline, strikethrough, inline code**: generic; done, rich-text-editor.test.tsx; formatting.ts, plugins/Toolbar.tsx.
- **Superscript and subscript, Mod+. and Mod+,**: generic; done, formatting.test.tsx; extensions.ts, shortcuts.spec.ts.
- **Text colour and highlight from nine colours**: generic; done, formatting.test.tsx (the source's colours, so its documents show theirs as chosen); formatting.ts, plugins/SelectionToolbar.tsx.
- **Text size small, large, huge**: generic; done, formatting.test.tsx; formatting.ts, writing.spec.ts.
- **Clear formatting, Mod+\\**: generic; done, formatting.test.tsx; formatting.ts.
- **Yellow highlight, Mod+Shift+H; strikethrough Mod+Shift+S**: generic; done, formatting.test.tsx (Mod+Shift+X strikes through as well, rich-text-editor.test.tsx); extensions.ts.
- **Headings, lists, check lists, quote, code by keys** (Mod+Alt+0 to 3, Mod+Shift+7 to 9): generic; done, rich-text-editor.test.tsx (Mod+Shift+8 through the extension key path every binding shares); extensions.ts.
- **Link editor: normalise, check, apply, remove; view mode with open, edit, unlink**: generic; done, rich-text-editor.test.tsx, floating.test.tsx (the view mode); formatting.ts, plugins/SelectionToolbar.tsx.
- **A link on a collapsed caret inserts the address as its text**: generic; done, floating.test.tsx; formatting.ts.
- **Pasted styles kept to colour, highlight, size and first font**: generic; done, paste.test.tsx; extensions.ts, blocks.spec.ts.
- **Unsafe links unwrapped to their words**: generic; done, paste.test.tsx; extensions.ts.
- **Text-format and theme helpers** (number tags, bytes, clock, logical alignment): generic; done for the clock (text-tracks.test.tsx) and alignment (rich-text-editor.test.tsx), pending for bytes and sizes in phase 4; format.ts, theme.ts.

## Toolbar, floating bar, menus

- **Toolbar: undo, redo, text style, marks, link, lists, insert**: generic; done, rich-text-editor.test.tsx; plugins/Toolbar.tsx.
- **Toolbar folds into More as it narrows**: generic; done, rich-text-editor.test.tsx; plugins/Toolbar.tsx.
- **Extension buttons on the toolbar and over selected text**: generic; done, find.test.tsx, footnote.test.tsx, extension.test.tsx; plugins/Toolbar.tsx, plugins/SelectionToolbar.tsx.
- **Find and replace in More, Mod+F by key code**: generic; done, find.test.tsx; plugins/Toolbar.tsx.
- **Markdown dialog: the document as markdown, replace from markdown**: generic; done, markdown-dialog.test.tsx; plugins/markdown-dialog.tsx.
- **Floating bar shows for a range outside code, hides on pointer down**: generic; done, floating.test.tsx; plugins/SelectionToolbar.tsx.
- **Floating bar: Alt+F10 in, Escape out, Tab from a selected block**: generic; done, floating.test.tsx, formatting.test.tsx (its arrows right to left in Arabic); a block chosen whole has a bar of its own, Duplicate and Delete, which the source gave its media only; plugins/SelectionToolbar.tsx.
- **Floating bar: turn into, colours, size, clear, comment, assistant**: generic; done for turn into, colours, size and clear (floating.test.tsx, formatting.test.tsx), pending comment in phase 11 and assistant in phase 13; plugins/SelectionToolbar.tsx.
- **Slash menu: grouped, ranked, Enter takes the first match**: generic; done, typeahead.test.tsx; plugins/SlashMenu.tsx, plugins/typeahead.tsx, slash-query.spec.ts.
- **Insert picker with group chips**: generic; done, block-editor.test.tsx, block-shell.test.tsx (the chips); plugins/insert-tool.tsx.
- **Commands of a group sit together**: generic; done, typeahead.test.tsx; blocks.ts (`byGroup`).

## Blocks, handles and structure

- **Block handle: + and grip on the block under the pointer or caret, side flipped in right-to-left**: generic; done, block-editor.test.tsx; plugins/BlockHandle.tsx.
- **Handle climbs out of containers to the top-level block**: generic; done, callout.test.tsx (the menu on a callout); plugins/BlockHandle.tsx.
- **Drag to reorder, by mouse or finger**: generic; done, block-editor.test.tsx; plugins/BlockHandle.tsx.
- **Block menu by right-click and Mod+/**: generic; done, block-shell.test.tsx (the menu opens at the block's grip rather than the pointer, the same place a keyboard opens it); plugins/BlockHandle.tsx.
- **Block menu: cut, copy, paste, paste as plain text**: generic; done, paste.test.tsx; plugins/BlockHandle.tsx, clipboard.ts.
- **Block menu: turn into, duplicate, move up and down, delete**: generic; done, block-editor.test.tsx; plugins/BlockHandle.tsx, blocks.ts.
- **Block menu: callout tone, column layout**: generic; done, callout.test.tsx, containers.test.tsx; plugins/BlockHandle.tsx.
- **Turn into callout and toggle, unwrapping first**: generic; done, block-shell.test.tsx, floating.test.tsx, through each extension's `turnInto`; blocks.ts.
- **Duplicate Mod+D, move Alt+Shift+arrows**: generic; done, block-shell.test.tsx (Mod+Shift with the arrows moves as well, block-editor.test.tsx); extensions.ts.
- **Placement rules: cells take text only, some blocks only at the top level, no callout in a callout**: generic; done, callout.test.tsx, block-shell.test.tsx (a block chosen in a cell goes after its table); blocks.ts.
- **A line always follows a block that ends the document**: generic; done, containers.test.tsx; blocks.ts.
- **Typing with a block selected starts a line after it**: generic; done, block-shell.test.tsx; extensions.ts.
- **Stable block ids on every block, re-made when shared**: generic; pending, phase 11 (comments anchor on them); extensions.ts, format.ts.
- **Arrow keys leave a container at its edges**: generic; done, callout.test.tsx (shared by callouts, columns and toggles through `registerContainerKeys`); extensions.ts.
- **Placeholders: empty document, empty heading, list item, quote, the caret's line**: generic; done, block-editor.test.tsx; plugins/Placeholder.tsx.
- **Placeholders in a toggle's title, a panel's title, a one-line callout**: generic; done, block-shell.test.tsx (a toggle's title, a one-line callout), panels.test.tsx (a panel's title, worded for its layout), each through its extension's `placeholder`; plugins/Placeholder.tsx.
- **Divider before the line, caret kept**: generic; done, block-shell.test.tsx; blocks.ts.

## Callouts, columns, toggles, panels, page breaks

- **Callout with five tones, imported from `aside[data-callout]`, exported as a note**: generic; done, callout.test.tsx, paste.test.tsx; nodes/callout.ts.
- **Callout: Backspace at its start unwraps it; refilled when emptied**: generic; done, callout.test.tsx; nodes/callout.ts, extensions.ts.
- **Callout: Enter on an empty last line leaves it**: generic; done, callout.test.tsx; extensions.ts.
- **Callout in markdown** (the source wrote quoted lines it could not read back; arc writes and reads `> [!tone]`): generic; done, callout.test.tsx; markdown.ts.
- **Columns: two to four at 1:1, 1:2, 2:1, 1:1:1, 1:1:1:1, stacked on a narrow screen**: generic; done, containers.test.tsx; nodes/columns.ts.
- **Columns: the layout changes, new columns empty, a lost column's blocks moved over**: generic; done, containers.test.tsx; plugins/BlockHandle.tsx.
- **Columns: a stray column or a set of one unwraps; Backspace in an empty set removes it**: generic; done, containers.test.tsx; nodes/columns.ts, extensions.ts.
- **Columns in markdown, each column in turn**: generic; done, containers.test.tsx; markdown.ts.
- **Toggle: open state saved, content hidden while closed**: generic; done, containers.test.tsx; nodes/toggle.ts.
- **Toggle: a press on its arrow opens and closes it, mirrored in right-to-left**: generic; done, containers.test.tsx; nodes/toggle.ts.
- **Toggle: Enter in the title goes into the content, opening it; in a closed one, to a line after**: generic; done, containers.test.tsx; nodes/toggle.ts, extensions.ts.
- **Toggle: Backspace at its start unwraps it, the title a line**: generic; done, containers.test.tsx; nodes/toggle.ts.
- **Toggle read as `<details>`, written as `<details>` in HTML and markdown**: generic; done, containers.test.tsx, paste.test.tsx; nodes/toggle.ts, view.tsx.
- **Toggle opened and closed from the keyboard, announced** (the source had a pointer zone only; arc adds Mod+Enter): generic; done, containers.test.tsx; nodes/toggle.ts.
- **Panels: tabs, steps, timeline, cards, choices, a layout switch that loses nothing**: generic (tabs and steps are a document's own structure; the source's "choices" are branching paths any guide uses); done, panels.test.tsx (read on ui's `Tabs` and arc's `Timeline`, keys, pointer, touch, right-to-left, markdown and HTML as `<section data-panels>`, the server and hydration); nodes/panels.ts, panels-view.tsx, panels-view.spec.tsx.
- **Panels: Enter moves title to body, an empty last body line starts a new part, at most twelve**: generic; done, panels.test.tsx (with Backspace at a title's start, and the block menu's new part through `blockActions`); extensions.ts.
- **Page break, drawn as a named dashed line, read as a printed page's end**: generic; done, containers.test.tsx; nodes/page-break.tsx.
- **Page break read from HTML's page-break styles**: generic; done, paste.test.tsx (`data-page-break`); nodes/page-break.tsx.
- **Student copy region**: domain (the part of a brief each learner gets a copy of); arc gives an element block through `defineEditorExtension` with `$placeContainer`; nodes/starter.ts.

## Footnotes, glossary, bibliography

- **Footnote: a number in the line, numbered in reading order**: generic; done, footnote.test.tsx; nodes/footnote.tsx.
- **Footnote: Mod+Alt+F after the words chosen, written in a popover from its number**: generic; done, footnote.test.tsx; nodes/footnote.tsx, plugins/footnote-panel.tsx.
- **Footnote left with no words is not kept; removed from its popover**: generic; done, footnote.test.tsx; plugins/SelectionToolbar.tsx.
- **Footnotes listed under the document, linked both ways, in the reader's digits**: generic; done, footnote.test.tsx; view.tsx, footnote.spec.tsx.
- **Footnote numbering runs on across a document drawn in parts**: generic; pending, phase 10; view.tsx.
- **Footnote read from `sup[data-footnote]` and from a Word document's notes**: generic; done, paste.test.tsx, docx-import.test.tsx; nodes/footnote.tsx, plugins/word.tsx.
- **Footnote in markdown as Pandoc's `^[note]`** (the source left it out): generic; done, footnote.test.tsx; markdown.ts.
- **Footnote cites a source in APA, MLA or Chicago, previewed as typed**: generic; pending, phase 10 (the `source` field is kept as stored, footnote.tsx); plugins/footnote-panel.tsx.
- **Bibliography block: the sources cited, sorted by the chosen style**: generic; pending, phase 10; nodes/bibliography.tsx, bibliography-view.tsx.
- **Term: words wrapped with a definition, a gloss and a picture; edges do not grow**: generic (a glossary of terms is a reference document's, not only a learner's); pending, phase 9; nodes/term.ts, plugins/term-panel.tsx, glossary.spec.tsx.
- **Term read as a popover on tap or hover, with an optional speak button**: generic; pending, phase 9; view.tsx.
- **Glossary block: every term once, sorted for the locale**: generic; pending, phase 9; nodes/glossary.tsx, glossary-view.tsx.
- **Glossary to flash cards and to a matching question**: domain (study aids built on the question model); arc gives panels and `defineEditorExtension` commands; nodes/glossary.tsx.

## Find, status and clipboard

- **Find folds Arabic marks and alef forms, keeps offsets, finds across bold and links**: generic; done, find.test.tsx; find.ts, plugins/find.tsx, find.spec.ts.
- **Find: case, whole words, count, next and previous, highlights without touching the text**: generic; done, find.test.tsx; plugins/find.tsx.
- **Replace one and all, the caret kept in the panel; finding alone when read-only**: generic; done, find.test.tsx; plugins/find.tsx.
- **Escape closes find and selects the match in hand**: generic; done, find.test.tsx; plugins/find.tsx.
- **Outline of every heading, those in blocks too, jumped to from a menu**: generic; done, find.test.tsx; plugins/document-status.tsx, document-status.spec.ts.
- **Focus mode by Mod+Shift+\\ and Escape, body scroll locked**: generic; done, find.test.tsx; plugins/document-status.tsx.
- **A copy made in the editor pastes whole while the clipboard holds its text**: generic; done, paste.test.tsx; clipboard.ts.
- **Paste: spreadsheet cells into a table from the cell in hand, growing it, or as a new table**: generic; done, paste.test.tsx; plugins/paste.ts, plugins/table-grid.ts, table-grid.spec.ts.
- **Paste: an address over words links them**: generic; done, paste.test.tsx; plugins/paste.ts.
- **Paste: an embeddable address on an empty line, or embed code, embeds**: generic; done, paste.test.tsx; plugins/paste.ts, plugins/embed.tsx.
- **Paste: markdown from a chat or an assistant**: generic; done, paste.test.tsx; plugins/paste.ts.
- **Paste: HTML through every extension, pictures and embeds as blocks**: generic; done, paste.test.tsx; html-import.ts.
- **Paste: a Wikimedia Commons link becomes a credited picture**: generic; pending, phase 4; plugins/paste.ts, plugins/media.tsx.

## Import

- **HTML as a document, headless**: generic; done, paste.test.tsx; html-import.ts, html-import.spec.ts.
- **Stored files addressed in imported HTML** (`<scheme>-file:` links, files and recordings): generic; pending, phase 4 (pictures and embeds done); nodes/stored.ts, html-import.spec.ts.
- **Word: headings, lists, tables, links, pictures where the caret is**: generic; done, docx-import.test.tsx; plugins/word.tsx.
- **Word: footnotes and endnotes as footnotes**: generic; done, docx-import.test.tsx; plugins/word.tsx.
- **Word: equations to LaTeX** (fractions, powers, roots, sums, brackets, matrices, functions, limits, accents): generic; done, docx-import.test.tsx; omml.ts, docx.ts, docx.spec.ts.
- **Word: equations as formula nodes**: generic; pending, phase 5 (each equation comes in as its LaTeX in code until the math extension's `docx.formula` rule takes it); docx.ts.
- **Word: pictures uploaded as read, those that cannot be shown counted**: generic; done, docx-import.test.tsx; plugins/word.tsx.
- **Word: each picture at its size on the page**: generic; done, picture.test.tsx (its share of the page's text width, read before mammoth drops it, becomes the picture's size); docx.ts.
- **Word: chosen from Insert or `/word`, dropped on the editor, a card that says how it went**: generic; done, docx-import.test.tsx; plugins/word.tsx.
- **Word reader loads only when a document is read**: generic; done, docx-import.test.tsx; plugins/word.tsx.
- **Markdown read in pieces for a streamed reply**: generic; done, document.test.ts (`markdownToDocument`); markdown-import.ts.

## Tables and code

- **Table inserted from a size grid chosen by pointer or arrows, with a header row**: generic; done, rich-text-extras.test.tsx; plugins/table-size.tsx, table-size.spec.tsx.
- **Column resize by edge and arrows, widths kept**: generic; done, rich-text-extras.test.tsx; plugins/Table.tsx.
- **Row and column grips: select, drag to move, menus**: generic; done, tables.test.tsx (Alt with the arrows moves a line from its grip too); plugins/Table.tsx.
- **Insert, move, delete rows and columns; header row and column**: generic; done, rich-text-extras.test.tsx, tables.test.tsx; plugins/Table.tsx.
- **Merge and split cells, cell colour, alignment, vertical alignment, stripes**: generic; done, tables.test.tsx; plugins/Table.tsx.
- **Tab in the last cell adds a row; a line above or below a table**: generic; done, tables.test.tsx; plugins/table-grid.ts.
- **Code block highlighted, language chosen, copied**: generic; done, rich-text-editor.test.tsx, renderer.test.tsx, code-tools.test.tsx (the language menu, gutter and copy); plugins/code-block.tsx, code-language.ts.
- **Runnable code with the runner as a slot**: generic; pending, phase 8; nodes/code-run.ts, view.tsx.
- **Run or predict, locked until the question above is answered**: domain (prediction ties code to a question); arc gives the runner slot; nodes/code-run.ts, view.tsx.
- **Scratch scripts drawn as blocks**: domain (a teaching language); arc gives a code-language extension point; scratch-blocks.tsx.

## Media

- **Image: alt, caption, uploaded, pasted, dropped**: generic; done, media.test.tsx; nodes/media.tsx.
- **Image: four sizes, alignment, decorative, alt-missing warning, focus point**: generic; done, picture.test.tsx (sizes and alignment from the block menu, alignment kept as the node's `format` and written on the inline axis; the focus point by pointer and by the arrows, which keep the picture's own left and right); nodes/media.tsx, media.spec.ts.
- **Image: credit line with licences**: generic; done, picture.test.tsx; picture-credit*.tsx, media.spec.ts.
- **Labelled picture: numbered markers with descriptions**: generic (an annotated figure); done, picture.test.tsx (placed by drag and by the arrows, opened one at a time by the reader, listed on paper); picture-labels.tsx.
- **Gallery: grid, viewer, reorder, up to twenty-four**: generic; pending, phase 4; nodes/pictures.tsx, pictures-view.tsx, gallery.spec.tsx.
- **Before and after comparison slider**: generic (image comparison is common in docs); pending, phase 4; nodes/pictures.tsx.
- **File block: card or PDF preview, new version keeping its first id, viewer**: generic; pending, phase 4; nodes/media.tsx, files.tsx, file-viewer.tsx.
- **Video and audio block with captions, transcript, chapters, audio description**: generic; pending, phase 4 (the player is arc's `MediaPlayer`); nodes/rich.tsx, media-view.tsx, player.tsx.
- **Captions, audio description and transcript written beside the recording**: generic; done, text-tracks.test.tsx; captions.tsx.
- **Captions drafted from speech by a service**: generic; done, text-tracks.test.tsx; captions.tsx.
- **Chapter markers set at the player's time**: generic; pending, phase 4; markers.tsx.
- **Voice and video recorders, screen with camera, trim**: generic; pending, phase 4 (arc's `ClipRecorder` records audio and video); recorder.tsx, video-recorder.tsx.
- **Embeds: fourteen providers, click to load, chapters for two**: generic; done for YouTube and Vimeo (media.test.tsx), pending the other providers and click-to-load in phase 4; nodes/rich.tsx, plugins/embed.tsx.
- **Upload queue: progress, cancel, retry, resumed after reload, warned on leaving**: generic; done for progress, retry and remove (media.test.tsx), pending resume and the leave warning in phase 4; plugins/media.tsx.
- **Upload errors mapped to words** (too large, wrong type, infected, quota): generic, the quota words domain; pending, phase 4; plugins/media.tsx.
- **Media library chooser and keep-in-library**: generic (a media library slot); pending, phase 4; context.tsx, plugins/keep-in-media.tsx.
- **Picture search over open collections**: generic; pending, phase 4; plugins/picture-search.tsx.
- **Colouring-page pictures in picture search**: domain (line drawings for young learners); arc gives the search slot; plugins/picture-search.tsx.
- **People shown in a picture, by consent**: domain (learner photo consent); arc gives a block-menu choice; plugins/SelectionToolbar.tsx.
- **No skipping, watch tracking, a question at the video's time**: domain (learner progress); arc gives the player's `onTimeUpdate` and commands; nodes/rich.tsx, player.tsx.

## Math, charts, graphs, drawings

- **Inline and display math from LaTeX, `$...$` and `$$...$$`**: generic; pending, phase 5; nodes/math.tsx, math.spec.ts.
- **Math field with a virtual keyboard, loaded lazily, keys replayed**: generic; pending, phase 5; plugins/math-field.tsx, math-input.tsx, math-input.spec.tsx.
- **Math drawn as MathML, lazily**: generic; pending, phase 5; math-view.tsx, math.tsx.
- **Arabic math notation**: generic (a right-to-left reader's notation, not a course's); pending, phase 5; nodes/math.tsx.
- **Alt+= inserts or selects a formula**: generic; pending, phase 5; extensions.ts.
- **Chart: bar, line, pie, data grid, units, stacked, chart or table**: generic; pending, phase 6; nodes/chart.tsx, chart-view.tsx, chart-view.spec.tsx.
- **Spreadsheet paste into a chart's grid**: generic; pending, phase 6; chart-paste.ts, chart-paste.spec.ts.
- **Graph: functions of x, points, ranges**: generic (a function plotter); pending, phase 7; nodes/graph.tsx, graph-view.tsx.
- **Drawing on a whiteboard, stored as a picture and its scene**: generic; pending, phase 7 (through `@barqjs/diagram`); nodes/rich.tsx, plugins/diagram*.tsx, DiagramBoard.tsx.
- **Fraction bars, base-ten blocks, number lines**: domain (primary maths manipulatives); arc gives `defineBlock` and the block dialog; nodes/math-model.tsx, math-model-view.tsx.
- **Block edit dialog: one undo step, preview beside the form**: generic; pending, phase 6; plugins/block-edit*.tsx, block-edit.spec.tsx.

## Mentions, comments, shared blocks

- **Mentions by `@` with a debounced search**: generic; done, typeahead.test.tsx; plugins/mentions.tsx, mention.spec.tsx.
- **Mentions keep their written name and show the current one; the reader links them**: generic; done for links (renderer.test.tsx), pending the current name in phase 11; nodes/mention.tsx, view.tsx.
- **Mention kinds for classes, courses, lessons, assignments**: domain (the kinds are course entities); arc's `MentionSource` takes any candidates; plugins/mentions.tsx.
- **Comments anchored by block and offset, surviving edits**: generic; pending, phase 11; comments.ts, comments.spec.ts, anchors.ts.
- **Comment highlights, Mod+Alt+M, a thread opened from its passage, ordered for a panel**: generic; pending, phase 11; plugins/comments.tsx.
- **Comment marks in the reader**: generic; pending, phase 11; view.tsx.
- **Shared blocks: kept, inserted, edited where kept, copied here**: generic (synced blocks; which blocks a source refuses, the source's questions among them, is the app's `sharable`); done, shared-block.test.tsx (through `sharedBlockExtension({ source })`); nodes/shared.tsx, plugins/shared.tsx.

## Collaboration and headless

- **A shared document over Yjs, cursors in tones**: generic; done, collaboration.test.tsx; Editor.tsx.
- **The writer's own other tabs draw no cursor; synced and lost told to the host**: generic; pending, phase 12; Editor.tsx, live.spec.tsx.
- **Headless editor with the screen editor's extensions**: generic; done, document.test.ts; headless.ts.
- **Server binding: seed an empty room from stored JSON, apply stored updates, derive JSON on store**: generic; pending, phase 12; headless.ts (and the app's Hocuspocus server).

## Assistant

- **Assistant opened with the selection, Mod+J**: generic; pending, phase 13; plugins/assistant.tsx.
- **Agent tools: read the document or selection, the block catalogue, insert, replace, delete, move**: generic; pending, phase 13; agent/*.ts.
- **Withheld nodes behind handles; written blocks checked**: generic; pending, phase 13; agent/nodes.ts, agent/writing.ts.
- **Pictures and diagrams drawn by the assistant, SVG made safe**: generic; pending, phase 13; agent/tools/pictures.ts, agent/drawing.ts, agent/svg.ts.
- **Suggest questions, notes on question kinds, Scratch tools**: domain (the question model and a teaching language); arc gives the assistant's tool registry; agent/notes.ts, agent/scratch-library.ts, plugins/suggest.tsx.
- **AI-use declaration block**: domain. The node's fields (tool, date, prompt, how it was used, evidence) and its wording are a coursework integrity form a learner hands in; a publisher's disclosure would be a different form. arc gives `defineBlock` and the upload queue; nodes/ai-use.tsx, ai-use-view.tsx.

## Domain blocks (stay in the app)

Each is built from arc's pieces through `defineEditorExtension`; the worked
example in the README and extension.test.tsx is such a block.

- **Questions: twenty-three kinds, parts, settings, repair, ids, the bar's settings**: domain; nodes/question.ts, plugins/SelectionToolbar.tsx, question.spec.ts.
- **Question lock once answered, forms mode**: domain; nodes/question.ts.
- **Question guard: questions, gates and copies dropped where an editor takes none**: domain; plugins/questions.ts.
- **Question bank pick and save**: domain; plugins/bank.tsx.
- **Hotspots, labelling regions, letter tracing**: domain; plugins/regions.tsx, plugins/trace.tsx.
- **Continue gate**: domain (a learner's progress gate); nodes/gate.tsx.
- **Random draw from a bank**: domain; nodes/draw.tsx.
- **Curriculum standards block and tagging**: domain; nodes/standards.tsx, plugins/standards.tsx.
- **Narration with word timings**: domain. Read-along exists elsewhere, but here it is recorded per block by a teacher for young readers, timed by tapping, and stored on each block's state; plugins/narration.tsx, nodes/narration.ts.

## Counts

- 196 lines in all: 173 generic, 23 domain.
- Generic: 125 done, 48 pending; a line done in part counts as pending.

## Phases

Sizes are lines of arc code, tests included, estimated from the source's
own sizes.

1. **Extension architecture and the first blocks**: the API,
   presets, callouts, columns, toggles, footnotes, page breaks, find and
   replace, document status, paste rules and clipboard, HTML and Word
   import, captions. About 8,800 lines with tests, landed.
2. **Formatting and the block shell** (about 3,500): superscript and
   subscript, colours and highlight, sizes, clear formatting, the floating
   bar's remaining modes, turn into for containers, Mod+D and Alt+Shift
   moves, typing after a selected block, right-click menu, placeholders in
   containers, direction and language, `replace`, validity, history cap,
   the markdown dialog, table grips, merge and split, colours, stripes, Tab
   rows and the code block's language menu, gutter and copy, fixtures for
   performance and coverage. Landed.
3. **Panels and shared blocks** (about 1,600): tabs, steps, timeline, cards
   and choices with their reader views; shared blocks through a slot.
   Landed.
4. **Media** (about 5,500): image sizes, credits, labels, focus; gallery
   and comparison; files with previews and versions; the video and audio
   block on `MediaPlayer` with chapters and descriptions read aloud; the
   remaining embed providers with click to load; recorders; upload resume
   and errors; media library and picture search slots; Commons pictures;
   stored files in imported HTML.
5. **Math** (about 1,600): the math node, MathML through temml loaded on
   use, MathLive loaded on use with keys replayed, Arabic notation,
   `$...$` markdown, Alt+=, and the `docx.formula` rule for Word.
6. **Charts and the block dialog** (about 1,800): the chart node and view,
   chart paste, the one-step edit dialog.
7. **Graphs and drawings** (about 1,000): the function plotter, and the
   drawing block on `@barqjs/diagram`'s `DiagramEditor` and
   `DiagramViewer`, loaded on use.
8. **Runnable code** (about 400): a runner slot the renderer hands a code
   block to.
9. **Glossary and terms** (about 900): the term node and panel, the reader's
   popover, the glossary block.
10. **Bibliography and citations** (about 800): citation fields and styles
    on footnotes, the bibliography block, numbering across parts.
11. **Anchored comments** (about 1,000): stable block ids, anchors,
    highlights, the threads contract, reader marks, mention names.
12. **Collaboration parity** (about 700): extension exclusions passed to the
    binding, the writer's own tabs, synced and lost, and a headless binding
    a Hocuspocus server seeds, applies and stores through.
13. **Assistant** (about 2,000): the surface, agent tools, withheld nodes,
    the catalogue with reasons, pictures and diagrams, safe SVG.
