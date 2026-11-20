import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterZ(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 8h5.501a.5.5 0 0 1 .37.836L9.13 15.164A.5.5 0 0 0 9.5 16H15" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
