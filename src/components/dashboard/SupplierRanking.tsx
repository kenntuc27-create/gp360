import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, TrendingUp } from "lucide-react";

interface SupplierRank {
  id: string;
  razao_social: string;
  segmento: string;
  win_rate: number;
  quote_count: number;
}

export function SupplierRanking() {
  const [rows, setRows] = useState<SupplierRank[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, razao_social, segmento, performance_metrics")
        .order("performance_metrics->win_rate", { ascending: false })
        .limit(10);

      if (data) {
        const ranks = data.map(s => ({
          id: s.id,
          razao_social: s.razao_social,
          segmento: s.segmento || "Geral",
          win_rate: (s.performance_metrics as any)?.win_rate || 0,
          quote_count: (s.performance_metrics as any)?.quote_count || 0,
        }));
        setRows(ranks);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <SectionCard
      title={<span className="inline-flex items-center gap-2"><Trophy className="size-4 text-amber-500" />Ranking de Fornecedores</span>}
      description="Baseado em taxa de vitória"
    >
      {loading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Sem dados de performance.</div>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <div className="min-w-0">
                <div className="font-medium truncate flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground w-4">{i + 1}.</span>
                  {r.razao_social}
                  {i === 0 && <Star className="size-3 text-amber-500 fill-amber-500" />}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase">{r.segmento}</div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <Badge variant="secondary" className="text-[10px] font-bold">
                  {r.win_rate}% Win
                </Badge>
                <div className="text-[9px] text-muted-foreground">{r.quote_count} cotações</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
