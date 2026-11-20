import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterD(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 8a4 4 0 010 8H9.412A.41.41 0 019 15.588V8.412A.41.41 0 019.412 8z" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
