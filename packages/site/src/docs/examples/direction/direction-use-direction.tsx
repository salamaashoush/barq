import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button, DirectionProvider, useDirection } from "@barqjs/ui";

const frame = css`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(var(--spacing) * 3);
`;

const reading = css`
  font-family: var(--font-mono);
  font-size: 0.875rem;
`;

function Reading() {
  const direction = useDirection();
  return <output class={reading}>{direction()}</output>;
}

export default function DirectionUseDirection() {
  const [dir, setDir] = createSignal<"ltr" | "rtl">("ltr");

  return (
    <DirectionProvider dir={dir()}>
      <div dir={dir()} class={frame}>
        <Reading />
        <Button
          variant="outline"
          onPress={() => setDir((current) => (current === "ltr" ? "rtl" : "ltr"))}
        >
          Switch direction
        </Button>
      </div>
    </DirectionProvider>
  );
}
