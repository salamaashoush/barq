import { css } from "@barqjs/css";
import { FileText } from "@barqjs/lucide/icons/file-text";
import {
  Badge,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@barqjs/ui";

const group = css`
  max-width: 28rem;
`;

export default function ItemSeparatorExample() {
  return (
    <ItemGroup class={group}>
      <Item size="sm" href="#">
        <ItemMedia variant="icon">
          <FileText />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Q2 report</ItemTitle>
          <ItemDescription>A link, so the whole row lights up.</ItemDescription>
        </ItemContent>
      </Item>
      <ItemSeparator />
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>Q1 report</ItemTitle>
          <ItemDescription>Kept for reference.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="secondary">Archived</Badge>
        </ItemActions>
      </Item>
    </ItemGroup>
  );
}
