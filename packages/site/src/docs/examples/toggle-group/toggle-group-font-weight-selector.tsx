import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Field, FieldDescription, FieldLabel, ToggleGroup, ToggleGroupItem } from "@barqjs/ui";

const tile = css`
  display: flex;
  width: calc(var(--spacing) * 16);
  height: calc(var(--spacing) * 16);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-xl);
`;

const sample = css`
  font-size: 1.5rem;
  line-height: 1;
`;

const caption = css`
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--muted-foreground);
`;

const code = css`
  border-radius: var(--radius-md);
  background-color: var(--muted);
  padding: calc(var(--spacing) * 0.5) calc(var(--spacing) * 1);
  font-family: var(--font-mono);
`;

export default function ToggleGroupFontWeightSelector() {
  const [fontWeight, setFontWeight] = createSignal("normal");

  return (
    <Field>
      <FieldLabel id="toggle-group-font-weight-label">Font Weight</FieldLabel>
      <ToggleGroup
        type="single"
        value={fontWeight()}
        onValueChange={(value: string | string[]) => setFontWeight(String(value))}
        variant="outline"
        spacing={2}
        size="lg"
        aria-labelledby="toggle-group-font-weight-label"
      >
        <ToggleGroupItem value="light" aria-label="Light" class={tile}>
          <span class={sample} style={{ "font-weight": "300" }}>
            Aa
          </span>
          <span class={caption}>Light</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="normal" aria-label="Normal" class={tile}>
          <span class={sample} style={{ "font-weight": "400" }}>
            Aa
          </span>
          <span class={caption}>Normal</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="medium" aria-label="Medium" class={tile}>
          <span class={sample} style={{ "font-weight": "500" }}>
            Aa
          </span>
          <span class={caption}>Medium</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="bold" aria-label="Bold" class={tile}>
          <span class={sample} style={{ "font-weight": "700" }}>
            Aa
          </span>
          <span class={caption}>Bold</span>
        </ToggleGroupItem>
      </ToggleGroup>
      <FieldDescription>
        Use <code class={code}>font-{fontWeight()}</code> to set the font weight.
      </FieldDescription>
    </Field>
  );
}
