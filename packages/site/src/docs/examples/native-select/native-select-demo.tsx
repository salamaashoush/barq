import { NativeSelect, NativeSelectOption } from "@barqjs/ui";

export default function NativeSelectDemo() {
  return (
    <NativeSelect aria-label="Status">
      <NativeSelectOption value="">Select status</NativeSelectOption>
      <NativeSelectOption value="todo">Todo</NativeSelectOption>
      <NativeSelectOption value="in-progress">In Progress</NativeSelectOption>
      <NativeSelectOption value="done">Done</NativeSelectOption>
      <NativeSelectOption value="cancelled">Cancelled</NativeSelectOption>
    </NativeSelect>
  );
}
