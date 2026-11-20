import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareLetterD(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 8a4 4 0 010 8H9.412A.41.41 0 019 15.588V8.412A.41.41 0 019.412 8z" />
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}
