import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemHeader, ItemTitle } from "@barqjs/ui";

const stack = css`
  display: flex;
  width: 100%;
  max-width: 36rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 6);
`;

const grid = css`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: calc(var(--spacing) * 4);
`;

const picture = css`
  aspect-ratio: 1 / 1;
  width: 100%;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--muted), var(--muted-foreground));
`;

interface Model {
  readonly name: string;
  readonly description: string;
}

const models: readonly Model[] = [
  { name: "acme-1.5-sm", description: "Everyday tasks and UI generation." },
  { name: "acme-1.5-lg", description: "Advanced thinking or reasoning." },
  { name: "acme-2.0-mini", description: "Open Source model for everyone." },
];

export default function ItemHeaderDemo() {
  return (
    <div class={stack}>
      <ItemGroup class={grid}>
        <For each={() => models}>
          {(model: Model) => (
            <Item variant="outline">
              <ItemHeader>
                <div class={picture} aria-hidden="true" />
              </ItemHeader>
              <ItemContent>
                <ItemTitle>{model.name}</ItemTitle>
                <ItemDescription>{model.description}</ItemDescription>
              </ItemContent>
            </Item>
          )}
        </For>
      </ItemGroup>
    </div>
  );
}
