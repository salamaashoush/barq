import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Button,
  DirectionProvider,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@barqjs/ui";

const sides = [
  { side: "left", label: "يسار" },
  { side: "top", label: "أعلى" },
  { side: "bottom", label: "أسفل" },
  { side: "right", label: "يمين" },
] as const;

const row = css`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: calc(var(--spacing) * 2);
`;

const card = css`
  display: flex;
  width: calc(var(--spacing) * 64);
  flex-direction: column;
  gap: calc(var(--spacing) * 1);
`;

const name = css`
  font-weight: 600;
`;

const price = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function HoverCardRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={row}>
        <For each={sides}>
          {(entry: (typeof sides)[number]) => (
            <HoverCard openDelay={10} closeDelay={100}>
              <HoverCardTrigger>
                <Button variant="outline">{entry.label}</Button>
              </HoverCardTrigger>
              <HoverCardContent side={entry.side} class={card} dir="rtl">
                <div class={name}>سماعات لاسلكية</div>
                <div class={price}>٩٩.٩٩ $</div>
              </HoverCardContent>
            </HoverCard>
          )}
        </For>
      </div>
    </DirectionProvider>
  );
}
