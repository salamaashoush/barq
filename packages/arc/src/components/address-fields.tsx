import { For, createMemo, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@barqjs/ui/combobox";
import { Field, FieldLabel } from "@barqjs/ui/field";
import { Input } from "@barqjs/ui/input";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { textDirection } from "../lib/text-direction.ts";
import { gap, layout } from "../style/index.ts";
import { type ArcMessages, useArcMessages } from "./messages.ts";
import { CALLING_CODES } from "./phone-field.tsx";

/** A postal address, its country as an ISO 3166 alpha-2 code. */
export interface Address {
  country: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
}

/** A part of an address, as a line of the form. */
export type AddressPart = Exclude<keyof Address, "country">;

/** What a country calls its region and its postal code. */
type RegionWord =
  | "state"
  | "province"
  | "county"
  | "prefecture"
  | "emirate"
  | "governorate"
  | "region";
type PostalWord = "zip" | "postcode" | "postalCode" | "pin";

/** How a country writes an address: its lines in order, a row holding several. */
export interface AddressFormat {
  /** Rows of parts, top to bottom; a row of two or three sits side by side when there is room. */
  rows: readonly (readonly AddressPart[])[];
  region?: RegionWord;
  postal?: PostalWord;
}

const WESTERN: AddressFormat = {
  rows: [["line1"], ["line2"], ["postalCode", "city"]],
  postal: "postalCode",
};

const FORMATS: Readonly<Record<string, AddressFormat>> = {
  US: {
    rows: [["line1"], ["line2"], ["city", "region", "postalCode"]],
    region: "state",
    postal: "zip",
  },
  CA: {
    rows: [["line1"], ["line2"], ["city", "region", "postalCode"]],
    region: "province",
    postal: "postalCode",
  },
  AU: {
    rows: [["line1"], ["line2"], ["city", "region", "postalCode"]],
    region: "state",
    postal: "postcode",
  },
  GB: {
    rows: [["line1"], ["line2"], ["city"], ["region", "postalCode"]],
    region: "county",
    postal: "postcode",
  },
  IE: {
    rows: [["line1"], ["line2"], ["city"], ["region", "postalCode"]],
    region: "county",
    postal: "postalCode",
  },
  IN: {
    rows: [["line1"], ["line2"], ["city", "region", "postalCode"]],
    region: "state",
    postal: "pin",
  },
  JP: {
    rows: [["postalCode", "region"], ["city"], ["line1"], ["line2"]],
    region: "prefecture",
    postal: "postalCode",
  },
  CN: {
    rows: [["region", "city"], ["line1"], ["line2"], ["postalCode"]],
    region: "province",
    postal: "postalCode",
  },
  AE: { rows: [["line1"], ["line2"], ["city", "region"]], region: "emirate" },
  SA: { rows: [["line1"], ["line2"], ["city", "postalCode"]], postal: "postalCode" },
  EG: {
    rows: [["line1"], ["line2"], ["city", "region"], ["postalCode"]],
    region: "governorate",
    postal: "postalCode",
  },
  BR: {
    rows: [["postalCode"], ["line1"], ["line2"], ["city", "region"]],
    region: "state",
    postal: "postalCode",
  },
  MX: {
    rows: [["line1"], ["line2"], ["postalCode", "city", "region"]],
    region: "state",
    postal: "postalCode",
  },
  IT: {
    rows: [["line1"], ["line2"], ["postalCode", "city", "region"]],
    region: "province",
    postal: "postalCode",
  },
  ES: {
    rows: [["line1"], ["line2"], ["postalCode", "city", "region"]],
    region: "province",
    postal: "postalCode",
  },
};

/** How `country` writes an address; most of the world as Europe does: postal code, then town. */
export function addressFormat(country: string): AddressFormat {
  return FORMATS[country] ?? WESTERN;
}

function labelOf(part: AddressPart, format: AddressFormat, words: ArcMessages): string {
  switch (part) {
    case "line1":
      return words.addressLine1;
    case "line2":
      return words.addressLine2;
    case "city":
      return words.addressCity;
    case "region":
      return words.addressRegion(format.region ?? "region");
    default:
      return words.addressPostal(format.postal ?? "postalCode");
  }
}

const TOKENS: Readonly<Record<AddressPart, string>> = {
  line1: "address-line1",
  line2: "address-line2",
  city: "address-level2",
  region: "address-level1",
  postalCode: "postal-code",
};

const EMPTY: Address = { country: "", line1: "", line2: "", city: "", region: "", postalCode: "" };

export const addressFieldsStyles = variants({
  slots: {
    body: arc(layout.column, gap[3]),
    row: arc(gap[3], {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 9rem), 1fr))",
    }),
    part: arc({}),
    input: arc({}),
    country: arc(layout.fill),
  },
});

type Slots = ReturnType<typeof addressFieldsStyles> & FieldSlots;

export interface AddressFieldsProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<Address>, Customisable<Slots> {
  /** The countries offered, by ISO code. @default every region arc knows a calling code for */
  countries?: readonly string[];
  /**
   * Keeps this address apart from another on the page, for the browser's
   * autofill as for the ids: `"shipping"`, `"billing"`.
   */
  section?: string;
  /** Which way a line of the address is put, when the country does not say. */
  formats?: Readonly<Record<string, AddressFormat>>;
}

interface CountryOption {
  code: string;
  name: string;
}

/**
 * A postal address laid out as its country writes it: a US address ends
 * city, state, ZIP code; a Japanese one starts at the postcode and the
 * prefecture; a German one puts the postcode before the town.
 *
 * ```tsx
 * <AddressFields label="Home address" section="home" defaultValue={{ ...EMPTY, country: "EG" }} />
 * ```
 *
 * Held as one `Address`. Choosing a country re-lays the lines and renames
 * the region and the postal code; every input carries the autocomplete
 * token a browser fills it from, scoped by `section` so two addresses on a
 * page stay apart.
 */
export function AddressFields(props: AddressFieldsProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const of = bindField<Address>(props, EMPTY);
  const base = createUniqueId();
  function cls(): Slots {
    return parts({ ...fieldStyles(), ...addressFieldsStyles() }, props.classes);
  }
  function address(): Address {
    return { ...EMPTY, ...of.value() };
  }
  function format(): AddressFormat {
    const country = address().country;
    return props.formats?.[country] ?? addressFormat(country);
  }
  const countries = createMemo((): CountryOption[] => {
    const display = new Intl.DisplayNames([locale().locale], { type: "region" });
    const codes = props.countries ?? [...CALLING_CODES.keys()];
    return codes
      .map((code) => ({ code, name: display.of(code) ?? code }))
      .toSorted((one, other) => one.name.localeCompare(other.name, locale().locale));
  });
  function chosen(): CountryOption | null {
    return countries().find((country) => country.code === address().country) ?? null;
  }
  function token(part: AddressPart | "country"): string {
    const scope = props.section === undefined ? "" : `section-${props.section} `;
    return `${scope}${part === "country" ? "country" : TOKENS[part]}`;
  }
  function idOf(part: AddressPart | "country"): string {
    return `${base}-${props.section ?? "address"}-${part}`;
  }
  function set(part: keyof Address, value: string): void {
    of.change({ ...untrack(address), [part]: value });
  }
  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="address-fields"
    >
      <div
        class={cls().body}
        data-slot="address-fields-body"
        role="group"
        aria-labelledby={of.ids.label}
        aria-describedby={of.describedBy(props.description !== undefined)}
      >
        <Field class={cls().part} data-slot="address-part">
          <FieldLabel id={`${idOf("country")}-label`} for={idOf("country")}>
            {messages().addressCountry}
          </FieldLabel>
          <Combobox
            items={countries()}
            value={chosen()}
            disabled={props.isDisabled}
            itemToStringLabel={(country: CountryOption) => country.name}
            itemToStringValue={(country: CountryOption) => country.code}
            onValueChange={(value: unknown) => {
              set("country", (value as CountryOption | null)?.code ?? "");
              of.blur();
            }}
          >
            <ComboboxInput
              class={cls().country}
              id={idOf("country")}
              data-slot="address-country"
              disabled={props.isDisabled}
              required={props.isRequired}
              aria-invalid={of.isInvalid() ? true : undefined}
            />
            <ComboboxContent>
              <ComboboxEmpty>{messages().noMatches}</ComboboxEmpty>
              <ComboboxList>
                {(country: CountryOption) => (
                  <ComboboxItem value={country}>{country.name}</ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
        <For each={format().rows}>
          {(row: readonly AddressPart[]) => (
            <div class={cls().row} data-slot="address-row">
              <For each={row}>
                {(part: AddressPart) => (
                  <Field class={cls().part} data-slot="address-part">
                    <FieldLabel for={idOf(part)}>{labelOf(part, format(), messages())}</FieldLabel>
                    <Input
                      class={cls().input}
                      id={idOf(part)}
                      data-part={part}
                      value={address()[part]}
                      dir={textDirection(address()[part]) ?? undefined}
                      autoComplete={token(part)}
                      disabled={props.isDisabled}
                      required={props.isRequired === true && part !== "line2"}
                      aria-invalid={of.isInvalid() ? true : undefined}
                      onInput={(event: Event) =>
                        set(part, (event.currentTarget as HTMLInputElement).value)
                      }
                      onBlur={of.blur}
                    />
                  </Field>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
      <For each={of.name() === undefined ? [] : (Object.keys(EMPTY) as (keyof Address)[])}>
        {(part: keyof Address) => (
          <input type="hidden" name={`${of.name() ?? ""}.${part}`} value={address()[part]} />
        )}
      </For>
    </Frame>
  );
}
