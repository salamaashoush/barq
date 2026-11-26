import { createSignal } from "@barqjs/core";
import { Button, Inline, SaveTemplateDialog, Stack, TemplateGallery, Text } from "@barqjs/arc";

const CATEGORIES = [
  { key: "plans", label: "Plans" },
  { key: "letters", label: "Letters" },
  { key: "reports", label: "Reports" },
];

/** A page sketched as an image: a heading bar and `lines` of text. */
function sketch(lines: number): string {
  const rows = Array.from(
    { length: lines },
    (_, at) =>
      `<rect x="12" y="${String(30 + at * 12)}" width="${String(120 - at * 14)}" height="5" rx="2" fill="#868e96" opacity="0.5"/>`,
  ).join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#f8f9fa"/><rect x="12" y="12" width="70" height="8" rx="2" fill="#4263eb"/>${rows}</svg>`,
  )}`;
}

const TEMPLATES = [
  {
    key: "lesson",
    name: "Lesson plan",
    description: "Aims, steps, resources and a check for understanding.",
    category: "plans",
    image: sketch(4),
  },
  {
    key: "unit",
    name: "Unit overview",
    description: "Six weeks at a glance with the big questions.",
    category: "plans",
    image: sketch(3),
  },
  {
    key: "letter",
    name: "Letter home",
    description: "A short note to families, signed by the class teacher.",
    category: "letters",
    image: sketch(2),
  },
  {
    key: "trip",
    name: "Trip consent",
    description: "Where, when, cost and a slip to return.",
    category: "letters",
    image: sketch(4),
  },
  {
    key: "report",
    name: "End of term report",
    description: "A paragraph per subject and next steps.",
    category: "reports",
    image: sketch(5),
  },
];

export default function TemplateGalleryExample() {
  const [started, setStarted] = createSignal("Nothing started yet.");
  return (
    <Stack gap={4}>
      <TemplateGallery
        label="Templates"
        blank
        categories={CATEGORIES}
        templates={TEMPLATES}
        onStart={(template) =>
          setStarted(
            template === null ? "Started a blank document." : `Started from ${template.name}.`,
          )
        }
      />
      <Inline gap={3}>
        <Text size="sm" color="muted">
          {started()}
        </Text>
        <SaveTemplateDialog
          trigger={
            <Button variant="outline" size="sm">
              Save this as a template
            </Button>
          }
          defaultName="Science week letter"
          categories={CATEGORIES}
          onSave={(details) => {
            setStarted(`Saved "${details.name}" as a template.`);
          }}
        />
      </Inline>
    </Stack>
  );
}
