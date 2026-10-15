import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@barqjs/ui";

export default function TableSelected() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>INV001</TableCell>
          <TableCell>
            <Badge variant="secondary">Paid</Badge>
          </TableCell>
          <TableCell>$250.00</TableCell>
        </TableRow>
        <TableRow isSelected>
          <TableCell>INV002</TableCell>
          <TableCell>
            <Badge variant="destructive">Overdue</Badge>
          </TableCell>
          <TableCell>$150.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>INV003</TableCell>
          <TableCell>
            <Badge variant="outline">Draft</Badge>
          </TableCell>
          <TableCell>$90.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
