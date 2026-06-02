import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function SectionCard({ title, description, actions, children, className, bodyClassName }: SectionCardProps) {
  return (
    <Card className={cn("flex flex-col min-w-0", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold leading-none">{title}</h3>}
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4 pt-2 flex-1 min-w-0", bodyClassName)}>{children}</div>
    </Card>
  );
}
