import { createSignal } from "@barqjs/core";
import {
  Button,
  FormSheet,
  List,
  ListItem,
  Stack,
  setServerErrors,
  toast,
  useArcForm,
} from "@barqjs/arc";
import { Pencil } from "@barqjs/lucide/icons/pencil";

interface Customer {
  id: string;
  name: string;
  email: string;
  tier: string | null;
  notes: string;
}

const TIERS = [
  { value: "standard", label: "Standard" },
  { value: "priority", label: "Priority support" },
  { value: "enterprise", label: "Enterprise" },
];

const START: Customer[] = [
  {
    id: "c1",
    name: "Northwind Traders",
    email: "billing@northwind.example.com",
    tier: "priority",
    notes: "",
  },
  {
    id: "c2",
    name: "Globex",
    email: "accounts@globex.example.com",
    tier: "enterprise",
    notes: "Annual contract, renews in March.",
  },
];

export default function FormSheetExample() {
  const [customers, setCustomers] = createSignal(START);
  const [editing, setEditing] = createSignal<Customer | null>(null);
  const [loading, setLoading] = createSignal(false);

  const form = useArcForm(() => ({
    defaultValues: { name: "", email: "", tier: null as string | null, notes: "" },
    onSubmit: async ({ value, formApi }) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (value.email.endsWith("@example.org")) {
        setServerErrors(formApi, {
          fields: { email: "That domain belongs to another Acme customer" },
        });
        return;
      }
      const id = editing()?.id;
      setCustomers((all) => all.map((each) => (each.id === id ? { ...each, ...value } : each)));
      toast.success(`Saved ${value.name}`);
    },
  }));

  async function edit(customer: Customer) {
    setLoading(true);
    setEditing(customer);
    await new Promise((resolve) => setTimeout(resolve, 600));
    form.reset({
      name: customer.name,
      email: customer.email,
      tier: customer.tier,
      notes: customer.notes,
    });
    setLoading(false);
  }

  return (
    <Stack gap={3}>
      <List aria-label="Customers" items={customers()} getTextValue={(customer) => customer.name}>
        {(customer: Customer) => (
          <ListItem
            title={customer.name}
            description={customer.email}
            actions={
              <Button variant="outline" size="sm" onPress={() => void edit(customer)}>
                <Pencil aria-hidden="true" />
                Edit
              </Button>
            }
          />
        )}
      </List>
      <FormSheet
        form={form}
        heading={`Edit ${editing()?.name ?? "customer"}`}
        description="Try an @example.org address to see it refused."
        open={editing() !== null}
        loading={loading()}
        status="Changes apply to the next invoice"
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <form.FormError />
        <form.AppField
          name="name"
          validators={{
            onChange: ({ value }) => (value.trim() === "" ? "Enter a name" : undefined),
          }}
        >
          {(field) => <field.TextField label="Company name" />}
        </form.AppField>
        <form.AppField name="email">
          {(field) => <field.TextField label="Billing email" type="email" />}
        </form.AppField>
        <form.AppField name="tier">
          {(field) => <field.SelectField label="Support tier" options={TIERS} />}
        </form.AppField>
        <form.AppField name="notes">
          {(field) => <field.TextareaField label="Notes" rows={3} />}
        </form.AppField>
      </FormSheet>
    </Stack>
  );
}
