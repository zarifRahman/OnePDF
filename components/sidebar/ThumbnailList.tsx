"use client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useDocStore } from "@/store/document";
import { ThumbnailItem } from "./ThumbnailItem";

export function ThumbnailList({ docBytes }: { docBytes: Uint8Array | null }) {
  const { pages, reorder } = useDocStore();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = pages.findIndex((p) => p.id === active.id);
    const newI = pages.findIndex((p) => p.id === over.id);
    reorder(arrayMove(pages, oldI, newI));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3 p-3">
          {pages.map((p, i) => (
            <ThumbnailItem key={p.id} page={p} pageNumber={i + 1} docBytes={docBytes} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
