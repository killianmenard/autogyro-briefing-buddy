import { cn } from "@/lib/utils";

type Level = "green" | "yellow" | "orange" | "red";

const colors: Record<Level, string> = {
  green: "bg-[oklch(0.72_0.17_145)]",
  yellow: "bg-[oklch(0.85_0.15_95)]",
  orange: "bg-[oklch(0.75_0.17_55)]",
  red: "bg-[oklch(0.62_0.22_27)]",
};

export function ReliabilityBadge({ level, label }: { level: Level; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", colors[level])} />
      <span>{label}</span>
    </div>
  );
}
