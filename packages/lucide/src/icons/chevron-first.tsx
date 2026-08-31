import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ChevronFirst(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m17 18-6-6 6-6" />
      <path d="M7 6v12" />
    </svg>
  );
}
