import { createSignal } from "@barqjs/core";
import { Inline, Label, Stack, Switch, ToggleGroup, ToggleGroupItem } from "@barqjs/arc";
import { CodeDiff, type CodeDiffLayout } from "@barqjs/arc/code";

const BEFORE = `export const plans = {
  starter: { seats: 5, price: 0 },
  team: { seats: 25, price: 49 },
  business: { seats: 50, price: 99 },
};

export function priceFor(plan: keyof typeof plans, seats: number): number {
  const { price } = plans[plan];
  return price * seats;
}

export function trialDays(): number {
  return 30;
}

export const currency = "USD";
`;

const AFTER = `export const plans = {
  starter: { seats: 5, price: 0 },
  team: { seats: 25, price: 59 },
  business: { seats: 50, price: 119, sso: true },
};

export function priceFor(plan: keyof typeof plans, seats: number): number {
  const { price } = plans[plan];
  return price * seats;
}

export function trialDays(): number {
  return 14;
}

export const currency = "USD";
`;

export default function CodeDiffExample() {
  const [layout, setLayout] = createSignal<CodeDiffLayout>("split");
  const [collapse, setCollapse] = createSignal(true);
  const [editable, setEditable] = createSignal(false);
  const [modified, setModified] = createSignal(AFTER);

  return (
    <Stack gap={3}>
      <Inline gap={4} align="center" wrap>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Layout"
          value={layout()}
          onValueChange={(value: string | string[]) => {
            if (value === "split" || value === "unified") setLayout(value);
          }}
        >
          <ToggleGroupItem value="split">Split</ToggleGroupItem>
          <ToggleGroupItem value="unified">Unified</ToggleGroupItem>
        </ToggleGroup>
        <Inline gap={2} align="center">
          <Switch id="diff-collapse" checked={collapse()} onCheckedChange={setCollapse} />
          <Label for="diff-collapse">Fold unchanged lines</Label>
        </Inline>
        <Inline gap={2} align="center">
          <Switch id="diff-edit" checked={editable()} onCheckedChange={setEditable} />
          <Label for="diff-edit">Edit the new version</Label>
        </Inline>
      </Inline>
      <CodeDiff
        original={BEFORE}
        modified={modified()}
        onChange={setModified}
        language="typescript"
        layout={layout()}
        collapseUnchanged={collapse() ? { margin: 1, minSize: 3 } : false}
        readOnly={!editable()}
        originalLabel="plans.ts on main"
        modifiedLabel="plans.ts in this change"
        maxHeight={420}
      />
    </Stack>
  );
}
