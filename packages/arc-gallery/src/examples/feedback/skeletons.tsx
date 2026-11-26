import { createSignal } from "@barqjs/core";
import { PageSkeleton, type PageTemplate, Stack, ToggleGroup, ToggleGroupItem } from "@barqjs/arc";

const TEMPLATES: readonly PageTemplate[] = [
  "list",
  "record",
  "form",
  "dashboard",
  "settings",
  "review",
];

export default function Skeletons() {
  const [template, setTemplate] = createSignal<PageTemplate>("list");
  return (
    <Stack gap={4}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Template"
        value={template()}
        onValueChange={(value: string | string[]) => {
          if (typeof value === "string" && value !== "") setTemplate(value as PageTemplate);
        }}
      >
        {TEMPLATES.map((one) => (
          <ToggleGroupItem value={one}>{one}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      <PageSkeleton template={template()} />
    </Stack>
  );
}
