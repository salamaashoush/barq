import { DirectionProvider, ToggleGroup, ToggleGroupItem } from "@barqjs/ui";

export default function ToggleGroupRtl() {
  return (
    <DirectionProvider dir="rtl">
      <div dir="rtl">
        <ToggleGroup variant="outline" type="single" defaultValue="list" aria-label="العرض">
          <ToggleGroupItem value="list" aria-label="قائمة">
            قائمة
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label="شبكة">
            شبكة
          </ToggleGroupItem>
          <ToggleGroupItem value="cards" aria-label="بطاقات">
            بطاقات
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </DirectionProvider>
  );
}
