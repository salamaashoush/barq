import { css } from "@barqjs/css";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
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

const bare = css`
  padding: 0;
`;

const nowrap = css`
  white-space: nowrap;
`;

export default function ComboboxCustom() {
  return (
    <Combobox
      items={countries.filter((country) => country.code !== "")}
      itemToStringValue={(country: Country) => country.label}
    >
      <ComboboxInput aria-label="Country" placeholder="Search countries..." />
      <ComboboxContent>
        <ComboboxEmpty>No countries found.</ComboboxEmpty>
        <ComboboxList>
          {(country: Country) => (
            <ComboboxItem value={country} textValue={country.label}>
              <Item size="xs" class={bare}>
                <ItemContent>
                  <ItemTitle class={nowrap}>{country.label}</ItemTitle>
                  <ItemDescription>
                    {country.continent} ({country.code})
                  </ItemDescription>
                </ItemContent>
              </Item>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
