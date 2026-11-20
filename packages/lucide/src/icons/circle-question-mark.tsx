import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleQuestionMark(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9.5a3 2.5 0 016 0c0 2-2 2-3 3.5" />
      <path d="M12 17h.01" />
    </svg>
  );
}
