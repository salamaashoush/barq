import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import {
  DirectionProvider,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@barqjs/ui";

const frame = css`
  width: 100%;
`;

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
    paymentStatus: "مدفوع",
    totalAmount: "$250.00",
    paymentMethod: "بطاقة ائتمانية",
  },
  {
    invoice: "INV002",
    paymentStatus: "قيد الانتظار",
    totalAmount: "$150.00",
    paymentMethod: "محفظة رقمية",
  },
  {
    invoice: "INV003",
    paymentStatus: "غير مدفوع",
    totalAmount: "$350.00",
    paymentMethod: "تحويل بنكي",
  },
  {
    invoice: "INV004",
    paymentStatus: "مدفوع",
    totalAmount: "$450.00",
    paymentMethod: "بطاقة ائتمانية",
  },
  {
    invoice: "INV005",
    paymentStatus: "مدفوع",
    totalAmount: "$550.00",
    paymentMethod: "محفظة رقمية",
  },
  {
    invoice: "INV006",
    paymentStatus: "قيد الانتظار",
    totalAmount: "$200.00",
    paymentMethod: "تحويل بنكي",
  },
  {
    invoice: "INV007",
    paymentStatus: "غير مدفوع",
    totalAmount: "$300.00",
    paymentMethod: "بطاقة ائتمانية",
  },
];

export default function TableRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl" class={frame}>
        <Table>
          <TableCaption>قائمة بفواتيرك الأخيرة.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead class={narrow}>الفاتورة</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الطريقة</TableHead>
              <TableHead class={end}>المبلغ</TableHead>
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
              <TableCell colSpan={3}>المجموع</TableCell>
              <TableCell class={end}>$2,250.00</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </DirectionProvider>
  );
}
