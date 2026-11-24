import { For, createSignal } from "@barqjs/core";
import { Badge, Grid, IconButton, Image, Stack, Text, Tile, toast } from "@barqjs/arc";
import { Star } from "@barqjs/lucide/icons/star";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$0",
    line: "For a side project. One workspace, three seats.",
  },
  { id: "team", name: "Team", price: "$12", line: "Per seat a month. Unlimited projects and SSO." },
  {
    id: "business",
    name: "Business",
    price: "$29",
    line: "Per seat a month. Audit logs and a 99.99% SLA.",
  },
];

export default function TileExample() {
  const [plan, setPlan] = createSignal("team");
  const [starred, setStarred] = createSignal(false);

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          A link, a button, media at the top and at the start
        </Text>
        <Grid minItemWidth="16rem" gap={4}>
          <Tile
            href="#tiles"
            eyebrow="Guide"
            title="Set up single sign-on"
            description="Connect Acme to your identity provider in four steps."
            media={<Image src="/media/aurora.svg" alt="" aspectRatio={16 / 9} />}
            footer={
              <Text size="xs" color="muted">
                6 minute read
              </Text>
            }
          />
          <Tile
            onPress={() => toast("Opening the billing report")}
            eyebrow={<Badge variant="secondary">Report</Badge>}
            title="Billing, November"
            description="Revenue, refunds and failed payments by region."
            actions={
              <IconButton
                label={starred() ? "Unstar" : "Star"}
                size="sm"
                isPressed={starred()}
                onPress={() => setStarred(!starred())}
              >
                <Star />
              </IconButton>
            }
          />
          <Tile
            mediaPosition="start"
            media={<Image src="/media/dunes.svg" alt="" aspectRatio={1} />}
            title="Brand assets"
            description="Logos and colours for Acme partners."
          />
          <Tile title="Legacy exports" description="Retired in October." isDisabled href="#tiles" />
        </Grid>
      </Stack>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Selectable, one plan at a time
        </Text>
        <Grid minItemWidth="12rem" gap={4}>
          <For each={PLANS}>
            {(each) => (
              <Tile
                eyebrow={each.price}
                title={each.name}
                description={each.line}
                selected={plan() === each.id}
                onSelectedChange={(on) => {
                  if (on) setPlan(each.id);
                }}
              />
            )}
          </For>
        </Grid>
      </Stack>
    </Stack>
  );
}
