import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function DollarSign(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 3v18" />
      <path d="M17 5H9.5a1 1 0 000 7h5a1 1 0 010 7H6" />
    </svg>
  );
}
