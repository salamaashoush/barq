import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function HouseArrowRight(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12.353 21H5a2 2 0 01-2-2v-9a2 2 0 01.709-1.528l7-6a2 2 0 012.582 0l7 6A2 2 0 0121 10v2.344" />
      <path d="M14.87 12.508A1 1 0 0014 12h-4a1 1 0 00-1 1v8" />
      <path d="m17.999 21 3-3h-6" />
      <path d="m20.999 18-3-3" />
    </svg>
  );
}
