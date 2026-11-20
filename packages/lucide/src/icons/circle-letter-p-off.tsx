import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterPOff(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 12h1a2 2 0 000-4H9.5a.5.5 0 00-.5.5V9" />
      <path d="M15.652 21.31A10 10 0 012.691 8.348" />
      <path d="M22 22 2 2" />
      <path d="M4.929 4.929a10 10 0 0116.729 4.483 10 10 0 01-2.588 9.658" />
      <path d="M9 14.657V16" />
    </svg>
  );
}
