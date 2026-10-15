import { css } from "@barqjs/css";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { Button, DirectionProvider, Input, Label, useDirection } from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 20rem;
  gap: calc(var(--spacing) * 3);
`;

const flipped = css`
  [dir="rtl"] & {
    transform: rotate(180deg);
  }
`;

const reading = css`
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted-foreground);
`;

function Reading() {
  const direction = useDirection();
  return <output class={reading}>{direction()}</output>;
}

export default function RtlExample() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Label for="rtl-guide-email">البريد الإلكتروني</Label>
        <Input id="rtl-guide-email" type="email" placeholder="salama@example.com" />
        <Button>
          متابعة <ArrowRight class={flipped} />
        </Button>
        <Reading />
      </div>
    </DirectionProvider>
  );
}
