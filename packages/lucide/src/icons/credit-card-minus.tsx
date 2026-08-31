import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CreditCardMinus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M16 17h6" />
      <path d="M22 10H2" />
      <path d="M22 13V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h8.536" />
    </svg>
  );
}
