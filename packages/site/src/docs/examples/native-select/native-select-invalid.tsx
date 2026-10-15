import { NativeSelect, NativeSelectOption } from "@barqjs/ui";

export default function NativeSelectInvalid() {
  return (
    <NativeSelect aria-invalid="true" aria-label="Fruit">
      <NativeSelectOption value="">Error state</NativeSelectOption>
      <NativeSelectOption value="apple">Apple</NativeSelectOption>
      <NativeSelectOption value="banana">Banana</NativeSelectOption>
      <NativeSelectOption value="blueberry">Blueberry</NativeSelectOption>
    </NativeSelect>
  );
}
