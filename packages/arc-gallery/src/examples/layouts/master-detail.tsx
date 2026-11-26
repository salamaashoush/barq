import { createSignal } from "@barqjs/core";
import {
  Button,
  Grid,
  Inline,
  ListItem,
  MasterDetailList,
  RecordPager,
  Stack,
  Status,
  Text,
  toast,
} from "@barqjs/arc";
import type { Key } from "@barqjs/aria/collections";
import { layout, surface } from "@barqjs/arc/style";
import { layer } from "@barqjs/css";

const demo = layer("demo");
const list = demo({ maxHeight: "24rem" });
const viewer = demo(surface.card, layout.column, {
  padding: "1rem",
  gap: "0.75rem",
  minHeight: "16rem",
});

interface Shot {
  id: string;
  name: string;
  test: string;
  state: "changed" | "new" | "unchanged" | "approved";
  diff?: string;
}

const SHOTS: readonly Shot[] = [
  { id: "home", name: "Home page", test: "Landing renders", state: "changed", diff: "4.2%" },
  { id: "pricing", name: "Pricing", test: "Plans table", state: "changed", diff: "0.8%" },
  { id: "signup", name: "Sign up", test: "Form validation", state: "new" },
  { id: "cart", name: "Cart", test: "Checkout flow", state: "approved" },
  { id: "login", name: "Sign in", test: "Auth screens", state: "unchanged" },
  { id: "settings", name: "Settings", test: "Account page", state: "changed", diff: "12.5%" },
  { id: "invoice", name: "Invoice", test: "Billing print view", state: "new" },
];

const TONE = {
  changed: "warning",
  new: "info",
  unchanged: "neutral",
  approved: "success",
} as const;

export default function MasterDetail() {
  const [open, setOpen] = createSignal<Key>("home");
  const [picked, setPicked] = createSignal<Set<Key>>(new Set());
  function at(): number {
    return SHOTS.findIndex((one) => one.id === open());
  }
  function shot(): Shot {
    return SHOTS[at()] ?? (SHOTS[0] as Shot);
  }
  return (
    <Grid columns={{ base: 1, cqLg: 2 }} gap={4}>
      <Stack gap={2}>
        <Inline justify="between" align="center">
          <Text size="sm" color="muted">
            {picked().size === 0 ? "Tick screenshots to decide several" : `${picked().size} ticked`}
          </Text>
          <Button
            size="sm"
            variant="outline"
            isDisabled={picked().size === 0}
            onPress={() => {
              toast(`Approved ${picked().size}`);
              setPicked(new Set<Key>());
            }}
          >
            Approve ticked
          </Button>
        </Inline>
        <MasterDetailList
          class={list}
          aria-label="Screenshots"
          items={SHOTS}
          current={open()}
          onCurrentChange={setOpen}
          checkboxes
          checkedKeys={picked()}
          onCheckedChange={setPicked}
          isCheckable={(one) => one.state === "changed" || one.state === "new"}
        >
          {(one) => (
            <ListItem
              title={one.name}
              description={one.test}
              meta={one.diff}
              actions={<Status tone={TONE[one.state]}>{one.state}</Status>}
            />
          )}
        </MasterDetailList>
      </Stack>
      <section class={viewer} aria-label="Screenshot">
        <Inline justify="between" align="center">
          <Text weight="strong">{shot().name}</Text>
          <RecordPager
            position={at() + 1}
            count={SHOTS.length}
            onPrevious={at() > 0 ? () => setOpen(SHOTS[at() - 1]?.id ?? open()) : undefined}
            onNext={
              at() < SHOTS.length - 1 ? () => setOpen(SHOTS[at() + 1]?.id ?? open()) : undefined
            }
          />
        </Inline>
        <Text size="sm" color="muted">
          {shot().test}
          {shot().diff === undefined ? "" : `, ${shot().diff} of the pixels changed`}
        </Text>
        <Status tone={TONE[shot().state]}>{shot().state}</Status>
      </section>
    </Grid>
  );
}
