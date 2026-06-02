import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { FileSpreadsheet, FileDown, Eye, Plus, Save, RefreshCw, Rocket, X, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  primary?: boolean;
  hidden?: boolean;
}

/**
 * Three-in-one quick actions UI:
 * - Sticky top bar (desktop) right under app header
 * - Fixed bottom bar (mobile) for thumb-friendly access
 * - Floating Action Button (FAB) with full menu
 */
export function QuickActionsBar({
  actions,
  extraInfo,
}: {
  actions: QuickAction[];
  extraInfo?: ReactNode;
}) {
  const [fabOpen, setFabOpen] = useState(false);
  const visible = actions.filter((a) => !a.hidden);
  const primary = visible.filter((a) => a.primary);
  const mobileTop = primary.length > 0 ? primary.slice(0, 3) : visible.slice(0, 3);

  // Desktop: mostra as primárias + até 4 secundárias; o resto vai para "Mais"
  const desktopMaxInline = 6;
  const desktopInline = visible.slice(0, desktopMaxInline);
  const desktopOverflow = visible.slice(desktopMaxInline);

  return (
    <>
      {/* DESKTOP — sticky bar under header */}
      <div className="hidden md:flex sticky top-0 z-20 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 px-4 sm:px-6 py-1.5 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border items-center justify-between gap-3 mb-3 shadow-sm">
        <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-hidden">
          {desktopInline.map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant={a.variant || (a.primary ? "default" : "outline")}
              onClick={a.onClick}
              className={cn("h-8 px-2.5 text-xs whitespace-nowrap", a.primary && "shadow")}
            >
              <a.icon className="size-3.5 mr-1" />
              {a.label}
            </Button>
          ))}
          {desktopOverflow.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
                  <MoreHorizontal className="size-4 mr-1" />Mais
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {desktopOverflow.map((a) => (
                  <DropdownMenuItem key={a.id} onClick={a.onClick}>
                    <a.icon className="size-4 mr-2" />{a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {extraInfo && <div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{extraInfo}</div>}
      </div>

      {/* MOBILE — fixed bottom bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t border-border px-2 py-2 flex items-center justify-around gap-1 shadow-lg">
        {mobileTop.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={a.primary ? "default" : "outline"}
            onClick={a.onClick}
            className="flex-1 flex-col h-auto py-2 gap-1 text-[10px] leading-none"
          >
            <a.icon className="size-5" />
            <span className="truncate max-w-full">{a.label}</span>
          </Button>
        ))}
      </div>
      {/* spacer so mobile content doesn't hide behind fixed bar */}
      <div className="md:hidden h-20" aria-hidden />

      {/* FAB — floating menu (all screens) */}
      <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40">
        <DropdownMenu open={fabOpen} onOpenChange={setFabOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              className="h-14 w-14 rounded-full shadow-xl bg-primary hover:bg-primary/90"
              aria-label="Ações rápidas"
            >
              {fabOpen ? <X className="size-6" /> : <Plus className="size-6" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-56">
            <DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {visible.map((a) => (
              <DropdownMenuItem key={a.id} onClick={a.onClick}>
                <a.icon className="size-4 mr-2" />
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

export const ActionIcons = { FileSpreadsheet, FileDown, Eye, Save, RefreshCw, Rocket };
