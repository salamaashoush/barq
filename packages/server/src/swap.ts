/**
 * The client half of a swap: replace the range between `<!--[b:n-->` and its
 * matching `<!--]-->` with the template that just arrived.
 *
 * `failed` is an error boundary's late failure instead: the range is its
 * content, `<!--[e:n-->`, and the template is its fallback in a range of its
 * own, so the comments go with what they held.
 *
 * It reads the boundary comments the string backend wrote, which is what those
 * bytes are paid for. Nested ranges are why the scan counts
 * depth rather than stopping at the first close: a fallback may itself contain a
 * range, and its `<!--]-->` is not this boundary's.
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
export function swapDeferredRange(n: number, wrapped?: boolean, failed?: boolean): void {
  const t = document.querySelector<HTMLTemplateElement>(`template[data-barq="${n}"]`);
  if (!t) return;
  const w = document.createTreeWalker(document.body, 128);
  const mark = (failed ? "[e:" : "[b:") + n;
  let c: Node | null;
  let open: Comment | null = null;
  while ((c = w.nextNode())) {
    if ((c as Comment).data === mark) {
      open = c as Comment;
      break;
    }
  }
  if (open === null) return;
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
export const SWAP_SNIPPET = `window.__BARQ_SWAP__=${swapDeferredRange.toString()};`;
