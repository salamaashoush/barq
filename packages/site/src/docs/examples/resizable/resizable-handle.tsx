import { css } from "@barqjs/css";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@barqjs/ui";

const frame = css`
  min-height: 200px;
  max-width: 28rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);

  @media (width >= 48rem) {
    min-width: 450px;
  }
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

export default function ResizableHandleDemo() {
  return (
    <ResizablePanelGroup orientation="horizontal" class={frame}>
      <ResizablePanel defaultSize="25%">
        <div class={cell}>
          <span class={label}>Sidebar</span>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="75%">
        <div class={cell}>
          <span class={label}>Content</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
