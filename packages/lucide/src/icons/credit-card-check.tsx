import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CreditCardCheck(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12.5 19H4a2 2 0 01-2-2V7a2 2 0 012-2h16a2 2 0 012 2v4" />
      <path d="m16 17 2 2 4-4" />
      <path d="M2 10h20" />
    </svg>
  );
}
