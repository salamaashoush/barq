import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CreditCardX(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12.5 19H4a2 2 0 01-2-2V7a2 2 0 012-2h16a2 2 0 012 2v3.5" />
      <path d="m16.5 14.5 5 5" />
      <path d="M2 10h20" />
      <path d="m21.5 14.5-5 5" />
    </svg>
  );
}
