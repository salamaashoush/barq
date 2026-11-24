import { createSignal } from "@barqjs/core";
import {
  Bytes,
  Button,
  Currency,
  DescriptionList,
  FormattedNumber,
  Inline,
  Stack,
} from "@barqjs/arc";

export default function Numbers() {
  const [revenue, setRevenue] = createSignal(1_284_390.5);
  return (
    <Stack gap={4}>
      <DescriptionList
        columns={2}
        items={[
          { term: "Plain", details: <FormattedNumber value={revenue()} /> },
          {
            term: "Compact",
            details: <FormattedNumber value={revenue()} options={{ notation: "compact" }} />,
          },
          {
            term: "Percent",
            details: (
              <FormattedNumber
                value={0.4237}
                options={{ style: "percent", maximumFractionDigits: 1 }}
              />
            ),
          },
          {
            term: "Signed change",
            details: (
              <FormattedNumber
                value={-0.031}
                options={{ style: "percent", signDisplay: "exceptZero" }}
              />
            ),
          },
          {
            term: "Unit",
            details: (
              <FormattedNumber
                value={72.5}
                options={{ style: "unit", unit: "kilometer-per-hour" }}
              />
            ),
          },
          { term: "Currency", details: <Currency value={revenue()} currency="USD" /> },
          {
            term: "By code",
            details: <Currency value={revenue()} currency="EUR" display="code" />,
          },
          { term: "By name", details: <Currency value={42} currency="EGP" display="name" /> },
          { term: "Compact money", details: <Currency value={revenue()} currency="SAR" compact /> },
          { term: "Gain", details: <Currency value={18_400} currency="USD" sign="exceptZero" /> },
          {
            term: "Accounting loss",
            details: <Currency value={-2_150.75} currency="USD" accounting />,
          },
          { term: "Attachment", details: <Bytes value={348_160} /> },
          { term: "Export", details: <Bytes value={2_684_354_560} /> },
          { term: "Empty file", details: <Bytes value={0} /> },
        ]}
      />
      <Inline gap={2}>
        <Button variant="outline" size="sm" onPress={() => setRevenue(revenue() * 1.1)}>
          Add 10%
        </Button>
        <Button variant="ghost" size="sm" onPress={() => setRevenue(1_284_390.5)}>
          Reset
        </Button>
      </Inline>
    </Stack>
  );
}
