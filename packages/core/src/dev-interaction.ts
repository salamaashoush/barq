/**
 * An event handler run as the interaction its event is.
 *
 * The engine's attribution stamps every write made inside the frame with the
 * event that caused it (`click on button "Save"`), and every listener of one
 * dispatch joins one record. Imported by the development entry only.
 */

import { OBSERVE } from "@solidjs/signals";

import { INTERACTION } from "./signals.ts";

/** What this reads off an event and its target, whatever host made them. */
interface Dispatched {
  type?: unknown;
  timeStamp?: unknown;
  target?: unknown;
}

interface Hit {
  tagName?: unknown;
  id?: unknown;
  textContent?: unknown;
  getAttribute?: (name: string) => string | null;
}

/** `button#next "Next"`, `input[name=q]`: the tag, its id or name, its text. */
export function describeTarget(target: unknown): string | undefined {
  if (typeof target !== "object" || target === null) return undefined;
  const hit = target as Hit;
  if (typeof hit.tagName !== "string") return undefined;
  const tag = hit.tagName.toLowerCase();
  let out = tag;
  const name = typeof hit.getAttribute === "function" ? hit.getAttribute("name") : null;
  if (typeof hit.id === "string" && hit.id !== "") out += `#${hit.id}`;
  else if (name !== null && name !== "") out += `[name=${name}]`;
  if (tag !== "input" && tag !== "textarea" && tag !== "select") {
    const text = (typeof hit.textContent === "string" ? hit.textContent : "")
      .trim()
      .replace(/\s+/g, " ");
    if (text !== "") out += ` "${text.length > 30 ? `${text.slice(0, 29)}…` : text}"`;
  }
  return out;
}

/**
 * When the host made the event, on the `performance.now()` clock, which is
 * where the user's wait began. An environment that stamps events on another
 * clock answers a value past now, and that is left for the engine to default.
 */
function dispatchedAt(event: Dispatched): number | undefined {
  const at = event.timeStamp;
  return typeof at === "number" && at >= 0 && at <= performance.now() ? at : undefined;
}

export function installInteractionFrames(): void {
  const observe = OBSERVE;
  if (observe === undefined) return;
  INTERACTION.frame = (event, run) => {
    if (observe.attribution.installed === null) {
      run();
      return;
    }
    const dispatched = event as Dispatched;
    observe.attribution.withInteraction(
      {
        type: typeof dispatched.type === "string" ? dispatched.type : "event",
        target: describeTarget(dispatched.target),
        at: dispatchedAt(dispatched),
        event,
      },
      run,
    );
  };
}
