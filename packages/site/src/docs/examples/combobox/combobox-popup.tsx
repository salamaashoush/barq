import { css } from "@barqjs/css";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@barqjs/ui";

const countries = [
  { code: "", value: "", continent: "", label: "Select country" },
  { code: "ar", value: "argentina", label: "Argentina", continent: "South America" },
  { code: "au", value: "australia", label: "Australia", continent: "Oceania" },
  { code: "br", value: "brazil", label: "Brazil", continent: "South America" },
  { code: "ca", value: "canada", label: "Canada", continent: "North America" },
  { code: "cn", value: "china", label: "China", continent: "Asia" },
  { code: "co", value: "colombia", label: "Colombia", continent: "South America" },
  { code: "eg", value: "egypt", label: "Egypt", continent: "Africa" },
  { code: "fr", value: "france", label: "France", continent: "Europe" },
  { code: "de", value: "germany", label: "Germany", continent: "Europe" },
  { code: "it", value: "italy", label: "Italy", continent: "Europe" },
  { code: "jp", value: "japan", label: "Japan", continent: "Asia" },
  { code: "ke", value: "kenya", label: "Kenya", continent: "Africa" },
  { code: "mx", value: "mexico", label: "Mexico", continent: "North America" },
  { code: "nz", value: "new-zealand", label: "New Zealand", continent: "Oceania" },
  { code: "ng", value: "nigeria", label: "Nigeria", continent: "Africa" },
  { code: "za", value: "south-africa", label: "South Africa", continent: "Africa" },
  { code: "kr", value: "south-korea", label: "South Korea", continent: "Asia" },
  { code: "gb", value: "united-kingdom", label: "United Kingdom", continent: "Europe" },
  { code: "us", value: "united-states", label: "United States", continent: "North America" },
];

type Country = (typeof countries)[number];

const trigger = css`
  width: calc(var(--spacing) * 64);
  justify-content: space-between;
  font-weight: 400;
`;

export default function ComboboxPopup() {
  return (
    <Combobox items={countries} defaultValue={countries[0]}>
      <ComboboxTrigger variant="outline" class={trigger} aria-label="Country">
        <ComboboxValue />
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput showTrigger={false} aria-label="Search" placeholder="Search" />
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item: Country) => <ComboboxItem value={item}>{item.label}</ComboboxItem>}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
