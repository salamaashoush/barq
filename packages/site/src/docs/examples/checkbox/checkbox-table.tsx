import { createSignal, For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barqjs/ui";

const narrow = css`
  width: calc(var(--spacing) * 8);
`;

const strong = css`
  font-weight: 500;
`;

interface Member {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

const tableData: readonly Member[] = [
  { id: "1", name: "Salama Ashoush", email: "salama@example.com", role: "Admin" },
  { id: "2", name: "Sam Rivers", email: "sam.rivers@example.com", role: "User" },
  { id: "3", name: "Robin Hale", email: "robin.hale@example.com", role: "User" },
  { id: "4", name: "Casey Reed", email: "casey.reed@example.com", role: "Editor" },
];

export default function CheckboxTable() {
  const [selectedRows, setSelectedRows] = createSignal<ReadonlySet<string>>(new Set(["1"]));

  const selectAll = (): boolean => selectedRows().size === tableData.length;

  const handleSelectAll = (checked: boolean): void => {
    setSelectedRows(checked ? new Set(tableData.map((row) => row.id)) : new Set<string>());
  };

  const handleSelectRow = (id: string, checked: boolean): void => {
    const next = new Set(selectedRows());
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedRows(next);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class={narrow}>
            <Checkbox
              id="checkbox-table-select-all"
              name="checkbox-table-select-all"
              aria-label="Select all rows"
              checked={selectAll()}
              onCheckedChange={handleSelectAll}
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <For each={() => tableData}>
          {(row: Member) => (
            <TableRow isSelected={selectedRows().has(row.id)}>
              <TableCell>
                <Checkbox
                  id={`checkbox-table-row-${row.id}`}
                  name={`checkbox-table-row-${row.id}`}
                  aria-label={`Select ${row.name}`}
                  checked={selectedRows().has(row.id)}
                  onCheckedChange={(checked: boolean) => handleSelectRow(row.id, checked)}
                />
              </TableCell>
              <TableCell class={strong}>{row.name}</TableCell>
              <TableCell>{row.email}</TableCell>
              <TableCell>{row.role}</TableCell>
            </TableRow>
          )}
        </For>
      </TableBody>
    </Table>
  );
}
