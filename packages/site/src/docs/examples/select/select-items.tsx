import { css } from "@barqjs/css";
import { Select, SelectItem } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 12rem;
`;

interface Fruit {
  readonly id: string;
  readonly name: string;
}

const fruits: readonly Fruit[] = [
  { id: "apple", name: "Apple" },
  { id: "banana", name: "Banana" },
  { id: "blueberry", name: "Blueberry" },
  { id: "grapes", name: "Grapes" },
  { id: "pineapple", name: "Pineapple" },
];

export default function SelectItems() {
  return (
    <div class={frame}>
      <Select items={fruits} aria-label="Fruit" placeholder="Select a fruit">
        {(fruit: Fruit) => <SelectItem>{fruit.name}</SelectItem>}
      </Select>
    </div>
  );
}
