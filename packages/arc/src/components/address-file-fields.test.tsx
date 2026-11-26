import { afterEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { type Address, AddressFields, addressFormat } from "./address-fields.tsx";
import { FileField, type StoredFile } from "./file-field.tsx";
import { useArcForm } from "./form.tsx";

afterEach(() => destroyAnnouncer());

const HOME: Address = {
  country: "US",
  line1: "1 Main St",
  line2: "",
  city: "Springfield",
  region: "IL",
  postalCode: "62701",
};

function parts(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>("input[data-part]")].map(
    (input) => input.getAttribute("data-part") ?? "",
  );
}

describe("AddressFields", () => {
  test("laid out as the country writes it, each line with its autofill token", async () => {
    const [address, setAddress] = createSignal<Address>(HOME);
    render(() => (
      <AddressFields label="Home" section="home" value={address()} onChange={setAddress} />
    ));
    await settle();
    expect(screen.getByRole("group", { name: "Home" })).toBeDefined();
    expect(parts()).toEqual(["line1", "line2", "city", "region", "postalCode"]);
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "ZIP code" }).autocomplete).toBe(
      "section-home postal-code",
    );
    expect(screen.getByRole("textbox", { name: "State" })).toBeDefined();
    const city = screen.getByRole<HTMLInputElement>("textbox", { name: "City" });
    await user.clear(city);
    await user.type(city, "Chicago");
    await settle();
    expect(address().city).toBe("Chicago");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("choosing a country re-lays the lines and renames them", async () => {
    const [address, setAddress] = createSignal<Address>(HOME);
    render(() => <AddressFields label="Home" value={address()} onChange={setAddress} />);
    await settle();
    const country = screen.getByRole<HTMLInputElement>("combobox", { name: "Country or region" });
    expect(country.value).toBe("United States");
    await user.clear(country);
    await user.type(country, "Japan");
    await settle();
    await user.click(screen.getByRole("option", { name: "Japan" }));
    await settle();
    expect(address().country).toBe("JP");
    expect(parts()).toEqual(["postalCode", "region", "city", "line1", "line2"]);
    expect(screen.getByRole("textbox", { name: "Prefecture" })).toBeDefined();
    expect(addressFormat("DE").postal).toBe("postalCode");
  });

  test("countries named in the reader's language, and a line in Arabic reads right to left", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <AddressFields
          label="العنوان"
          countries={["EG", "SA"]}
          defaultValue={{ ...HOME, country: "EG", line1: "١ شارع التحرير" }}
        />
      </Rtl>
    ));
    await settle();
    expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("مصر");
    expect(screen.getByRole("textbox", { name: "Street address" }).getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("textbox", { name: "Governorate" })).toBeDefined();
  });

  test("holds the form's value inside form.AppField", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { address: HOME } }));
      read = () => form.state.values.address;
      return (
        <form.AppForm>
          <form.AppField name="address">
            {(field) => <field.AddressFields label="Home" />}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    await user.type(screen.getByRole("textbox", { name: /Apartment/ }), "Unit 4");
    await settle();
    expect(read()).toEqual({ ...HOME, line2: "Unit 4" });
  });
});

function pdf(name: string): File {
  return new File(["%PDF"], name, { type: "application/pdf" });
}

function picker(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
}

async function drop(files: File[]): Promise<void> {
  const input = picker();
  Object.defineProperty(input, "files", { value: files, configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
}

describe("FileField", () => {
  test("each file sent as it is picked and held once the server has it", async () => {
    const [files, setFiles] = createSignal<readonly StoredFile[]>([]);
    render(() => (
      <FileField
        label="Reports"
        value={files()}
        onChange={setFiles}
        upload={(file) =>
          Promise.resolve({ id: `id-${file.name}`, name: file.name, size: file.size })
        }
      />
    ));
    await settle();
    expect(screen.getByRole("group", { name: "Reports" })).toBeDefined();
    await drop([pdf("q1.pdf")]);
    await settle();
    await settle();
    expect(files()).toEqual([{ id: "id-q1.pdf", name: "q1.pdf", size: 4 }]);
    expect(screen.getByText("q1.pdf")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Remove q1.pdf" }));
    await settle();
    expect(files()).toEqual([]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a form cannot submit while a file is on its way, and says why", async () => {
    let release: (stored: StoredFile) => void = () => undefined;
    let submitted = 0;
    let submit: () => Promise<void> = () => Promise.resolve();
    let canSubmit: () => boolean = () => true;
    render(() => {
      const form = useArcForm(() => ({
        defaultValues: { files: [] as StoredFile[] },
        onSubmit: () => {
          submitted += 1;
        },
      }));
      submit = () => form.handleSubmit();
      canSubmit = () => form.state.canSubmit;
      return (
        <form.AppForm>
          <form.AppField name="files">
            {(field) => (
              <field.FileField
                label="Attachments"
                upload={() =>
                  new Promise<StoredFile>((resolve) => {
                    release = resolve;
                  })
                }
              />
            )}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    await drop([pdf("big.pdf")]);
    await settle();
    expect(screen.getByText("Wait for the files to finish uploading.")).toBeDefined();
    expect(canSubmit()).toBe(false);
    await submit();
    expect(submitted).toBe(0);
    release({ id: "f1", name: "big.pdf", size: 4 });
    await settle();
    await settle();
    expect(screen.queryByText("Wait for the files to finish uploading.")).toBeNull();
    expect(canSubmit()).toBe(true);
    await submit();
    expect(submitted).toBe(1);
  });

  test("a failed upload stays listed with Retry", async () => {
    render(() => (
      <FileField
        label="Reports"
        upload={() => Promise.reject(new Error("Too big for the server"))}
      />
    ));
    await settle();
    await drop([pdf("huge.pdf")]);
    await settle();
    await settle();
    expect(screen.getByRole("button", { name: /Retry/ })).toBeDefined();
  });
});

describe("addresses and files on the server", () => {
  test("hydrate what the server wrote", async () => {
    const result = await hydrates(`
      import { AddressFields, FileField } from "<arc>";
      const HOME = { country: "GB", line1: "10 Downing St", line2: "", city: "London", region: "", postalCode: "SW1A 2AA" };
      export function Page() {
        return (
          <div>
            <AddressFields label="Address" defaultValue={HOME} countries={["GB", "US"]} />
            <FileField label="Files" defaultValue={[{ id: "a", name: "notes.pdf", size: 2048 }]} upload={() => Promise.reject(new Error("no"))} />
          </div>
        );
      }
    `);
    expect(result.container.textContent).toContain("notes.pdf");
    expect(result.container.textContent).toContain("Postcode");
    result.unmount();
  });
});
