import { css } from "@barqjs/css";
import { Inbox } from "@barqjs/lucide/icons/inbox";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@barqjs/ui";

const stack = css`
  display: flex;
  width: 100%;
  max-width: 28rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
`;

export default function ItemVariant() {
  return (
    <div class={stack}>
      <Item>
        <ItemMedia variant="icon">
          <Inbox />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Default Variant</ItemTitle>
          <ItemDescription>Transparent background with no border.</ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="outline">
        <ItemMedia variant="icon">
          <Inbox />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Outline Variant</ItemTitle>
          <ItemDescription>Outlined style with a visible border.</ItemDescription>
        </ItemContent>
      </Item>
      <Item variant="muted">
        <ItemMedia variant="icon">
          <Inbox />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Muted Variant</ItemTitle>
          <ItemDescription>Muted background for secondary content.</ItemDescription>
        </ItemContent>
      </Item>
    </div>
  );
}
