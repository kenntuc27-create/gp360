import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface KpiTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "success" | "warning" | "destructive" | "muted";
  className?: string;
  onClick?: () => void;
}


const toneMap: Record<NonNullable<KpiTileProps["tone"]>, string> = {
  default: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

export function KpiTile({ label, value, hint, icon, tone = "default", className, onClick }: KpiTileProps) {
  return (
    <Card 
      className={cn(
        "p-3 flex flex-col gap-1 min-w-0", 
        onClick && "cursor-pointer hover:bg-muted/50 transition-colors",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
        {icon ? <div className="text-muted-foreground shrink-0">{icon}</div> : null}
      </div>
      <p className={cn("text-lg sm:text-xl font-semibold leading-tight tabular-nums break-words", toneMap[tone])}>{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground truncate">{hint}</p> : null}
    </Card>
  );
}

