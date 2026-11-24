import { createSignal } from "@barqjs/core";
import {
  Badge,
  CopyButton,
  Currency,
  DescriptionList,
  FormattedDate,
  Grid,
  IconButton,
  Stack,
  Status,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from "@barqjs/arc";
import { Pencil } from "@barqjs/lucide/icons/pencil";

type Layout = "auto" | "inline" | "stacked";

export default function DescriptionListExample() {
  const [layout, setLayout] = createSignal<Layout>("auto");

  return (
    <Stack gap={4}>
      <ToggleGroup
        aria-label="Layout"
        variant="outline"
        size="sm"
        value={layout()}
        onChange={(value) => {
          const next = value[0];
          if (next === "auto" || next === "inline" || next === "stacked") setLayout(next);
        }}
      >
        <ToggleGroupItem value="auto">Auto</ToggleGroupItem>
        <ToggleGroupItem value="inline">Inline</ToggleGroupItem>
        <ToggleGroupItem value="stacked">Stacked</ToggleGroupItem>
      </ToggleGroup>
      <Grid columns={{ base: 1, cqLg: 2 }} gap={8}>
        <DescriptionList
          aria-label="Subscription"
          layout={layout()}
          items={[
            { term: "Customer", details: "Northwind Traders" },
            { term: "Plan", details: <Badge variant="secondary">Business, annual</Badge> },
            { term: "Status", details: <Status tone="success">Active</Status> },
            {
              term: "Account ID",
              details: (
                <Text as="span" mono>
                  acct_8f2k19
                </Text>
              ),
              action: <CopyButton value="acct_8f2k19" label="Copy account ID" />,
            },
            {
              term: "Billing email",
              details: "billing@northwind.example.com",
              action: (
                <IconButton label="Edit billing email" size="sm">
                  <Pencil />
                </IconButton>
              ),
            },
          ]}
        />
        <Stack gap={2}>
          <Text size="sm" weight="medium">
            Two columns, values at the end, no rules
          </Text>
          <DescriptionList
            aria-label="Invoice INV-1042"
            layout={layout()}
            columns={2}
            divided={false}
            align="end"
            items={[
              { term: "Subtotal", details: <Currency value={4200} currency="USD" /> },
              { term: "Tax", details: <Currency value={588} currency="USD" /> },
              { term: "Issued", details: <FormattedDate value="2026-11-02" timeZone="UTC" /> },
              { term: "Due", details: <FormattedDate value="2026-12-02" timeZone="UTC" /> },
            ]}
          />
        </Stack>
      </Grid>
    </Stack>
  );
}
