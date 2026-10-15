import { css } from "@barqjs/css";
import { Select, SelectGroup, SelectItem } from "@barqjs/ui";

const frame = css`
  width: 100%;
  max-width: 12rem;
`;

interface Entry {
  readonly id: string;
  readonly name: string;
  readonly options?: readonly Entry[];
}

const produce: readonly Entry[] = [
  {
    id: "fruits",
    name: "Fruits",
    options: [
      { id: "apple", name: "Apple" },
      { id: "banana", name: "Banana" },
      { id: "blueberry", name: "Blueberry" },
    ],
  },
  {
    id: "vegetables",
    name: "Vegetables",
    options: [
      { id: "carrot", name: "Carrot" },
      { id: "broccoli", name: "Broccoli" },
      { id: "spinach", name: "Spinach" },
    ],
  },
];

export default function SelectItemsGrouped() {
  return (
    <div class={frame}>
      <Select
        items={produce}
        aria-label="Produce"
        placeholder="Select a fruit"
        getChildren={(entry: Entry) => entry.options}
      >
        {(entry: Entry) =>
          entry.options === undefined ? (
            <SelectItem>{entry.name}</SelectItem>
          ) : (
            <SelectGroup title={entry.name} />
          )
        }
      </Select>
    </div>
  );
}
