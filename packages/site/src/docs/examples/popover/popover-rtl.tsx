import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Button,
  DirectionProvider,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
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

export default function PopoverRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={row}>
        <For each={sides}>
          {(entry: (typeof sides)[number]) => (
            <Popover>
              <PopoverTrigger>
                <Button variant="outline">{entry.label}</Button>
              </PopoverTrigger>
              <PopoverContent side={entry.side} dir="rtl">
                <PopoverHeader>
                  <PopoverTitle>الأبعاد</PopoverTitle>
                  <PopoverDescription>تعيين الأبعاد للطبقة.</PopoverDescription>
                </PopoverHeader>
              </PopoverContent>
            </Popover>
          )}
        </For>
      </div>
    </DirectionProvider>
  );
}
