import { css } from "@barqjs/css";
import { DirectionProvider, Kbd, KbdGroup } from "@barqjs/ui";

const column = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--spacing) * 4);
`;

export default function KbdRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={column}>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>⇧</Kbd>
          <Kbd>⌥</Kbd>
          <Kbd>⌃</Kbd>
        </KbdGroup>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <span>+</span>
          <Kbd>B</Kbd>
        </KbdGroup>
      </div>
    </DirectionProvider>
  );
}
