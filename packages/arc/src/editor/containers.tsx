import { type Child } from "@barqjs/core";
import { type JSX, dynamic } from "@barqjs/web";
import { $onEscapeDown, $onEscapeUp } from "@lexical/utils";
import {
  $createParagraphNode,
  $getDocument,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  COMMAND_PRIORITY_LOW,
  type ElementNode,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
} from "lexical";

/**
 * An element as a node draws it, described rather than built, so the editor
 * builds it into the page and a server draws the same thing before the
 * editor takes the page over.
 */
export interface Drawn {
  tag: string;
  /** Attributes by their names in markup, such as `class` and `data-tone`. */
  attributes?: Readonly<Record<string, string>>;
}

/** Builds a node's drawn element into the page the editor is in. */
export function buildDrawn(drawn: Drawn): HTMLElement {
  const element = $getDocument().createElement(drawn.tag);
  for (const [name, value] of Object.entries(drawn.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  return element;
}

/** A drawn element in JSX, holding what the renderer draws inside it. */
export function DrawnElement(props: { drawn: Drawn; children?: Child }): JSX.Element {
  const Tag = dynamic(() => props.drawn.tag as "div");
  return <Tag {...props.drawn.attributes}>{props.children}</Tag>;
}

/** The theme's class for a node, as an attribute, or none when the theme has none. */
export function themeClass(name: unknown): Record<string, string> {
  return typeof name === "string" && name !== "" ? { class: name } : {};
}

/** The block at the document's top level that `node` is in, past any container. */
export function $rootBlockOf(node: LexicalNode): LexicalNode | null {
  let current: LexicalNode | null = node;
  while (current !== null) {
    const parent: ElementNode | null = current.getParent();
    if (parent === null) return null;
    if ($isRootNode(parent)) return current;
    current = parent;
  }
  return null;
}

/**
 * Where a container chosen at the caret goes: the block the caret is in,
 * or, where the container may not stand there (in a table's cell, inside
 * one of its own kind, below the top level for one that keeps to it), the
 * top-level block it is in.
 */
function $placementOf(
  anchor: LexicalNode,
  options: { topLevel?: boolean; notInside?: (node: LexicalNode) => boolean },
): LexicalNode | null {
  const near = anchor.getTopLevelElement();
  if (near === null) return null;
  const parents = anchor.getParents();
  const refused =
    options.topLevel === true ||
    parents.some((one) => one.getType() === "tablecell" || options.notInside?.(one) === true);
  return refused ? $rootBlockOf(anchor) : near;
}

/**
 * Puts a container where the caret is: in place of the empty line it is on,
 * or around the block it is in when `wrap` takes that block, or after it.
 * A line follows a container that ends the document, so there is somewhere
 * to type after it.
 */
export function $placeContainer(
  container: ElementNode,
  options: {
    wrap?: (block: ElementNode) => boolean;
    fill: () => LexicalNode[];
    /** Stands only at the document's top level. */
    topLevel?: boolean;
    /** Containers it may not stand inside. */
    notInside?: (node: LexicalNode) => boolean;
  },
): void {
  const selection = $getSelection();
  const top = $isRangeSelection(selection)
    ? $placementOf(selection.anchor.getNode(), options)
    : $getRoot().getLastChild();
  if ($isParagraphNode(top) && top.isEmpty()) {
    top.replace(container);
    container.append(...options.fill());
  } else if (top !== null && $isElementNode(top) && options.wrap?.(top) === true) {
    // The caret stays where it was in the block now inside.
    top.replace(container);
    container.append(top);
    if (container.getNextSibling() === null) container.insertAfter($createParagraphNode());
    return;
  } else {
    if (top === null) $getRoot().append(container);
    else top.insertAfter(container);
    container.append(...options.fill());
  }
  if (container.getNextSibling() === null) container.insertAfter($createParagraphNode());
  const first = container.getFirstDescendant();
  if (first !== null) first.selectEnd();
  else container.selectStart();
}

/** Takes a container out, leaving what it held where it was. */
export function $unwrapInto(node: ElementNode): void {
  for (const child of node.getChildren()) node.insertBefore(child);
  node.remove();
}

/** A container that must hold a line keeps one. */
export function $fillEmpty(node: ElementNode): void {
  if (node.isEmpty()) node.append($createParagraphNode());
}

/**
 * Enter on an empty last line of a container steps out of it, as a list's
 * last empty item does: the line goes after the container.
 */
function $leaveFromEmptyLastLine(
  isExit: (node: LexicalNode | null) => boolean,
  outer: ((node: ElementNode) => ElementNode) | undefined,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const line = selection.anchor.getNode();
  if (!$isParagraphNode(line) || !line.isEmpty()) return false;
  const container = line.getParent();
  if (container === null || !isExit(container)) return false;
  if (!line.is(container.getLastChild()) || container.getChildrenSize() < 2) return false;
  (outer?.(container) ?? container).insertAfter(line);
  line.selectStart();
  return true;
}

/**
 * The keys every container of blocks answers alike: the arrows leave it at
 * its edges, where nothing else would take the caret out, and Enter on its
 * empty last line steps out after it.
 */
export function registerContainerKeys(
  editor: LexicalEditor,
  options: {
    isContainer: (node: LexicalNode | null | undefined) => node is ElementNode;
    /** The containers Enter on an empty last line leaves. */
    exitsOnEmptyLine?: (node: LexicalNode | null) => boolean;
    /** For a container inside another, the outer one Enter leaves. */
    outer?: (node: ElementNode) => ElementNode;
  },
): () => void {
  const down = (event: KeyboardEvent) => $onEscapeDown(options.isContainer, event);
  const up = (event: KeyboardEvent) => $onEscapeUp(options.isContainer, event);
  const exits = options.exitsOnEmptyLine;
  return mergeRegister(
    editor.registerCommand(KEY_ARROW_DOWN_COMMAND, down, COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_ARROW_RIGHT_COMMAND, down, COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_ARROW_UP_COMMAND, up, COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_ARROW_LEFT_COMMAND, up, COMMAND_PRIORITY_LOW),
    exits === undefined
      ? () => undefined
      : editor.registerCommand(
          INSERT_PARAGRAPH_COMMAND,
          () => $leaveFromEmptyLastLine(exits, options.outer),
          COMMAND_PRIORITY_LOW,
        ),
  );
}
