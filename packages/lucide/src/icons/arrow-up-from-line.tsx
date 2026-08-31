import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowUpFromLine(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m18 9-6-6-6 6" />
      <path d="M12 3v14" />
      <path d="M5 21h14" />
    </svg>
  );
}
