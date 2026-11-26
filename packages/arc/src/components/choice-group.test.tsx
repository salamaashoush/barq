import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { type ColorScheme, colorScheme } from "@barqjs/primitives/color-scheme";
import { accessibleDescription, ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { ChecklistField, type ChecklistOption } from "./checklist-field.tsx";
import { CheckboxCards } from "./choice-cards.tsx";
import { CheckboxGroupField, type GroupOption, RadioGroupField } from "./choice-group.tsx";
import { type FieldOption, useArcForm } from "./form.tsx";
import { ThemePicker } from "./theme-picker.tsx";

function Rtl(props: ParentProps) {
  provideLocale("ar-EG");
  return <div dir="rtl">{props.children}</div>;
}

const SEVERITIES: GroupOption[] = [
  { value: "critical", label: "Critical", description: "Pages whoever is on call." },
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor", caveat: "Sent as a digest, not a page." },
];

describe("CheckboxGroupField", () => {
  test("a group of checkboxes held in the options' order, each described by its lines", async () => {
    const [chosen, setChosen] = createSignal<readonly string[]>([]);
    render(() => (
      <CheckboxGroupField
        label="Severities"
        options={SEVERITIES}
        value={chosen()}
        onChange={setChosen}
      />
    ));
    await settle();
    expect(screen.getByRole("group", { name: "Severities" })).toBeDefined();
    await user.click(screen.getByRole("checkbox", { name: "Minor" }));
    await user.click(screen.getByRole("checkbox", { name: "Critical" }));
    await settle();
    expect(chosen()).toEqual(["critical", "minor"]);
    expect(accessibleDescription(screen.getByRole("checkbox", { name: "Critical" }))).toBe(
      "Pages whoever is on call.",
    );
    expect(accessibleDescription(screen.getByRole("checkbox", { name: "Minor" }))).toBe(
      "Sent as a digest, not a page.",
    );
    screen.getByRole("checkbox", { name: "Major" }).focus();
    await user.keyboard(" ");
    await settle();
    expect(chosen()).toEqual(["critical", "major", "minor"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("required, it asks for one once touched; shortcuts set it at once", async () => {
    const [chosen, setChosen] = createSignal<readonly string[]>(["major"]);
    render(() => (
      <CheckboxGroupField
        label="Severities"
        isRequired
        options={SEVERITIES}
        shortcuts={[
          { label: "All", values: ["critical", "major", "minor"] },
          { label: "None", values: [] },
        ]}
        value={chosen()}
        onChange={setChosen}
      />
    ));
    await settle();
    expect(screen.queryByText("Pick at least one.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "All" }));
    await settle();
    expect(chosen()).toEqual(["critical", "major", "minor"]);
    await user.click(screen.getByRole("button", { name: "None" }));
    await settle();
    expect(chosen()).toEqual([]);
    expect(screen.getByText("Pick at least one.")).toBeDefined();
    expect(screen.getByRole("group", { name: "Severities" }).getAttribute("aria-invalid")).toBe(
      "true",
    );
  });

  test("required inside a form, it says so after a submit nobody touched it for", async () => {
    let submit: () => Promise<void> = () => Promise.resolve();
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { events: [] as string[] } }));
      submit = () => form.handleSubmit();
      return (
        <form.AppForm>
          <form.AppField name="events">
            {(field) => <field.CheckboxGroupField label="Events" isRequired options={SEVERITIES} />}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    expect(screen.queryByText("Pick at least one.")).toBeNull();
    await submit();
    await settle();
    expect(screen.getByText("Pick at least one.")).toBeDefined();
  });

  test("keeps a held value the options lack, switches in place of boxes, and reads only", async () => {
    const [chosen, setChosen] = createSignal<readonly string[]>(["legacy", "major"]);
    render(() => (
      <div>
        <CheckboxGroupField
          label="Kinds"
          control="switch"
          options={SEVERITIES}
          unknownLabel={(value) => `${value} (retired)`}
          value={chosen()}
          onChange={setChosen}
        />
        <CheckboxGroupField label="Read" isReadOnly options={SEVERITIES} defaultValue={["minor"]} />
        <CheckboxGroupField label="Nothing" isReadOnly options={SEVERITIES} />
      </div>
    ));
    await settle();
    expect(
      screen
        .getAllByRole("switch")
        .map((one) => one.getAttribute("aria-checked") ?? (one as HTMLInputElement).checked),
    ).toHaveLength(4);
    expect(screen.getByRole("switch", { name: "legacy (retired)" })).toBeDefined();
    await user.click(screen.getByRole("switch", { name: "Critical" }));
    await settle();
    expect(chosen()).toEqual(["critical", "major", "legacy"]);
    expect(screen.getByRole("list", { name: "Read" }).textContent).toBe("Minor");
    expect(screen.getByText("None chosen")).toBeDefined();
  });

  test("holds the form's value inside form.AppField", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { events: ["major"] } }));
      read = () => form.state.values.events;
      return (
        <form.AppForm>
          <form.AppField name="events">
            {(field) => (
              <field.CheckboxGroupField label="Events" layout="grid" options={SEVERITIES} />
            )}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    await user.click(screen.getByRole("checkbox", { name: "Critical" }));
    await settle();
    expect(read()).toEqual(["critical", "major"]);
  });
});

describe("RadioGroupField", () => {
  test("one of the options, the arrows moving in the reading direction", async () => {
    const [scope, setScope] = createSignal<string | null>("major");
    render(() => (
      <Rtl>
        <RadioGroupField
          label="النطاق"
          layout="row"
          options={SEVERITIES}
          value={scope()}
          onChange={setScope}
        />
      </Rtl>
    ));
    await settle();
    expect(screen.getByRole("radiogroup", { name: "النطاق" })).toBeDefined();
    const major = screen.getByRole<HTMLInputElement>("radio", { name: "Major" });
    expect(major.checked).toBe(true);
    await user.click(screen.getByText("Critical"));
    await settle();
    expect(scope()).toBe("critical");
    screen.getByRole("radio", { name: "Critical" }).focus();
    await user.keyboard("{ArrowLeft}");
    await settle();
    expect(scope()).toBe("major");
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a tap chooses, and read only it shows the choice", async () => {
    const [scope, setScope] = createSignal<string | null>(null);
    render(() => (
      <div>
        <RadioGroupField label="Scope" options={SEVERITIES} value={scope()} onChange={setScope} />
        <RadioGroupField label="Fixed" isReadOnly options={SEVERITIES} defaultValue="minor" />
      </div>
    ));
    await settle();
    user.tap(screen.getByRole("radio", { name: "Minor" }));
    await settle();
    expect(scope()).toBe("minor");
    expect(screen.getByRole("list", { name: "Fixed" }).textContent).toBe("Minor");
  });
});

const PROJECTS: ChecklistOption[] = [
  { value: "web", label: "Website", meta: "12 checks" },
  { value: "api", label: "API", meta: "4 checks" },
  { value: "workers", label: "Workers", meta: "Archived", isDisabled: true },
];

describe("ChecklistField", () => {
  test("rows of checkboxes with what they carry at their end, held in row order", async () => {
    const [chosen, setChosen] = createSignal<readonly string[]>([]);
    render(() => (
      <ChecklistField
        label="Projects"
        options={PROJECTS}
        summary="Runs checks for the projects ticked."
        value={chosen()}
        onChange={setChosen}
      />
    ));
    await settle();
    expect(screen.getByRole("group", { name: "Projects" })).toBeDefined();
    await user.click(screen.getByText("API"));
    await user.click(screen.getByText("Website"));
    await settle();
    expect(chosen()).toEqual(["web", "api"]);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /Workers/ }).disabled).toBe(true);
    expect(screen.getByText("12 checks")).toBeDefined();
    expect(screen.getByText("Runs checks for the projects ticked.")).toBeDefined();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a search over a long list, counted for a screen reader, and no match said", async () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      value: `p${String(index)}`,
      label: `Project ${String(index)}`,
    }));
    render(() => <ChecklistField label="Projects" options={many} />);
    await settle();
    const search = screen.getByRole("searchbox", { name: "Search" });
    await user.type(search, "project 1");
    await settle();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("1 result");
    await user.type(search, "x");
    await settle();
    expect(screen.getByText("No matches")).toBeDefined();
  });

  test("a free entry is added ticked, a refused one says why", async () => {
    const [hosts, setHosts] = createSignal<readonly string[]>([]);
    render(() => (
      <ChecklistField
        label="Hosts"
        options={[]}
        emptyLabel="No hosts yet."
        addPlaceholder="Add a host"
        onAdd={(text) => (text.includes(".") ? undefined : `${text} is not a host`)}
        value={hosts()}
        onChange={setHosts}
      />
    ));
    await settle();
    expect(screen.getByText("No hosts yet.")).toBeDefined();
    const add = screen.getByRole("textbox", { name: "Add a host" });
    await user.type(add, "localhost{Enter}");
    await settle();
    expect(screen.getByText("localhost is not a host")).toBeDefined();
    await user.clear(add);
    await user.type(add, "example.com");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await settle();
    expect(hosts()).toEqual(["example.com"]);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "example.com" }).checked).toBe(
      true,
    );
  });

  test("read only shows the chosen rows; a warning replaces the summary; hidden ones counted", async () => {
    render(() => (
      <ChecklistField
        label="Projects"
        isReadOnly
        options={PROJECTS}
        defaultValue={["api"]}
        summary="Fine."
        warning="Website still has checks here."
        hiddenCount={2}
      />
    ));
    await settle();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(document.querySelectorAll('[data-slot="checklist-field-row"]')).toHaveLength(1);
    expect(screen.getByText("Website still has checks here.")).toBeDefined();
    expect(screen.queryByText("Fine.")).toBeNull();
    expect(screen.getByText("Also 2 more you cannot see.")).toBeDefined();
  });

  test("holds the form's value inside form.AppField", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { projects: ["api"] } }));
      read = () => form.state.values.projects;
      return (
        <Rtl>
          <form.AppForm>
            <form.AppField name="projects">
              {(field) => <field.ChecklistField label="Projects" options={PROJECTS} />}
            </form.AppField>
          </form.AppForm>
        </Rtl>
      );
    });
    await settle();
    await user.click(screen.getByRole("checkbox", { name: /Website/ }));
    await settle();
    expect(read()).toEqual(["web", "api"]);
  });
});

const REGIONS: FieldOption[] = [
  { value: "eu", label: "Frankfurt", hint: "eu-central-1", group: "Europe" },
  { value: "us", label: "Virginia", hint: "us-east-1", group: "Americas" },
  { value: "uk", label: "London", hint: "eu-west-2", group: "Europe" },
];

interface RegionValues {
  region: string | null;
}

describe("SelectField options", () => {
  test("carry a hint the trigger leaves out, sit under their group, and a none option holds null", async () => {
    let read: () => unknown = () => undefined;
    render(() => {
      const defaults: RegionValues = { region: "eu" };
      const form = useArcForm(() => ({ defaultValues: defaults }));
      read = () => form.state.values.region;
      return (
        <form.AppForm>
          <form.AppField name="region">
            {(field) => (
              <field.SelectField label="Region" options={REGIONS} noneLabel="Nearest to you" />
            )}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    const trigger = document.querySelector<HTMLElement>(
      '[data-slot="select-trigger"]',
    ) as HTMLElement;
    expect(trigger.textContent).toBe("Frankfurt");
    await user.click(trigger);
    await settle();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Nearest to you",
      "Frankfurteu-central-1",
      "Londoneu-west-2",
      "Virginiaus-east-1",
    ]);
    expect(screen.getByText("Europe")).toBeDefined();
    expect(screen.getByText("Americas")).toBeDefined();
    await user.click(screen.getByRole("option", { name: /Nearest/ }));
    await settle();
    expect(read()).toBeNull();
    expect(trigger.textContent).toBe("Nearest to you");
  });

  test("a saved value no longer listed stays one", async () => {
    render(() => {
      const form = useArcForm(() => ({ defaultValues: { region: "ap" } }));
      return (
        <form.AppForm>
          <form.AppField name="region">
            {(field) => (
              <field.SelectField
                label="Region"
                options={REGIONS}
                unknownLabel={(value) => `${value} (retired)`}
              />
            )}
          </form.AppField>
        </form.AppForm>
      );
    });
    await settle();
    expect(document.querySelector('[data-slot="select-trigger"]')?.textContent).toBe(
      "ap (retired)",
    );
  });
});

describe("choice cards with media", () => {
  test("draw the media across the top of the card, hidden from a screen reader", async () => {
    render(() => (
      <CheckboxCards
        label="Layouts"
        mediaRatio="4 / 3"
        options={[{ value: "grid", label: "Grid", media: <img src="grid.png" alt="" /> }]}
      />
    ));
    await settle();
    const media = document.querySelector('[data-slot="choice-card-media"]');
    expect(media?.getAttribute("aria-hidden")).toBe("true");
    expect(media?.parentElement?.getAttribute("data-slot")).toBe("choice-card");
    expect(
      (
        document.querySelector('[data-slot="checkbox-cards-group"]') as HTMLElement
      ).style.getPropertyValue("--choice-card-media-ratio"),
    ).toBe("4 / 3");
  });
});

interface HappyWindow {
  happyDOM: HappyPage;
}

interface HappyPage {
  setURL(url: string): void;
}

const page = (window as unknown as HappyWindow).happyDOM;

describe("ThemePicker", () => {
  beforeAll(() => page.setURL("http://localhost/"));
  afterAll(() => page.setURL("about:blank"));
  beforeEach(() => {
    document.cookie = "theme=; max-age=0; path=/";
    document.documentElement.className = "";
    destroyAnnouncer();
  });

  let scheme: ColorScheme | undefined;
  function Scheme(props: ParentProps) {
    scheme = colorScheme();
    return <>{props.children}</>;
  }

  test("cards with each theme drawn small, choosing one sets the scheme and says so", async () => {
    const told: string[] = [];
    render(() => (
      <Scheme>
        <ThemePicker onChange={(choice) => told.push(choice)} />
      </Scheme>
    ));
    await settle();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeDefined();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "System" }).checked).toBe(true);
    expect(document.querySelectorAll('[data-slot="theme-preview"]')).toHaveLength(3);
    expect(
      document
        .querySelectorAll('[data-slot="theme-preview"]')[2]
        ?.querySelectorAll('[data-slot="theme-preview-half"]'),
    ).toHaveLength(2);
    await user.click(screen.getByText("Dark"));
    await settle();
    expect(scheme?.choice()).toBe("dark");
    expect(told).toEqual(["dark"]);
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("segmented, three buttons in a row", async () => {
    render(() => (
      <Scheme>
        <ThemePicker variant="segmented" />
      </Scheme>
    ));
    await settle();
    expect(screen.getByRole("group", { name: "Theme" })).toBeDefined();
    const light = screen.getByRole("button", { name: "Light" });
    await user.click(light);
    await settle();
    expect(scheme?.choice()).toBe("light");
    expect(light.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("choice fields on the server", () => {
  test("hydrate what the server wrote", async () => {
    const result = await hydrates(`
      import { colorScheme } from "@barqjs/primitives/color-scheme";
      import { CheckboxGroupField, ChecklistField, RadioGroupField, ThemePicker } from "<arc>";
      const OPTIONS = [
        { value: "a", label: "Alpha", description: "First." },
        { value: "b", label: "Beta", caveat: "Slower." },
      ];
      const ROWS = [{ value: "a", label: "Alpha", meta: "3 checks" }, { value: "b", label: "Beta" }];
      export function Page() {
        colorScheme();
        return (
          <div>
            <CheckboxGroupField label="Many" options={OPTIONS} defaultValue={["b"]} shortcuts={[{ label: "All", values: ["a", "b"] }]} />
            <RadioGroupField label="One" options={OPTIONS} defaultValue="a" layout="grid" />
            <ChecklistField label="Rows" options={ROWS} defaultValue={["a"]} summary="One chosen." onAdd={() => undefined} />
            <ThemePicker />
            <ThemePicker variant="segmented" />
          </div>
        );
      }
    `);
    expect(result.container.querySelectorAll('[data-slot="choice-group-option"]')).toHaveLength(4);
    expect(result.container.querySelectorAll('[data-slot="checklist-field-row"]')).toHaveLength(2);
    result.unmount();
  });
});
