import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Repeat2(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="m2 9 3-3 3 3" />
      <path d="M13 18H7a2 2 0 0 1-2-2V6" />
      <path d="m22 15-3 3-3-3" />
      <path d="M11 6h6a2 2 0 0 1 2 2v10" />
    </svg>
  );
}
