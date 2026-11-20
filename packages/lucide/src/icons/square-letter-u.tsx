import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterU(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 8v5a3 3 0 1 1-6 0V8" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
