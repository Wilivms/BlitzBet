import { pocketColour } from "@/lib/games";

export function Pocket({ n, size = "lg" }: { n: number; size?: "lg" | "sm" }) {
  const c = pocketColour(n);
  const bg = c === "green" ? "bg-emerald-600" : c === "red" ? "bg-rose-700" : "bg-neutral-900";
  const dim = size === "lg" ? "h-20 w-20 text-3xl" : "h-8 w-8 text-sm";
  return (
    <span
      className={`${bg} ${dim} inline-flex items-center justify-center rounded-full font-bold ring-2 ring-white/20`}
    >
      {n}
    </span>
  );
}
