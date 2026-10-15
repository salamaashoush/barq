import { css } from "@barqjs/css";
import {
  DirectionProvider,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@barqjs/ui";

const frame = css`
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

const tall = css`
  display: flex;
  height: 200px;
  align-items: center;
  justify-content: center;
  padding: calc(var(--spacing) * 6);
`;

const label = css`
  font-weight: 600;
`;

export default function ResizableRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <ResizablePanelGroup orientation="horizontal" class={frame}>
          <ResizablePanel defaultSize="50%">
            <div class={tall}>
              <span class={label}>واحد</span>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="50%">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel defaultSize="25%">
                <div class={cell}>
                  <span class={label}>اثنان</span>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize="75%">
                <div class={cell}>
                  <span class={label}>ثلاثة</span>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </DirectionProvider>
  );
}
