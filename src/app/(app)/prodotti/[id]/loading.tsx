import { Bone } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10" aria-busy="true" aria-label="Caricamento">
      <div className="bleed -mt-5 sm:-mt-7 lg:col-span-7 lg:mt-0">
        <Bone className="aspect-[4/5] rounded-none sm:aspect-[4/3] lg:rounded-[24px]" />
      </div>
      <div className="lg:col-span-5">
        <Bone className="h-3 w-24" />
        <Bone className="mt-3 h-10 w-56" />
        <Bone className="mt-2 h-4 w-28" />
        <Bone className="mt-6 h-28 w-full rounded-[20px]" />
        <Bone className="mt-4 h-14 w-full rounded-full" />
      </div>
    </div>
  );
}
