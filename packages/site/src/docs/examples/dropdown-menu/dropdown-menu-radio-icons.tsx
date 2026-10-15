import { createSignal } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Building2 } from "@barqjs/lucide/icons/building-2";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { Wallet } from "@barqjs/lucide/icons/wallet";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@barqjs/ui";

const menu = css`
  min-width: calc(var(--spacing) * 56);
`;

export default function DropdownMenuRadioIcons() {
  const [paymentMethod, setPaymentMethod] = createSignal("card");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="outline">Payment Method</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent class={menu}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Select Payment Method</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={paymentMethod()} onValueChange={setPaymentMethod}>
            <DropdownMenuRadioItem value="card">
              <CreditCard />
              Credit Card
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="wallet">
              <Wallet />
              Digital Wallet
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="bank">
              <Building2 />
              Bank Transfer
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
