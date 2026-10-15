import { css } from "@barqjs/css";
import { Kbd, KbdGroup } from "@barqjs/ui";

const text = css`
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
`;

export default function KbdGroupExample() {
  return (
    <p class={text}>
      Use{" "}
      <KbdGroup>
        <Kbd>Ctrl + B</Kbd>
        <Kbd>Ctrl + K</Kbd>
      </KbdGroup>{" "}
      to open the command palette
    </p>
  );
}
