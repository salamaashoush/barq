import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterG(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12.5 12H15v2.268a.88.88 0 01-.263.65A4 4 0 1112 8h2.5" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
