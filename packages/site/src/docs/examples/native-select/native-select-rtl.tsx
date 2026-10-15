import { DirectionProvider, NativeSelect, NativeSelectOption } from "@barqjs/ui";

export default function NativeSelectRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <NativeSelect aria-label="الحالة">
          <NativeSelectOption value="">اختر الحالة</NativeSelectOption>
          <NativeSelectOption value="todo">مهام</NativeSelectOption>
          <NativeSelectOption value="in-progress">قيد التنفيذ</NativeSelectOption>
          <NativeSelectOption value="done">منجز</NativeSelectOption>
          <NativeSelectOption value="cancelled">ملغي</NativeSelectOption>
        </NativeSelect>
      </div>
    </DirectionProvider>
  );
}
