import { createSignal } from "@barqjs/core";
import {
  CollectionField,
  type DataTableColumn,
  Grid,
  Input,
  RepeaterField,
  Stack,
  Text,
  useArcForm,
} from "@barqjs/arc";

interface Header {
  key: string;
  value: string;
}

interface Fee {
  name: string;
  amount: number;
  due: string;
}

const FEE_COLUMNS: DataTableColumn<Fee>[] = [
  { id: "name", header: "Fee", accessorKey: "name" },
  { id: "due", header: "Due", accessorKey: "due", hideBelow: "sm" },
  {
    id: "amount",
    header: "Amount",
    accessorKey: "amount",
    align: "end",
    cell: (info) => `$${String(info.getValue<number>())}`,
  },
];

interface RequestValues {
  headers: Header[];
  fees: Fee[];
}

export default function Repeaters() {
  const [options, setOptions] = createSignal<readonly string[]>(["Yes", "No"]);
  const defaults: RequestValues = {
    headers: [
      { key: "Accept", value: "application/json" },
      { key: "Authorization", value: "Bearer {{API_TOKEN}}" },
    ],
    fees: [
      { name: "Tuition", amount: 4200, due: "September" },
      { name: "Books", amount: 180, due: "October" },
    ],
  };
  const form = useArcForm(() => ({ defaultValues: defaults }));
  const values = form.useSelector((state) => state.values);
  return (
    <form.AppForm>
      <Stack gap={8}>
        <form.AppField name="headers" mode="array">
          {(field) => (
            <field.RepeaterField
              label="Request headers"
              reorderable
              max={8}
              newRow={() => ({ key: "", value: "" })}
              rowLabel={(row: Header, index: number) => row.key || `Header ${String(index + 1)}`}
              addLabel="Add header"
            >
              {(row) => (
                <>
                  <form.AppField name={row.name("key") as `headers[${number}].key`}>
                    {(cell) => <cell.TextField label="Name" />}
                  </form.AppField>
                  <form.AppField name={row.name("value") as `headers[${number}].value`}>
                    {(cell) => <cell.TextField label="Value" />}
                  </form.AppField>
                </>
              )}
            </field.RepeaterField>
          )}
        </form.AppField>
        <Grid columns={{ base: 1, md: 2 }} gap={6}>
          <RepeaterField<string>
            label="Answer options"
            min={2}
            max={5}
            newRow={() => ""}
            value={options()}
            onChange={setOptions}
            addLabel="Add option"
          >
            {(row) => (
              <Input
                aria-label={`Option ${String(row.index + 1)}`}
                value={row.value()}
                onInput={(event: Event) =>
                  row.update((event.currentTarget as HTMLInputElement).value)
                }
              />
            )}
          </RepeaterField>
          <RepeaterField<string>
            label="Contacts"
            newRow={() => ""}
            emptyLabel="No contacts yet."
            addLabel="Add contact"
          >
            {(row) => <span>{`Contact ${String(row.index + 1)}`}</span>}
          </RepeaterField>
        </Grid>
        <form.AppField name="fees">
          {() => (
            <CollectionField<Fee>
              label="Fees"
              description="Each fee opens in a sheet of its own."
              columns={FEE_COLUMNS}
              newRecord={() => ({ name: "", amount: 0, due: "" })}
              recordLabel={(fee: Fee) => fee.name || "New fee"}
              card={{
                title: (fee) => fee.name,
                fact: (fee) => `$${String(fee.amount)} · ${fee.due}`,
              }}
              editor={(sheet) => (
                <>
                  <sheet.AppField name="name">
                    {(cell) => <cell.TextField label="Fee" />}
                  </sheet.AppField>
                  <sheet.AppField name="amount">
                    {(cell) => <cell.CurrencyField label="Amount" currency="USD" minValue={0} />}
                  </sheet.AppField>
                  <sheet.AppField name="due">
                    {(cell) => <cell.TextField label="Due" />}
                  </sheet.AppField>
                </>
              )}
            />
          )}
        </form.AppField>
        <Text size="xs" color="muted">
          {`${String(values().headers.length)} headers, ${String(values().fees.length)} fees; options ${options().join(", ")}`}
        </Text>
      </Stack>
    </form.AppForm>
  );
}
