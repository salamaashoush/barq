import { css } from "@barqjs/css";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@barqjs/ui";

const frame = css`
  min-height: 200px;
  max-width: 24rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
`;

const cell = css`
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 6);
`;

const label = css`
  font-weight: 600;
`;

export default function ResizableVertical() {
  return (
    <ResizablePanelGroup orientation="vertical" class={frame}>
      <ResizablePanel defaultSize="25%">
        <div class={cell}>
          <span class={label}>Header</span>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize="75%">
        <div class={cell}>
          <span class={label}>Content</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
