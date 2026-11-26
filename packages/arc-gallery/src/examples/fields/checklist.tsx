import { createSignal } from "@barqjs/core";
import { Badge, ChecklistField, type ChecklistOption, Grid, Stack } from "@barqjs/arc";

const PROJECTS: ChecklistOption[] = [
  { value: "web", label: "Website", meta: "12 checks" },
  { value: "api", label: "Public API", meta: "8 checks" },
  { value: "pay", label: "Payments", meta: "5 checks" },
  { value: "mobile", label: "Mobile backend", meta: "3 checks" },
  { value: "docs", label: "Docs", meta: "2 checks" },
  { value: "status", label: "Status page", meta: "1 check" },
  { value: "search", label: "Search", meta: "4 checks" },
  {
    value: "legacy",
    label: "Legacy portal",
    meta: <Badge variant="outline">Archived</Badge>,
    isDisabled: true,
  },
  { value: "reports", label: "Reports", meta: "6 checks" },
];

export default function Checklist() {
  const [projects, setProjects] = createSignal<readonly string[]>(["web", "api", "pay"]);
  const [hosts, setHosts] = createSignal<readonly string[]>(["example.com"]);
  return (
    <Grid columns={{ base: 1, md: 2 }} gap={6}>
      <ChecklistField
        label="Projects this location serves"
        options={PROJECTS}
        value={projects()}
        onChange={setProjects}
        summary={`${String(projects().length)} of ${String(PROJECTS.length)} projects run here.`}
        warning={
          projects().includes("pay")
            ? undefined
            : "Payments still has checks pinned to this location."
        }
        hiddenCount={2}
      />
      <Stack gap={6}>
        <ChecklistField
          label="Allowed hosts"
          options={[]}
          emptyLabel="No hosts yet. Add the first below."
          addPlaceholder="Add a host"
          onAdd={(text) => (text.includes(".") ? undefined : `${text} is not a host name`)}
          value={hosts()}
          onChange={setHosts}
        />
        <ChecklistField
          label="Shown on the status page (read only)"
          isReadOnly
          options={PROJECTS}
          defaultValue={["web", "api"]}
        />
      </Stack>
    </Grid>
  );
}
