/**
 * What a server writes for arc's components, in a process with no DOM.
 */

import { describe, expect, test } from "bun:test";

import { serverProcess } from "./ssr-harness.ts";

/**
 * A page handler over a root route rendering `jsx`, asked for `path` with
 * `cookie`. `names` are what `jsx` takes from arc.
 */
function routed(names: string[], jsx: string, path: string, cookie = ""): string {
  return `
    import { Outlet } from "@barqjs/router";
    import { createPageHandler, renderRoutes } from "@barqjs/router/server";
    import { ${names.join(", ")} } from "<arc>";

    const routeTree = [
      {
        path: "/",
        component: () => (${jsx}),
        staticData: { crumb: "Acme" },
        children: [
          { path: "", component: () => <p>overview</p> },
          { path: "projects", component: () => <p>projects</p>, staticData: { crumb: "Projects" } },
        ],
      },
    ];

    export async function page() {
      const handler = createPageHandler({
        routeTree,
        app: (state) => renderRoutes(state),
        stream: false,
        document: (parts) => parts.body,
      });
      const response = await handler(
        new Request("http://localhost${path}", { headers: { cookie: ${JSON.stringify(cookie)} } }),
      );
      return await response.text();
    }
  `;
}

const SHELL = `
  <AppShell
    navigation={[
      { items: [{ label: "Overview", to: "/", exact: true }] },
      { label: "Workspace", items: [{ label: "Projects", to: "/projects", badge: "3" }] },
    ]}
    header={<span>Acme</span>}
  >
    <Outlet />
  </AppShell>
`;

describe("on the server", () => {
  test("AppShell writes its navigation, the current item and the trail", async () => {
    const { code, html, errors } = await serverProcess(routed(["AppShell"], SHELL, "/projects"));
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('data-slot="app-shell"');
    const current = /<a [^>]*aria-current="page"[^>]*>/.exec(html)?.[0] ?? "";
    expect(current).toContain('href="/projects"');
    expect(current).toContain('data-slot="sidebar-menu-button"');
    expect(html).toContain('data-slot="breadcrumbs"');
    expect(html).toContain("projects</p>");
    expect(html).toContain('data-state="expanded"');
  });

  test("AppShell opens as the request's cookie says it was left", async () => {
    const { code, html } = await serverProcess(
      routed(["AppShell"], SHELL, "/", "sidebar_state=false"),
    );
    expect(code).toBe(0);
    expect(html).toContain('data-state="collapsed"');
    expect(html).toContain('data-collapsible="icon"');
  });

  test("ThemeToggle draws the choice from the request's cookie", async () => {
    const jsx = "<ArcProvider toaster={false}><ThemeToggle /></ArcProvider>";
    const dark = await serverProcess(
      routed(["ArcProvider", "ThemeToggle"], jsx, "/", "theme=dark"),
    );
    expect(dark.errors).toBe("");
    expect(dark.html).toMatch(/data-choice="dark"/);
    const unset = await serverProcess(routed(["ArcProvider", "ThemeToggle"], jsx, "/"));
    expect(unset.html).toMatch(/data-choice="system"/);
  });

  test("CopyButton, EmptyState and StatCard render with no DOM", async () => {
    const jsx = `
      <main>
        <CopyButton value="tok_example" label="Copy the token" />
        <EmptyState heading="No invoices yet" description="None sent." />
        <StatCard label="Requests" value="128" trend={[1, 3, 2]} />
      </main>
    `;
    const { code, html, errors } = await serverProcess(
      routed(["CopyButton", "EmptyState", "StatCard"], jsx, "/"),
    );
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('aria-label="Copy the token"');
    expect(html).toContain('data-slot="copy-button-status"');
    expect(html).toContain("No invoices yet");
    expect(html).toContain('aria-label="Trend over 3 values, from 1 to 2; lowest 1, highest 3"');
  });
});

describe("the data layer on the server", () => {
  test("DataTable writes its grid, its headers and its rows", async () => {
    const jsx = `
      <DataTable
        label="Invoices"
        getRowId={(invoice) => invoice.id}
        data={[
          { id: "a", number: "INV-001", total: 120 },
          { id: "b", number: "INV-002", total: 80 },
        ]}
        columns={[
          { accessorKey: "number", header: "Number" },
          { accessorKey: "total", header: "Total", align: "end", hideBelow: "md" },
        ]}
        selectionMode="multiple"
        defaultSorting={[{ id: "number", desc: true }]}
      />
    `;
    const { code, html, errors } = await serverProcess(routed(["DataTable"], jsx, "/"));
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="Invoices"');
    expect(html).toContain('aria-sort="descending"');
    expect(html.indexOf("INV-002")).toBeLessThan(html.indexOf("INV-001"));
    expect(html).toContain('aria-label="Select all"');
    // Narrow until the browser says otherwise: the server answers every media query false.
    expect(html).not.toContain(">Total<");
  });

  test("a form of arc's fields writes its labels, values and wiring", async () => {
    const jsx = `
      (() => {
        const form = useArcForm(() => ({
          defaultValues: { email: "salama@example.com", plan: "team", alerts: true },
        }));
        return (
          <form.AppForm>
            <form>
              <form.AppField name="email">
                {(field) => <field.TextField label="Email" description="Where receipts go." />}
              </form.AppField>
              <form.AppField name="plan">
                {(field) => (
                  <field.SelectField
                    label="Plan"
                    options={[{ value: "free", label: "Free" }, { value: "team", label: "Team" }]}
                  />
                )}
              </form.AppField>
              <form.AppField name="alerts">
                {(field) => <field.SwitchField label="Alerts" />}
              </form.AppField>
              <form.SubmitButton>Save</form.SubmitButton>
            </form>
          </form.AppForm>
        );
      })()
    `;
    const { code, html, errors } = await serverProcess(routed(["useArcForm"], jsx, "/"));
    expect(errors).toBe("");
    expect(code).toBe(0);
    const input = /<input [^>]*name="email"[^>]*>/.exec(html)?.[0] ?? "";
    expect(input).toContain('value="salama@example.com"');
    const id = /id="([^"]+)"/.exec(input)?.[1] ?? "";
    expect(html).toContain(`for="${id}"`);
    expect(input).toContain("aria-describedby=");
    expect(html).toContain("Where receipts go.");
    expect(html).toContain("Team");
    expect(html).toMatch(/role="switch"[^>]*checked|checked[^>]*role="switch"/);
    expect(html).toContain('type="submit"');
  });
});

describe("the inputs, actions and overlays on the server", () => {
  test("fields, pickers and chips render with no DOM", async () => {
    const jsx = `
      <main>
        <Chip onRemove={() => {}}>Design</Chip>
        <TagGroup label="Cities" items={[{ id: "a", label: "Cairo" }]} onRemove={() => {}} />
        <TagInput label="Hosts" defaultValue={["example.com"]} name="hosts" />
        <TimePicker label="Starts" />
        <DateRangeField label="Period" presets="common" />
        <ColorPicker label="Brand" defaultValue="#7f00ff" />
        <ColorSwatches label="Tag" colors={["#e11d48", "#2563eb"]} />
        <CurrencyField label="Price" currency="USD" defaultValue={12.5} />
        <PhoneField label="Phone" defaultValue="+442079460958" />
        <Rating label="Score" defaultValue={3} />
        <RangeSlider label="Price range" defaultValue={[20, 60]} />
        <RadioCards label="Plan" options={[{ value: "a", label: "A" }]} />
        <FileUpload upload={() => Promise.resolve()} accept={["image/*"]} />
      </main>
    `;
    const names = [
      "Chip",
      "TagGroup",
      "TagInput",
      "TimePicker",
      "DateRangeField",
      "ColorPicker",
      "ColorSwatches",
      "CurrencyField",
      "PhoneField",
      "Rating",
      "RangeSlider",
      "RadioCards",
      "FileUpload",
    ];
    const { code, html, errors } = await serverProcess(routed(names, jsx, "/"));
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('aria-label="Remove"');
    expect(html).toContain("Cairo");
    expect(html).toContain('name="hosts"');
    expect(html).toContain("$12.50");
    expect(html).toContain("GB +44");
    expect(html).toContain('data-slot="rating"');
    expect(html).toContain('type="range"');
    expect(html).toContain("Accepts image/*");
  });

  test("actions, alerts and overlays render with no DOM, closed", async () => {
    const jsx = `
      <main>
        <IconButton label="Delete"><svg /></IconButton>
        <SplitButton onPress={() => {}} actions={[{ id: "a", label: "Later", onAction: () => {} }]}>Send</SplitButton>
        <ActionBar aria-label="Invoice" actions={[{ id: "a", label: "Send" }]} onAction={() => {}} />
        <Toolbar aria-label="Tools" variant="docked"><IconButton label="Bold"><svg /></IconButton></Toolbar>
        <Banner tone="warning" onDismiss={() => {}}>Maintenance tonight.</Banner>
        <InlineAlert tone="danger" title="Failed">Try again.</InlineAlert>
        <Tearsheet heading="Setup"><p>Body</p></Tearsheet>
        <ResponsiveOverlay heading="Filters"><p>Body</p></ResponsiveOverlay>
        <Tour steps={[{ target: "#x", title: "Hi" }]} defaultOpen />
      </main>
    `;
    const names = [
      "IconButton",
      "SplitButton",
      "ActionBar",
      "Toolbar",
      "Banner",
      "InlineAlert",
      "Tearsheet",
      "ResponsiveOverlay",
      "Tour",
    ];
    const { code, html, errors } = await serverProcess(routed(names, jsx, "/"));
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('aria-label="Delete"');
    expect(html).toContain('aria-label="More options"');
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("Maintenance tonight.");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("Setup");
    expect(html).not.toContain('data-slot="coachmark"');
  });
});

describe("the charts on the server", () => {
  test("every chart writes its drawing and its table with no DOM", async () => {
    const jsx = `
      <main>
        <DonutChart label="Checks" data={[{ key: "up", label: "Up", value: 4, tone: "success" }]} />
        <ComboChart
          label="Runs"
          data={[{ day: "Mon", runs: 3, rate: 0.1 }]}
          x="day"
          bars={[{ key: "runs", label: "Runs" }]}
          lines={[{ key: "rate", label: "Rate" }]}
          dualAxis
        />
        <ScatterChart label="Requests" data={[{ a: 1, b: 2, c: 3 }]} x="a" y="b" size="c" />
        <FunnelChart label="Sign-ups" data={[{ key: "a", label: "Visited", value: 10 }]} />
        <Gauge label="Storage" value={72} thresholds={[{ value: 70, tone: "warning" }]} />
        <Heatmap label="Load" data={[{ d: "Mon", h: "09", v: 2 }]} x="h" y="d" value="v" />
        <Sparkline data={[1, 3, 2]} variant="bar" />
      </main>
    `;
    const names = [
      "DonutChart",
      "ComboChart",
      "ScatterChart",
      "FunnelChart",
      "Gauge",
      "Heatmap",
      "Sparkline",
    ];
    const { code, html, errors } = await serverProcess(routed(names, jsx, "/"));
    expect(errors).toBe("");
    expect(code).toBe(0);
    for (const label of ["Checks", "Runs", "Requests", "Sign-ups", "Load"]) {
      expect(html).toContain(`aria-label="${label}"`);
      expect(html).toContain(`>${label}</caption>`);
    }
    expect(html).toContain('role="meter progressbar"');
    expect(html).toContain('aria-valuetext="72"');
    expect(html).toContain('data-slot="sparkline-bar"');
    expect(html).toContain("var(--success)");
  });
});
