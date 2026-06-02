import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground truncate">{title}</h2>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
