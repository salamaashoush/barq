/**
 * The findings a page raises while it renders, worded.
 *
 * `diagnose` raises one by its code, and `signals.ts` installs the words with
 * the first subscriber or reporter. Nothing else reaches this table, so a page
 * where nothing can hear a finding, which is any page that never reads `DEV`
 * and has no development entry, carries none of the prose.
 */

import type { DiagnosticKind, DiagnosticSeverity } from "@solidjs/signals";

export interface Finding {
  kind: DiagnosticKind;
  severity: DiagnosticSeverity;
  message: string;
}

/** Each finding's words, from what the site that raises it knows. */
export interface Findings {
  BLOCK_EVALUATED_TWICE(): Finding;
  DELEGATED_EVENT_DOES_NOT_BUBBLE(type: string): Finding;
  FUNCTION_AS_ATTRIBUTE(name: string, tag: string): Finding;
  BIND_TARGET_NOT_WRITABLE(name: string, tag: string, type: string): Finding;
  RENDER_SUBTREE_NOT_OWNED(): Finding;
}

export const FINDINGS: Findings = {
  BLOCK_EVALUATED_TWICE: (): Finding => ({
    kind: "render",
    severity: "error",
    message:
      "The content of one `<Show>`, `<For>`, `<Loading>` or `<Portal>` was built twice for a " +
      "single render, so its effects exist twice and one copy of its DOM was thrown away. " +
      "This is a bug in barq, not in your component: please report it with the component " +
      "that triggered it.",
  }),
  DELEGATED_EVENT_DOES_NOT_BUBBLE: (type: string): Finding => ({
    kind: "render",
    severity: "warn",
    message:
      `\`delegateEvents(["${type}"])\` asks for a listener on each render root, but ` +
      `the \`${type}\` event does not bubble, so a handler registered this way never runs. ` +
      `Attach it to the element itself: \`listen(element, "${type}", handler)\`.`,
  }),
  FUNCTION_AS_ATTRIBUTE: (name: string, tag: string): Finding => ({
    kind: "render",
    severity: "warn",
    message:
      `The \`${name}\` attribute on \`<${tag}>\` was given a function, so the ` +
      "function's source text is written to the page instead of its value. Call the accessor " +
      `where the value is chosen: \`${name}={open() ? label() : "closed"}\`.`,
  }),
  BIND_TARGET_NOT_WRITABLE: (name: string, tag: string, type: string): Finding => ({
    kind: "render",
    severity: "error",
    message:
      `\`bind:${name}\` on \`<${tag}>\` was given a value of type ` +
      `\`${type}\` instead of a signal, so the element does not follow the value and ` +
      "what the user types is never written back. Pass the whole signal, the `[read, write]` " +
      `pair \`createSignal\` returns: \`const text = createSignal("")\` and then ` +
      `\`bind:${name}={text}\`.`,
  }),
  RENDER_SUBTREE_NOT_OWNED: (): Finding => ({
    kind: "owner",
    severity: "warn",
    message:
      "`render` was given nodes that were built before the call, as in `const view = <App />` " +
      "followed by `render(view, host)`, so the function it returns removes the nodes but " +
      "cannot dispose their effects and listeners. Pass a function instead: " +
      "`render(() => <App />, host)`.",
  }),
};

export type FindingCode = keyof Findings;
