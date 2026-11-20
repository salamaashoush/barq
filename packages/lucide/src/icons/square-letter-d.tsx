import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterD(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 8a4 4 0 010 8H9.412A.41.41 0 019 15.588V8.412A.41.41 0 019.412 8z" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
