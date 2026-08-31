import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowDownToLine(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 17V3" />
      <path d="m6 11 6 6 6-6" />
      <path d="M19 21H5" />
    </svg>
  );
}
