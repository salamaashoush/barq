import { createSignal } from "@barqjs/core";
import {
  Button,
  Checkbox,
  Field,
  FieldLabel,
  Inline,
  Input,
  ResponsiveOverlay,
  Stack,
  Tearsheet,
  Text,
} from "@barqjs/arc";
import { SlidersHorizontal } from "@barqjs/lucide/icons/sliders-horizontal";

export default function ResponsiveOverlays() {
  const [archived, setArchived] = createSignal(false);
  const [campaign, setCampaign] = createSignal(false);
  const [created, setCreated] = createSignal<string | null>(null);
  const [title, setTitle] = createSignal("Winter launch");
  return (
    <Stack gap={4}>
      <Inline gap={2} wrap>
        <ResponsiveOverlay
          heading="Filters"
          description="A popover with a mouse, a sheet under a finger or on a phone."
          desktop="popover"
          trigger={
            <Button variant="outline">
              <SlidersHorizontal />
              Filters
            </Button>
          }
        >
          <Field orientation="horizontal">
            <Checkbox id="show-archived" checked={archived()} onCheckedChange={setArchived} />
            <FieldLabel for="show-archived">Show archived projects</FieldLabel>
          </Field>
        </ResponsiveOverlay>

        <ResponsiveOverlay
          heading="Share project"
          description="A dialog on a wide screen."
          trigger={<Button variant="outline">Share</Button>}
          footer={<Button>Copy link</Button>}
        >
          <Text>Anyone at example.com with the link can view this project.</Text>
        </ResponsiveOverlay>

        <Button onPress={() => setCampaign(true)}>New campaign</Button>
      </Inline>
      <Text size="sm" color="muted">
        Archived {archived() ? "shown" : "hidden"}.{" "}
        {created() === null ? "" : `Created “${created() ?? ""}”.`}
      </Text>

      <Tearsheet
        open={campaign()}
        onOpenChange={setCampaign}
        heading="New campaign"
        description="Everything the launch email needs, in one place."
        influencer={
          <Stack gap={2}>
            <Text weight="medium">Steps</Text>
            <Text size="sm" color="muted">
              1. Audience
            </Text>
            <Text size="sm" color="muted">
              2. Content
            </Text>
            <Text size="sm" color="muted">
              3. Schedule
            </Text>
          </Stack>
        }
        footer={
          <Inline gap={2} justify="end">
            <Button variant="outline" onPress={() => setCampaign(false)}>
              Cancel
            </Button>
            <Button
              onPress={() => {
                setCreated(title());
                setCampaign(false);
              }}
            >
              Create
            </Button>
          </Inline>
        }
      >
        <Field>
          <FieldLabel for="campaign-title">Title</FieldLabel>
          <Input
            id="campaign-title"
            value={title()}
            onInput={(event) => setTitle((event.target as HTMLInputElement).value)}
          />
        </Field>
      </Tearsheet>
    </Stack>
  );
}
