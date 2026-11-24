import { For, Show, createMemo, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@barqjs/ui/select";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  bindField,
  fieldStyles,
  withOwnErrors,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { control, gap, space, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/**
 * Every region's international calling code, ITU-T E.164, as region and code
 * run together. Codes several regions share list each of them.
 */
const CODES =
  "AC247 AD376 AE971 AF93 AG1 AI1 AL355 AM374 AO244 AR54 AS1 AT43 AU61 AW297 AX358 AZ994 BA387 " +
  "BB1 BD880 BE32 BF226 BG359 BH973 BI257 BJ229 BL590 BM1 BN673 BO591 BQ599 BR55 BS1 BT975 BW267 " +
  "BY375 BZ501 CA1 CC61 CD243 CF236 CG242 CH41 CI225 CK682 CL56 CM237 CN86 CO57 CR506 CU53 CV238 " +
  "CW599 CX61 CY357 CZ420 DE49 DJ253 DK45 DM1 DO1 DZ213 EC593 EE372 EG20 EH212 ER291 ES34 ET251 " +
  "FI358 FJ679 FK500 FM691 FO298 FR33 GA241 GB44 GD1 GE995 GF594 GG44 GH233 GI350 GL299 GM220 GN224 " +
  "GP590 GQ240 GR30 GT502 GU1 GW245 GY592 HK852 HN504 HR385 HT509 HU36 ID62 IE353 IL972 IM44 IN91 " +
  "IO246 IQ964 IR98 IS354 IT39 JE44 JM1 JO962 JP81 KE254 KG996 KH855 KI686 KM269 KN1 KP850 KR82 " +
  "KW965 KY1 KZ7 LA856 LB961 LC1 LI423 LK94 LR231 LS266 LT370 LU352 LV371 LY218 MA212 MC377 MD373 " +
  "ME382 MF590 MG261 MH692 MK389 ML223 MM95 MN976 MO853 MP1 MQ596 MR222 MS1 MT356 MU230 MV960 " +
  "MW265 MX52 MY60 MZ258 NA264 NC687 NE227 NF672 NG234 NI505 NL31 NO47 NP977 NR674 NU683 NZ64 OM968 " +
  "PA507 PE51 PF689 PG675 PH63 PK92 PL48 PM508 PR1 PS970 PT351 PW680 PY595 QA974 RE262 RO40 RS381 " +
  "RU7 RW250 SA966 SB677 SC248 SD249 SE46 SG65 SH290 SI386 SJ47 SK421 SL232 SM378 SN221 SO252 SR597 " +
  "SS211 ST239 SV503 SX1 SY963 SZ268 TA290 TC1 TD235 TG228 TH66 TJ992 TK690 TL670 TM993 TN216 TO676 " +
  "TR90 TT1 TV688 TW886 TZ255 UA380 UG256 US1 UY598 UZ998 VA39 VC1 VE58 VG1 VI1 VN84 VU678 WF681 " +
  "WS685 XK383 YE967 YT262 ZA27 ZM260 ZW263";

/** Region to calling code. */
export const CALLING_CODES: ReadonlyMap<string, string> = new Map(
  CODES.split(" ").map((entry) => [entry.slice(0, 2), entry.slice(2)]),
);

/** Which region a shared code means when a number gives nothing else to go on. */
const MAIN = new Set(["US", "RU", "GB", "NO", "AU", "IT", "MA", "RE", "SH", "FI", "GP", "CW"]);

export interface PhoneNumber {
  /** The region, ISO 3166 alpha-2. */
  country: string;
  /** The national significant number: digits only, no trunk 0. */
  national: string;
}

/**
 * An international number read back into its region and its national
 * digits, preferring `hint` among regions that share a code.
 */
export function parsePhone(value: string, hint?: string): PhoneNumber | null {
  const digits = value.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) return null;
  const rest = digits.slice(1);
  for (let length = 3; length >= 1; length--) {
    const code = rest.slice(0, length);
    const regions = [...CALLING_CODES].filter(([, one]) => one === code).map(([region]) => region);
    if (regions.length === 0) continue;
    const country =
      (hint !== undefined && regions.includes(hint) ? hint : undefined) ??
      regions.find((region) => MAIN.has(region)) ??
      regions[0];
    if (country !== undefined) return { country, national: rest.slice(length) };
  }
  return null;
}

/** `+201001234567`, from a region and what was typed in it; `null` with no digits. */
export function formatPhone(country: string, typed: string): string | null {
  const national = typed.replace(/\D/g, "").replace(/^0+/, "");
  if (national === "") return null;
  return `+${CALLING_CODES.get(country) ?? ""}${national}`;
}

export const phoneFieldStyles = variants({
  slots: {
    control: arc(control.segmented, { paddingInlineStart: space.x0_5, gap: space.x1 }),
    country: arc(control.boxedTrigger, gap[1], type.numeric, { paddingInline: space.x2 }),
    input: arc(control.bareInput, type.numeric),
    option: arc({}),
  },
});

type Slots = ReturnType<typeof phoneFieldStyles> & FieldSlots;

export interface PhoneFieldProps
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<string | null>, Customisable<Slots> {
  /** The region shown before a number says otherwise. @default the locale's region */
  defaultCountry?: string;
  /** The regions offered, in place of every one. */
  countries?: readonly string[];
  placeholder?: string;
}

/**
 * A telephone number: a region, chosen from a list named in the locale with
 * its calling code, and the number as it is dialled there. Held in E.164,
 * `+201001234567`, or `null` while empty.
 *
 * ```tsx
 * <PhoneField label="Mobile" defaultCountry="EG" value={phone()} onChange={setPhone} />
 * ```
 *
 * A number pasted or typed with a `+` picks its region from its code. The
 * input brings up the phone's dial pad and the browser's autofill, and a
 * number too short or too long to dial says so when the field is left.
 */
export function PhoneField(props: PhoneFieldProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const of = bindField<string | null>(props, null);
  const [picked, setPicked] = createSignal<string | null>(null);
  const [typed, setTyped] = createSignal<string | null>(null);
  const [problem, setProblem] = createSignal<string | null>(null);

  const regionOfLocale = (): string | undefined => {
    try {
      return new Intl.Locale(locale().locale).maximize().region;
    } catch {
      return undefined;
    }
  };
  const parsed = createMemo((): PhoneNumber | null => {
    const value = of.value();
    return value === null || value === undefined
      ? null
      : parsePhone(value, untrack(picked) ?? undefined);
  });
  const country = (): string =>
    picked() ?? parsed()?.country ?? props.defaultCountry ?? regionOfLocale() ?? "US";
  const shown = (): string => typed() ?? parsed()?.national ?? "";

  const names = createMemo(() => {
    const display = new Intl.DisplayNames([locale().locale], { type: "region" });
    const collate = new Intl.Collator(locale().locale);
    const regions = props.countries ?? [...CALLING_CODES.keys()];
    return regions
      .filter((region) => CALLING_CODES.has(region))
      .map((region) => ({ region, name: display.of(region) ?? region }))
      .toSorted((one, other) => collate.compare(one.name, other.name));
  });

  const commit = (region: string, text: string): void => {
    if (text.trim().startsWith("+")) {
      const read = parsePhone(text, region);
      if (read !== null) {
        setPicked(read.country);
        setTyped(read.national);
        of.change(formatPhone(read.country, read.national));
        return;
      }
    }
    of.change(formatPhone(region, text));
  };

  const check = (): void => {
    const digits = `${CALLING_CODES.get(untrack(country)) ?? ""}${untrack(shown).replace(/\D/g, "").replace(/^0+/, "")}`;
    const national = untrack(shown).replace(/\D/g, "");
    setProblem(
      national !== "" && (digits.length < 7 || digits.length > 15) ? messages().invalidPhone : null,
    );
  };

  const wiring = withOwnErrors(of, () => {
    const found = problem();
    return found === null ? [] : [found];
  });
  const isInvalid = wiring.isInvalid;
  const cls = () => parts({ ...fieldStyles(), ...phoneFieldStyles() }, props.classes);

  return (
    <Frame
      of={wiring}
      label={props.label}
      description={props.description}
      field={props}
      slot="phone-field"
    >
      <div
        class={cls().control}
        data-slot="phone-field-control"
        data-invalid={isInvalid() ? "" : undefined}
        data-disabled={props.isDisabled === true ? "" : undefined}
      >
        <Select
          value={country()}
          isDisabled={props.isDisabled}
          onValueChange={(region: string) => {
            setPicked(region);
            commit(region, untrack(shown));
          }}
        >
          <SelectTrigger
            class={cls().country}
            data-slot="phone-field-country"
            aria-label={`${messages().country}, ${names().find((one) => one.region === country())?.name ?? country()}`}
          >
            <span aria-hidden="true">{`${country()} +${CALLING_CODES.get(country()) ?? ""}`}</span>
          </SelectTrigger>
          <SelectContent position="popper" placement="bottom start">
            <For each={names()}>
              {(entry: { region: string; name: string }) => (
                <SelectItem class={cls().option} value={entry.region} textValue={entry.name}>
                  {`${entry.name} +${CALLING_CODES.get(entry.region) ?? ""}`}
                </SelectItem>
              )}
            </For>
          </SelectContent>
        </Select>
        <input
          class={cls().input}
          data-slot="phone-field-input"
          id={of.ids.control}
          type="tel"
          inputmode="tel"
          autocomplete="tel-national"
          value={shown()}
          placeholder={props.placeholder}
          disabled={props.isDisabled}
          aria-invalid={isInvalid() ? true : undefined}
          aria-required={props.isRequired === true ? true : undefined}
          aria-describedby={wiring.describedBy(props.description !== undefined)}
          onInput={(event: Event) => {
            const text = (event.currentTarget as HTMLInputElement).value;
            // The country shown is the one being typed in, even once the
            // number is cleared and no longer says which it was.
            if (untrack(picked) === null) setPicked(untrack(country));
            setTyped(text);
            if (untrack(problem) !== null) setProblem(null);
            commit(untrack(country), text);
          }}
          onBlur={() => {
            check();
            setTyped(null);
            of.blur();
          }}
        />
        <Show when={of.name() !== undefined}>
          <input type="hidden" name={of.name()} value={of.value() ?? ""} />
        </Show>
      </div>
    </Frame>
  );
}
