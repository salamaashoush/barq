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
  DirectionProvider,
  Field,
  FieldLabel,
  useComboboxAnchor,
} from "@barqjs/ui";

const categories = [
  "technology",
  "design",
  "business",
  "marketing",
  "education",
  "health",
] as const;

type Category = (typeof categories)[number];

const labels: Record<Category, string> = {
  technology: "التكنولوجيا",
  design: "التصميم",
  business: "الأعمال",
  marketing: "التسويق",
  education: "التعليم",
  health: "الصحة",
};

const field = css`
  margin-inline: auto;
  width: 100%;
  max-width: 20rem;
`;

export default function ComboboxRtl() {
  const anchor = useComboboxAnchor();

  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <Field class={field}>
          <FieldLabel for="combobox-rtl-input">الفئات</FieldLabel>
          <Combobox
            multiple
            autoHighlight
            items={categories}
            defaultValue={[categories[0]]}
            itemToStringLabel={(item: Category) => labels[item]}
          >
            <ComboboxChips ref={anchor}>
              <ComboboxValue>
                {(values: Category[]) => (
                  <>
                    <For each={values}>
                      {(value: Category) => <ComboboxChip>{labels[value]}</ComboboxChip>}
                    </For>
                    <ComboboxChipsInput id="combobox-rtl-input" placeholder="أضف فئات" />
                  </>
                )}
              </ComboboxValue>
            </ComboboxChips>
            <ComboboxContent anchor={anchor} dir="rtl">
              <ComboboxEmpty>لم يتم العثور على فئات.</ComboboxEmpty>
              <ComboboxList>
                {(item: Category) => <ComboboxItem value={item}>{labels[item]}</ComboboxItem>}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
      </div>
    </DirectionProvider>
  );
}
