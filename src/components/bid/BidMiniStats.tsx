import { TrendingUp, Trophy, Calculator, DollarSign, LucideIcon } from "lucide-react";
import { fmtBRL } from "@/lib/format";

interface BidMiniStatsProps {
  potentialTotal: number;
  winTotal: number;
  winCost: number;
}

function MiniStat({ label, value, icon: Icon, tone = "primary" }: { label: string; value: string; icon: LucideIcon; tone?: "primary" | "emerald" | "amber" }) {
  const tones = {
    primary: "bg-primary/5 text-primary border-primary/10",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
  };
  return (
    <div className={`p-3 rounded-xl border shadow-sm flex items-center gap-3 bg-card ${tones[tone]}`}>
      <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${tone === 'primary' ? 'bg-primary/10' : 'bg-white/50'}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 leading-none mb-1">{label}</p>
        <p className="text-sm font-bold truncate leading-tight">{value}</p>
      </div>
    </div>
  );
}

export function BidMiniStats({ potentialTotal, winTotal, winCost }: BidMiniStatsProps) {
  const winProfit = winTotal - winCost;
  const winMargin = winTotal > 0 ? (winProfit / winTotal) * 100 : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <MiniStat label="Potencial" value={fmtBRL(potentialTotal)} icon={TrendingUp} />
      <MiniStat label="Valor Ganhos" value={fmtBRL(winTotal)} icon={Trophy} tone="emerald" />
      <MiniStat label="Custo Ganhos" value={fmtBRL(winCost)} icon={DollarSign} />
      <MiniStat label="Lucro Estimado" value={fmtBRL(winProfit)} tone="amber" icon={Calculator} />
      <MiniStat label="Margem" value={`${winMargin.toFixed(1)}%`} icon={TrendingUp} />
    </div>
  );
}
