import { css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { CreditCard } from "@barqjs/lucide/icons/credit-card";
import { Info } from "@barqjs/lucide/icons/info";
import { Mail } from "@barqjs/lucide/icons/mail";
import { Search } from "@barqjs/lucide/icons/search";
import { Star } from "@barqjs/lucide/icons/star";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@barqjs/ui";

const frame = css`
  display: grid;
  width: 100%;
  max-width: 24rem;
  gap: calc(var(--spacing) * 6);
`;

export default function InputGroupIcon() {
  return (
    <div class={frame}>
      <InputGroup>
        <InputGroupInput aria-label="Search" placeholder="Search..." />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Email" type="email" placeholder="Enter your email" />
        <InputGroupAddon>
          <Mail />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Card number" placeholder="Card number" />
        <InputGroupAddon>
          <CreditCard />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          <Check />
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput aria-label="Saved card number" placeholder="Card number" />
        <InputGroupAddon align="inline-end">
          <Star />
          <Info />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
