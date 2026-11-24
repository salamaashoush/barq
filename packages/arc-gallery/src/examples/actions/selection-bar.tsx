import { For, Show, createSignal } from "@barqjs/core";
import { Checkbox, Field, FieldLabel, SelectionBar, Stack, Text, toast } from "@barqjs/arc";
import { Archive } from "@barqjs/lucide/icons/archive";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";

interface Invoice {
  id: string;
  customer: string;
}

const INVOICES: Invoice[] = [
  { id: "1042", customer: "Acme Logistics" },
  { id: "1043", customer: "Northwind Traders" },
  { id: "1044", customer: "Example Labs" },
  { id: "1045", customer: "Globex" },
];

export default function SelectionBars() {
  const [invoices, setInvoices] = createSignal(INVOICES);
  const [chosen, setChosen] = createSignal<ReadonlySet<string>>(new Set(["1043"]));
  function rows(): Invoice[] {
    return invoices().filter((one) => chosen().has(one.id));
  }
  function toggle(id: string, on: boolean): void {
    const next = new Set(chosen());
    if (on) next.add(id);
    else next.delete(id);
    setChosen(next);
  }
  function remove(gone: readonly Invoice[]): void {
    const ids = new Set(gone.map((one) => one.id));
    setInvoices(invoices().filter((one) => !ids.has(one.id)));
  }
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <For each={invoices()}>
          {(invoice) => (
            <Field orientation="horizontal">
              <Checkbox
                id={`invoice-${invoice.id}`}
                checked={chosen().has(invoice.id)}
                onCheckedChange={(on: boolean) => toggle(invoice.id, on)}
              />
              <FieldLabel for={`invoice-${invoice.id}`}>
                #{invoice.id} {invoice.customer}
              </FieldLabel>
            </Field>
          )}
        </For>
        <Show when={invoices().length === 0}>
          <Text color="muted">Every invoice is gone. Reload the page to bring them back.</Text>
        </Show>
      </Stack>
      <Show when={chosen().size > 0}>
        <SelectionBar
          count={chosen().size}
          rows={rows()}
          onClear={() => setChosen(new Set<string>())}
          actions={[
            {
              label: "Archive",
              icon: <Archive />,
              onAction: async (picked) => {
                await new Promise((resolve) => setTimeout(resolve, 800));
                toast(`Archived ${String(picked.length)} invoice${picked.length === 1 ? "" : "s"}`);
                remove(picked);
              },
            },
            {
              label: "Delete",
              icon: <Trash2 />,
              tone: "danger",
              confirm: (picked) => ({
                title: `Delete ${String(picked.length)} invoice${picked.length === 1 ? "" : "s"}?`,
                description: "Deleted invoices cannot be recovered.",
                tone: "danger",
                confirmLabel: "Delete",
              }),
              onAction: (picked) => remove(picked),
            },
          ]}
        />
      </Show>
    </Stack>
  );
}
