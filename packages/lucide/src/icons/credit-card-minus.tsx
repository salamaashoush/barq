import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CreditCardMinus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M22 13V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h8.536" />
      <path d="M22 10H2" />
      <path d="M6 14h2" />
      <path d="M16 17h6" />
    </svg>
  );
}
