import { For, Show } from "@barqjs/core";
import { keyframes, variants } from "@barqjs/css";
import { listFormatter } from "@barqjs/aria/i18n";
import { on } from "@barqjs/ui/conditions";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, layout, motionTokens, rounded, type } from "../style/index.ts";
import type { Person } from "../components/avatar-stack.tsx";
import { useArcMessages } from "../components/messages.ts";

const bounce = keyframes`
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  30% {
    transform: translateY(-30%);
    opacity: 1;
  }
`;

export const typingIndicatorStyles = variants({
  slots: {
    root: arc(layout.row, gap[2], type.meta, layout.minZero, { minBlockSize: "1lh" }),
    dots: arc(layout.inlineRow, gap[0.5], layout.noShrink),
    dot: arc(rounded.full, {
      width: "0.375rem",
      height: "0.375rem",
      backgroundColor: "currentColor",
      animationName: bounce,
      animationDuration: "1.2s",
      animationTimingFunction: motionTokens.standard,
      animationIterationCount: "infinite",
      ":nth-child(2)": { animationDelay: "0.15s" },
      ":nth-child(3)": { animationDelay: "0.3s" },
      [on.reducedMotion]: { animationName: "none" },
    }),
    text: arc(layout.clip, layout.nowrap, layout.minZero),
  },
});

type Slots = ReturnType<typeof typingIndicatorStyles>;

export interface TypingIndicatorProps extends Customisable<Slots> {
  /** Who is typing, in the order they started. Empty, nothing shows. */
  people: readonly Pick<Person, "name">[];
  /** How many are named before the rest are counted. @default 2 */
  max?: number;
  id?: string;
}

/**
 * Who is typing: "Alex is typing", "Alex and Sam are typing", "Alex, Sam and
 * 3 others are typing", with three dots that stop under reduced motion.
 *
 * ```tsx
 * <TypingIndicator people={useTyping(() => channel.id)().map(personOf)} />
 * ```
 *
 * A polite status region that stays in the page while nobody types, so the
 * first name to appear is announced; the names are joined as the locale
 * joins a list.
 */
export function TypingIndicator(props: TypingIndicatorProps) {
  const messages = useArcMessages();
  const list = listFormatter({ type: "conjunction" });
  const cls = (): Slots => parts(typingIndicatorStyles(), props.classes);
  const sentence = (): string => {
    const people = props.people;
    if (people.length === 0) return "";
    const max = Math.max(1, props.max ?? 2);
    const named = people.slice(0, max).map((one) => one.name);
    const rest = people.length - named.length;
    if (rest > 0) named.push(messages().othersCount(rest));
    return messages().isTyping(list().format(named), people.length);
  };
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      id={props.id}
      data-slot="typing-indicator"
      data-active={props.people.length > 0 ? "" : undefined}
      role="status"
    >
      <Show when={props.people.length > 0}>
        <span class={cls().dots} data-slot="typing-indicator-dots" aria-hidden="true">
          <For each={[0, 1, 2]}>{() => <span class={cls().dot} />}</For>
        </span>
        <span class={cls().text} data-slot="typing-indicator-text">
          {sentence()}
        </span>
      </Show>
    </div>
  );
}
