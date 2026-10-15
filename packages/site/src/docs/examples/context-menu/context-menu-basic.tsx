import { css } from "@barqjs/css";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@barqjs/ui";

const area = css`
  display: flex;
  aspect-ratio: 16 / 9;
  width: 100%;
  max-width: 20rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xl);
  border: 1px dashed var(--border);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const fine = css`
  display: none;

  @media (pointer: fine) {
    display: inline-block;
  }
`;

const coarse = css`
  display: none;

  @media (pointer: coarse) {
    display: inline-block;
  }
`;

export default function ContextMenuBasic() {
  return (
    <ContextMenu>
      <ContextMenuTrigger class={area}>
        <span class={fine}>Right click here</span>
        <span class={coarse}>Long press here</span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem>Back</ContextMenuItem>
          <ContextMenuItem disabled>Forward</ContextMenuItem>
          <ContextMenuItem>Reload</ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
