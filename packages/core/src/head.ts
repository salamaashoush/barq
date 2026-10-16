/**
 * Solid 2.0's `useHead`: a component declares what `<head>` should carry, from
 * wherever it renders.
 *
 * On the server a render installs a sink and every declaration lands there:
 * one made while the shell is built goes into the shell's `<head>`, one made by
 * a boundary that resumes later travels with that boundary's swap as a patch.
 * In the browser a declaration is applied to `document.head` and taken back
 * when its scope goes, so the head follows the page.
 *
 * A tag has an identity, and the last declaration of one wins: one `<title>`,
 * one `<meta>` per name or property, one `<link>` per rel and href.
 */

import { getOwner, onCleanup } from "@solidjs/signals";

import { createRenderEffect } from "./signals.ts";

export type HeadTagName = "title" | "meta" | "link" | "style" | "script" | "base";

export interface HeadTag {
  readonly tag: HeadTagName;
  readonly props?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  /** The text of a `title`, a `style` or an inline `script`. */
  readonly children?: string;
}

export type HeadInput = HeadTag | readonly HeadTag[] | (() => HeadTag | readonly HeadTag[]);

/** What a server render collects, in the order the tags were declared. */
export interface HeadSink {
  add(tags: readonly HeadTag[]): void;
  /** A `lazy()` module that rendered, by the URL the bundler gave it. */
  module?(url: string): void;
}

/** Tell the render a `lazy()` module rendered, so its assets reach the page. */
export function reportModule(url: string): void {
  SINK?.module?.(url);
}

let SINK: HeadSink | null = null;

/** Install a server render's sink. Returns the previous one. */
export function setHeadSink(sink: HeadSink | null): HeadSink | null {
  const previous = SINK;
  SINK = sink;
  return previous;
}

const ELIGIBLE = new Set<string>(["title", "meta", "link", "style", "script", "base"]);

function isList(value: HeadTag | readonly HeadTag[]): value is readonly HeadTag[] {
  return Array.isArray(value);
}

function listOf(input: HeadInput): readonly HeadTag[] {
  const value = typeof input === "function" ? input() : input;
  const list = isList(value) ? value : [value];
  return list.filter((tag) => ELIGIBLE.has(tag.tag));
}

/** Which earlier declaration a tag replaces. */
export function headKey(tag: HeadTag): string {
  const props = tag.props ?? {};
  switch (tag.tag) {
    case "title":
    case "base":
      return tag.tag;
    case "meta": {
      const name = props.name ?? props.property ?? props["http-equiv"];
      if (name !== undefined && name !== null) return `meta:${String(name)}`;
      if (props.charset !== undefined) return "meta:charset";
      return `meta:${JSON.stringify(props)}`;
    }
    case "link":
      return `link:${String(props.rel ?? "")}:${String(props.href ?? "")}`;
    default:
      return `${tag.tag}:${String(props.src ?? props.href ?? "")}:${tag.children ?? ""}`;
  }
}

export function useHead(input: HeadInput): void {
  const sink = SINK;
  if (sink !== null) {
    sink.add(listOf(input));
    return;
  }
  if (typeof document === "undefined") return;
  let placed: Element[] = [];
  let restoreTitle: string | null = null;
  const takeBack = (): void => {
    for (const element of placed) element.remove();
    placed = [];
    if (restoreTitle !== null) {
      document.title = restoreTitle;
      restoreTitle = null;
    }
  };
  createRenderEffect(
    () => listOf(input),
    (list) => {
      takeBack();
      for (const tag of list) {
        if (tag.tag === "title") {
          restoreTitle ??= document.title;
          document.title = tag.children ?? "";
          continue;
        }
        placed.push(applyTag(tag));
      }
    },
  );
  if (getOwner() !== null) onCleanup(takeBack);
}

/**
 * The element for `tag`, reusing the one the server wrote for the same
 * identity: a hydrated page already has it, and a second copy would be a
 * second `<meta name="description">`.
 */
function applyTag(tag: HeadTag): Element {
  const key = headKey(tag);
  let element: Element | null = null;
  for (const candidate of document.head.querySelectorAll("[data-bh]")) {
    if (candidate.getAttribute("data-bh") === key) element = candidate;
  }
  if (element === null || element.localName !== tag.tag) {
    element = document.createElement(tag.tag);
    document.head.appendChild(element);
  }
  for (const name of element.getAttributeNames()) {
    if (name !== "data-bh") element.removeAttribute(name);
  }
  for (const [name, value] of Object.entries(tag.props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    element.setAttribute(name, value === true ? "" : String(value));
  }
  element.setAttribute("data-bh", key);
  if (tag.children !== undefined) element.textContent = tag.children;
  return element;
}
