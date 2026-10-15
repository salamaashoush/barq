import { For, createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  DirectionProvider,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@barqjs/ui";

const trigger = css`
  width: 8rem;
`;

interface Option {
  readonly label: string;
  readonly value: string;
}

const fruits: readonly Option[] = [
  { label: "تفاح", value: "apple" },
  { label: "موز", value: "banana" },
  { label: "توت أزرق", value: "blueberry" },
  { label: "عنب", value: "grapes" },
  { label: "أناناس", value: "pineapple" },
];

const vegetables: readonly Option[] = [
  { label: "جزر", value: "carrot" },
  { label: "بروكلي", value: "broccoli" },
  { label: "سبانخ", value: "spinach" },
];

export default function SelectRtl() {
  const [selectedFruit, setSelectedFruit] = createSignal("");

  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Select dir="rtl" value={selectedFruit()} onValueChange={setSelectedFruit}>
          <SelectTrigger class={trigger} aria-label="الفواكه والخضروات">
            <SelectValue placeholder="اختر فاكهة" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>الفواكه</SelectLabel>
              <For each={() => fruits}>
                {(item: Option) => <SelectItem value={item.value}>{item.label}</SelectItem>}
              </For>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>الخضروات</SelectLabel>
              <For each={() => vegetables}>
                {(item: Option) => <SelectItem value={item.value}>{item.label}</SelectItem>}
              </For>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </DirectionProvider>
  );
}
