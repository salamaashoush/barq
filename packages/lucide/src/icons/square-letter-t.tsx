import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterT(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 16V8" />
      <path d="M9 8h6" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
