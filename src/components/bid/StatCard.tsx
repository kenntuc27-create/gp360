import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  highlight?: boolean;
  hint?: string;
  icon?: LucideIcon;
  tone?: "primary" | "emerald" | "amber";
}

export function StatCard({ label, value, highlight, hint, icon: Icon, tone }: StatCardProps) {
  const isNegative = /-/.test(value) && /\d/.test(value);
  
  const tones: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    primary: "bg-primary/10 text-primary border-primary/20",
  };

  const valueColor = isNegative
    ? "text-red-600 dark:text-red-400"
    : highlight ? "text-emerald-600 dark:text-emerald-400" : "";
    
  const cardCls = tone ? tones[tone] : highlight ? "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20" : "";

  return (
    <Card className={cardCls}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground mb-1 tracking-wider">
          {Icon && <Icon className="size-3" />} {label}
        </div>
        <div className={`text-lg font-bold tabular-nums ${valueColor}`} title={hint}>{value}</div>
      </CardContent>
    </Card>
  );
}
