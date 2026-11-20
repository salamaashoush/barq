import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterG(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12.5 12H15v2.268a.88.88 0 01-.263.65A4 4 0 1112 8h2.5" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
