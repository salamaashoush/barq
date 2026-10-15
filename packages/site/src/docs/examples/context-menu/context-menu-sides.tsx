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

const grid = css`
  display: grid;
  width: 100%;
  max-width: 24rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: calc(var(--spacing) * 4);
`;

export default function ContextMenuSides() {
  return (
    <div class={grid}>
      <ContextMenu>
        <ContextMenuTrigger class={area}>
          <span class={fine}>Right click (top)</span>
          <span class={coarse}>Long press (top)</span>
        </ContextMenuTrigger>
        <ContextMenuContent side="top">
          <ContextMenuGroup>
            <ContextMenuItem>Back</ContextMenuItem>
            <ContextMenuItem>Forward</ContextMenuItem>
            <ContextMenuItem>Reload</ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <ContextMenu>
        <ContextMenuTrigger class={area}>
          <span class={fine}>Right click (right)</span>
          <span class={coarse}>Long press (right)</span>
        </ContextMenuTrigger>
        <ContextMenuContent side="right">
          <ContextMenuGroup>
            <ContextMenuItem>Back</ContextMenuItem>
            <ContextMenuItem>Forward</ContextMenuItem>
            <ContextMenuItem>Reload</ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <ContextMenu>
        <ContextMenuTrigger class={area}>
          <span class={fine}>Right click (bottom)</span>
          <span class={coarse}>Long press (bottom)</span>
        </ContextMenuTrigger>
        <ContextMenuContent side="bottom">
          <ContextMenuGroup>
            <ContextMenuItem>Back</ContextMenuItem>
            <ContextMenuItem>Forward</ContextMenuItem>
            <ContextMenuItem>Reload</ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      <ContextMenu>
        <ContextMenuTrigger class={area}>
          <span class={fine}>Right click (left)</span>
          <span class={coarse}>Long press (left)</span>
        </ContextMenuTrigger>
        <ContextMenuContent side="left">
          <ContextMenuGroup>
            <ContextMenuItem>Back</ContextMenuItem>
            <ContextMenuItem>Forward</ContextMenuItem>
            <ContextMenuItem>Reload</ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
