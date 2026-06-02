import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "destructive" | "primary";

const toneClasses: Record<Tone, { icon: string; value: string }> = {
  default: { icon: "bg-muted text-muted-foreground", value: "text-foreground" },
  primary: { icon: "bg-primary/10 text-primary", value: "text-foreground" },
  success: { icon: "bg-success/10 text-success", value: "text-success" },
  warning: { icon: "bg-warning/15 text-warning-foreground", value: "text-warning-foreground" },
  destructive: { icon: "bg-destructive/10 text-destructive", value: "text-destructive" },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  hint?: ReactNode;
  className?: string;
}) {
  const t = toneClasses[tone];
  return (
    <Card className={cn("border-border/70 hover:shadow-[var(--shadow-elevated)] transition-shadow", className)}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-bold mt-1.5 leading-tight", t.value)}>{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          {Icon && (
            <div className={cn("size-10 rounded-lg flex items-center justify-center shrink-0", t.icon)}>
              <Icon className="size-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
