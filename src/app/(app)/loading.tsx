import { ListSkeleton, Bone } from "@/components/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Caricamento">
      <Bone className="h-3 w-32" />
      <Bone className="mt-3 h-10 w-64 max-w-full" />
      <Bone className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8">
        <ListSkeleton />
      </div>
    </div>
  );
}
