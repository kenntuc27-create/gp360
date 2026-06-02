import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Score = {
  score: number;
  classification: string;
  production_score: number;
  tasks_score: number;
  behavior_score: number;
  previous_classification: string | null;
};

const classColor = (c: string) =>
  c === "A" ? "bg-success text-success-foreground" : c === "B" ? "bg-success/80 text-success-foreground" : c === "C" ? "bg-warning text-warning-foreground" : "bg-destructive text-destructive-foreground";
const classLabel = (c: string) =>
  c === "A" ? "Excelente" : c === "B" ? "Bom" : c === "C" ? "Atenção" : "Crítico";

export function DailyScorePopup() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<Score | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    const today = new Date().toISOString().slice(0, 10);
    const seenKey = `daily-score-seen:${user.id}:${today}`;
    if (localStorage.getItem(seenKey)) return;
    // Só mostra após as 16h
    if (new Date().getHours() < 16) return;

    (async () => {
      const { data: emp } = await supabase
        .from("employees").select("id").eq("user_id", user.id).maybeSingle();
      if (!emp) return;
      const { data: s } = await supabase
        .from("performance_scores")
        .select("score, classification, production_score, tasks_score, behavior_score, previous_classification")
        .eq("employee_id", emp.id).eq("reference_date", today).maybeSingle();
      if (!s) return;
      setScore(s as Score);
      setOpen(true);
      localStorage.setItem(seenKey, "1");
    })();
  }, [user, loading]);

  if (!score) return null;

  const trend = score.previous_classification
    ? "ABCD".indexOf(score.classification) < "ABCD".indexOf(score.previous_classification)
      ? "up" : "ABCD".indexOf(score.classification) > "ABCD".indexOf(score.previous_classification)
      ? "down" : "same"
    : "same";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="size-5 text-amber-500" /> Seu desempenho de hoje
          </DialogTitle>
          <DialogDescription>Resumo automático baseado na sua produção, tarefas e comportamento.</DialogDescription>
        </DialogHeader>

        <div className="text-center py-4">
          <div className="text-5xl font-bold">{score.score}</div>
          <div className="text-sm text-muted-foreground mt-1">de 100 pontos</div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Badge className={`${classColor(score.classification)} text-base px-3 py-1`}>
              {score.classification} — {classLabel(score.classification)}
            </Badge>
            {trend === "up" && <TrendingUp className="size-5 text-success" />}
            {trend === "down" && <TrendingDown className="size-5 text-destructive" />}
            {trend === "same" && <Minus className="size-5 text-muted-foreground" />}
          </div>
          {score.previous_classification && trend !== "same" && (
            <p className="text-xs text-muted-foreground mt-2">
              Ontem: {score.previous_classification} → Hoje: {score.classification}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <Bar label="Produção (50%)" value={score.production_score} />
          <Bar label="Tarefas (30%)" value={score.tasks_score} />
          <Bar label="Comportamento (20%)" value={score.behavior_score} />
        </div>

        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Fechar</Button>
          <Link to="/equipe/performance" className="flex-1">
            <Button className="w-full" onClick={() => setOpen(false)}>Ver detalhes</Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "bg-success" : value >= 50 ? "bg-warning" : "bg-destructive";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold">{Math.round(value)}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}
