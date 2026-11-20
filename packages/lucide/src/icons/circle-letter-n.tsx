import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterN(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 16V8.576a.496.496 0 01.937-.243l4.126 7.43A.496.496 0 0015 15.52V8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
