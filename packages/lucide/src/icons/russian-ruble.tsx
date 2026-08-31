import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function RussianRuble(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 11h8a4 4 0 0 0 0-8H9v18" />
      <path d="M6 15h8" />
    </svg>
  );
}
