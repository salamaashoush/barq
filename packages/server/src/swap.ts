/**
 * The client half of a swap: replace the range between `<!--[b:n-->` and its
 * matching `<!--]-->` with the template that just arrived.
 *
 * `failed` is an error boundary's late failure instead: the range is its
 * content, `<!--[e:n-->`, and the template is its fallback in a range of its
 * own, so the comments go with what they held.
 *
 * FOUND WITHOUT A WALK PER SWAP. The open comments are indexed once, by one
 * walk of the document the first time a swap needs one, and every template is
 * indexed as it arrives, before its content is placed: a boundary nested in
 * content the stream delivered is only ever in a template first. A swap is
 * then a lookup. The walk per swap this replaced made a page O(nodes x
 * boundaries).
 *
 * A HYDRATED BOUNDARY IS ASKED FIRST. A client that hydrated while the stream
 * was still open has claimed the fallback, and a boundary that did so leaves a
 * function on its open comment. It answers whether the server's content should
 * still go in: yes when the boundary has not built its own, and it then claims
 * the nodes this places once its values arrive; no when it already shows
 * content, or for a late failure, which the client's own error boundary shows.
 *
 * Nested ranges are why the scan counts depth rather than stopping at the first
 * close: a fallback may itself contain a range, and its `<!--]-->` is not this
 * boundary's.
 *
 * Three constraints, and each of them is a property of the SOURCE rather than of
 * the behaviour, because this function is shipped by `toString()`:
 *
 * - it closes over NOTHING. Every name it uses is a global or a local, so the
 *   text below runs on a page that has none of this module.
 * - it contains no `<`. Script data is raw text — the tokenizer decodes nothing
 *   inside it, so there is no entity to escape a `<` with, and a `<` there is
 *   the first byte of the sequence that can leave the element early. Hence
 *   `for…of` rather than `i < dead.length`.
 * - it is the FUNCTION the tests drive. A snippet written as a string literal
 *   beside a test that paraphrases it is two implementations, and the one that
 *   ships is the one nothing runs.
 */
export function swapDeferredRange(n: number | string, wrapped?: boolean, failed?: boolean): void {
  const t = document.querySelector<HTMLTemplateElement>(`template[data-barq="${n}"]`);
  if (!t) return;
  const g = globalThis as { __BARQ_MARKS__?: Map<string, Comment> };
  const marks = g.__BARQ_MARKS__ ?? (g.__BARQ_MARKS__ = new Map<string, Comment>());
  const index = (root: Node): void => {
    const w = document.createTreeWalker(root, 128);
    let c: Node | null;
    while ((c = w.nextNode())) {
      const data = (c as Comment).data;
      if (data.startsWith("[b:") || data.startsWith("[e:")) marks.set(data, c as Comment);
    }
  };
  const mark = (failed ? "[e:" : "[b:") + n;
  let open = marks.get(mark);
  if (!open || !open.isConnected || open.data !== mark) {
    index(document.body);
    open = marks.get(mark);
  }
  if (!open || !open.isConnected) return;
  marks.delete(mark);
  const owner = (open as { $$barq?: (failed: boolean) => boolean }).$$barq;
  if (owner && !owner(!!failed)) {
    t.parentNode?.removeChild(t);
    return;
  }
  index(t.content);
  let depth = 0;
  let node: Node | null = open.nextSibling;
  const dead: Node[] = [];
  while (node) {
    if (node.nodeType === 8) {
      const data = (node as Comment).data;
      if (data.charAt(0) === "[") depth++;
      else if (data === "]") {
        if (depth === 0) break;
        depth--;
      }
    }
    dead.push(node);
    node = node.nextSibling;
  }
  for (const gone of dead) gone.parentNode?.removeChild(gone);
  // A payload for foreign content arrives inside one element of that
  // namespace, which is what made the parser read it as such. The element is
  // the stream's and not the page's, so only what it holds goes in.
  const wrap = wrapped ? t.content.firstChild : null;
  if (wrap) {
    while (wrap.firstChild) t.content.insertBefore(wrap.firstChild, wrap);
    t.content.removeChild(wrap);
  }
  open.parentNode?.insertBefore(t.content, node);
  t.parentNode?.removeChild(t);
  if (failed) {
    open.parentNode?.removeChild(open);
    node?.parentNode?.removeChild(node);
    return;
  }
  // Back to the PLAIN open comment, not `[0`. Once the content is in, this
  // range is indistinguishable from one the shell settled, and it has to read
  // that way to both readers: `loadingBoundary` claims a settled range and
  // parks a `b:` one, and `reconcileKey` compares whatever key is here against
  // the client's own — `[0` announced a branch key of "0" that no client would
  // ever match.
  open.data = "[";
}

/** The same function, as the bytes a page gets. Inlined once per stream. */
export const SWAP_SNIPPET: string = `window.__BARQ_SWAP__=${swapDeferredRange.toString()};`;

/**
 * The client half of a head patch: the tags a boundary declared with `useHead`
 * after the shell, applied when that boundary's swap runs. The same three
 * constraints as `swapDeferredRange`, for the same reason.
 */
export function applyHeadPatch(
  tags: readonly { k: string; t: string; a: Record<string, string>; c?: string }[],
): void {
  for (const tag of tags) {
    if (tag.t === "title") {
      document.title = tag.c ?? "";
      continue;
    }
    let element: Element | null = null;
    for (const candidate of document.head.querySelectorAll("[data-bh]")) {
      if (candidate.getAttribute("data-bh") === tag.k) element = candidate;
    }
    if (!element) {
      element = document.createElement(tag.t);
      document.head.appendChild(element);
    }
    for (const name of Object.keys(tag.a)) element.setAttribute(name, tag.a[name] ?? "");
    element.setAttribute("data-bh", tag.k);
    if (tag.c !== undefined) element.textContent = tag.c;
  }
}

/** The head patch function, as the bytes a page gets. Inlined once, by the first patch. */
export const HEAD_SNIPPET: string = `window.__BARQ_HEAD__=${applyHeadPatch.toString()};`;
