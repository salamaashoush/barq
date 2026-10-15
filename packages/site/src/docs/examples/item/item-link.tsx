import { css } from "@barqjs/css";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { ExternalLink } from "@barqjs/lucide/icons/external-link";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
  itemVariants,
} from "@barqjs/ui";

const stack = css`
  display: flex;
  width: 100%;
  max-width: 28rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

export default function ItemLink() {
  return (
    <div class={stack}>
      <Item href="#">
        <ItemContent>
          <ItemTitle>Visit our documentation</ItemTitle>
          <ItemDescription>Learn how to get started with our components.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <ChevronRight size={16} />
        </ItemActions>
      </Item>
      <a
        href="#"
        target="_blank"
        rel="noopener noreferrer"
        data-slot="item"
        class={itemVariants({ variant: "outline" })}
      >
        <ItemContent>
          <ItemTitle>External resource</ItemTitle>
          <ItemDescription>Opens in a new tab with security attributes.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <ExternalLink size={16} />
        </ItemActions>
      </a>
    </div>
  );
}
