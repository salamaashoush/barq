import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleFadingCheck(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 2a10 10 0 017.38 16.75" />
      <path d="m16 9-5.5 5.5L8 12" />
      <path d="M2.5 8.875a10 10 0 00-.5 3" />
      <path d="M2.83 16a10 10 0 002.43 3.4" />
      <path d="M4.636 5.235a10 10 0 01.891-.857" />
      <path d="M8.644 21.42a10 10 0 007.631-.38" />
    </svg>
  );
}
