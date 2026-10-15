import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@barqjs/ui";

const frameworks = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"] as const;

const chips = css`
  width: 100%;
  max-width: 20rem;
`;

export default function ComboboxMultiple() {
  const anchor = useComboboxAnchor();

  return (
    <Combobox multiple autoHighlight items={frameworks} defaultValue={[frameworks[0]]}>
      <ComboboxChips ref={anchor} class={chips}>
        <ComboboxValue>
          {(values: string[]) => (
            <>
              <For each={values}>{(value: string) => <ComboboxChip>{value}</ComboboxChip>}</For>
              <ComboboxChipsInput aria-label="Frameworks" />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item: (typeof frameworks)[number]) => <ComboboxItem value={item}>{item}</ComboboxItem>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
