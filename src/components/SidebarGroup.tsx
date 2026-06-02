import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  badge?: ReactNode;
}

interface SidebarNavGroupProps {
  id: string;
  label: string;
  items: NavItem[];
  collapsedSidebar?: boolean;
  onNavigate?: () => void;
}

export function SidebarNavGroup({ id, label, items, collapsedSidebar, onNavigate }: SidebarNavGroupProps) {
  const loc = useLocation();
  const groupActive = items.some((it) => (it.exact ? loc.pathname === it.to : loc.pathname.startsWith(it.to)));
  const storageKey = `sidebar:group:${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(storageKey);
    if (v === null) return groupActive || true;
    return v === "1";
  });
  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, open ? "1" : "0");
  }, [open, storageKey]);

  if (collapsedSidebar) {
    return (
      <div className="px-1.5 py-1 space-y-0.5">
        {items.map((it) => {
          const active = it.exact ? loc.pathname === it.to : loc.pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              title={it.label}
              className={cn(
                "flex items-center justify-center h-9 w-9 mx-auto rounded-md",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60"
              )}
            >
              <it.icon className="size-4" />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="px-2">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/55 hover:text-sidebar-foreground/80">
        <span>{label}</span>
        <ChevronDown className={cn("size-3 transition-transform", !open && "-rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0.5 pb-1">
        {items.map((it) => {
          const active = it.exact ? loc.pathname === it.to : loc.pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60"
              )}
            >
              <it.icon className="size-4 shrink-0" />
              <span className="truncate flex-1">{it.label}</span>
              {it.badge}
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
