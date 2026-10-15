import { css } from "@barqjs/css";
import { BadgeCheck } from "@barqjs/lucide/icons/badge-check";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import {
  Button,
  DirectionProvider,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@barqjs/ui";

const stack = css`
  display: flex;
  width: 100%;
  max-width: 28rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
`;

const chevron = css`
  [dir="rtl"] & {
    transform: rotate(180deg);
  }
`;

const text = {
  basicItem: "عنصر أساسي",
  basicItemDescription: "عنصر بسيط يحتوي على عنوان ووصف.",
  action: "إجراء",
  verifiedTitle: "تم التحقق من ملفك الشخصي.",
};

export default function ItemRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={stack}>
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>{text.basicItem}</ItemTitle>
            <ItemDescription>{text.basicItemDescription}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm">
              {text.action}
            </Button>
          </ItemActions>
        </Item>
        <Item variant="outline" size="sm" href="#">
          <ItemMedia>
            <BadgeCheck size={20} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{text.verifiedTitle}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <ChevronRight size={16} class={chevron} />
          </ItemActions>
        </Item>
      </div>
    </DirectionProvider>
  );
}
