import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@barqjs/ui";

const narrow = css`
  width: 100px;
`;

const medium = css`
  font-weight: 500;
`;

const end = css`
  text-align: end;
`;

interface Invoice {
  readonly invoice: string;
  readonly paymentStatus: string;
  readonly totalAmount: string;
  readonly paymentMethod: string;
}

const invoices: readonly Invoice[] = [
  {
    invoice: "INV001",
    paymentStatus: "Paid",
    totalAmount: "$250.00",
    paymentMethod: "Credit Card",
  },
  {
    invoice: "INV002",
    paymentStatus: "Pending",
    totalAmount: "$150.00",
    paymentMethod: "Digital Wallet",
  },
  {
    invoice: "INV003",
    paymentStatus: "Unpaid",
    totalAmount: "$350.00",
    paymentMethod: "Bank Transfer",
  },
  {
    invoice: "INV004",
    paymentStatus: "Paid",
    totalAmount: "$450.00",
    paymentMethod: "Credit Card",
  },
  {
    invoice: "INV005",
    paymentStatus: "Paid",
    totalAmount: "$550.00",
    paymentMethod: "Digital Wallet",
  },
  {
    invoice: "INV006",
    paymentStatus: "Pending",
    totalAmount: "$200.00",
    paymentMethod: "Bank Transfer",
  },
  {
    invoice: "INV007",
    paymentStatus: "Unpaid",
    totalAmount: "$300.00",
    paymentMethod: "Credit Card",
  },
];

export default function TableDemo() {
  return (
    <Table>
      <TableCaption>A list of your recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead class={narrow}>Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead class={end}>Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <For each={() => invoices}>
          {(invoice: Invoice) => (
            <TableRow>
              <TableCell class={medium}>{invoice.invoice}</TableCell>
              <TableCell>{invoice.paymentStatus}</TableCell>
              <TableCell>{invoice.paymentMethod}</TableCell>
              <TableCell class={end}>{invoice.totalAmount}</TableCell>
            </TableRow>
          )}
        </For>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell class={end}>$2,250.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
