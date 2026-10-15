import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barqjs/ui";

const medium = css`
  font-weight: 500;
`;

const end = css`
  text-align: end;
`;

const compact = css`
  width: calc(var(--spacing) * 8);
  height: calc(var(--spacing) * 8);
`;

interface Product {
  readonly name: string;
  readonly price: string;
}

const products: readonly Product[] = [
  { name: "Wireless Mouse", price: "$29.99" },
  { name: "Mechanical Keyboard", price: "$129.99" },
  { name: "USB-C Hub", price: "$49.99" },
];

export default function TableActions() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Price</TableHead>
          <TableHead class={end}>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <For each={() => products}>
          {(product: Product) => (
            <TableRow>
              <TableCell class={medium}>{product.name}</TableCell>
              <TableCell>{product.price}</TableCell>
              <TableCell class={end}>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <Button
                      variant="ghost"
                      size="icon"
                      class={compact}
                      aria-label={`Open menu for ${product.name}`}
                    >
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem>Duplicate</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )}
        </For>
      </TableBody>
    </Table>
  );
}
