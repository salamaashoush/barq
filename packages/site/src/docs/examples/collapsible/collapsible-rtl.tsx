import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ChevronsUpDown } from "@barqjs/lucide/icons/chevrons-up-down";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DirectionProvider,
  srOnly,
} from "@barqjs/ui";

const root = css`
  display: flex;
  width: 350px;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const head = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(var(--spacing) * 4);
  padding-inline: calc(var(--spacing) * 4);
`;

const title = css`
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 600;
`;

const toggle = css`
  width: calc(var(--spacing) * 8);
  height: calc(var(--spacing) * 8);
`;

const status = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 4);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const box = css`
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: calc(var(--spacing) * 2) calc(var(--spacing) * 4);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const stack = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
`;

const muted = css`
  color: var(--muted-foreground);
`;

const strong = css`
  font-weight: 500;
`;

export default function CollapsibleRtl() {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Collapsible open={isOpen()} onOpenChange={setIsOpen} class={root}>
          <div class={head}>
            <h4 class={title}>الطلب #4189</h4>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" class={toggle}>
                <ChevronsUpDown />
                <span class={srOnly}>تبديل التفاصيل</span>
              </Button>
            </CollapsibleTrigger>
          </div>
          <div class={status}>
            <span class={muted}>الحالة</span>
            <span class={strong}>تم الشحن</span>
          </div>
          <CollapsibleContent class={stack}>
            <div class={box}>
              <p class={strong}>عنوان الشحن</p>
              <p class={muted}>100 Market St, San Francisco</p>
            </div>
            <div class={box}>
              <p class={strong}>العناصر</p>
              <p class={muted}>2x سماعات الاستوديو</p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </DirectionProvider>
  );
}
