import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button, DirectionProvider, Tooltip, TooltipContent, TooltipTrigger } from "@barqjs/ui";

const sides = [
  { side: "left", label: "يسار" },
  { side: "top", label: "أعلى" },
  { side: "bottom", label: "أسفل" },
  { side: "right", label: "يمين" },
] as const;

const row = css`
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing) * 2);
`;

const label = css`
  width: fit-content;
`;

export default function TooltipRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={row}>
        <For each={sides}>
          {(entry: (typeof sides)[number]) => (
            <Tooltip>
              <TooltipTrigger>
                <Button variant="outline" class={label}>
                  {entry.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent side={entry.side}>إضافة إلى المكتبة</TooltipContent>
            </Tooltip>
          )}
        </For>
      </div>
    </DirectionProvider>
  );
}
