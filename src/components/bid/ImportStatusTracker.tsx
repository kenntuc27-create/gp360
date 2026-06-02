import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, FileText, ScrollText } from "lucide-react";

interface ImportStatusTrackerProps {
  importId: string;
  onComplete: (data: any) => void;
  onCancel: () => void;
}

export function ImportStatusTracker({ importId, onComplete, onCancel }: ImportStatusTrackerProps) {
  const [status, setStatus] = useState<string>("pending");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!importId) return;

    // Initial fetch
    fetchStatus();

    // Subscribe to changes
    const channel = supabase
      .channel(`import-${importId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "edital_imports",
          filter: `id=eq.${importId}`,
        },
        (payload) => {
          const newData = payload.new as any;
          setStatus(newData.status);
          setProgress(newData.progress_pct);
          setError(newData.error_message);
          
          if (newData.status === "completed") {
            onComplete(newData.extracted_json);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "edital_logs",
          filter: `import_id=eq.${importId}`,
        },
        (payload) => {
          setLogs((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    const interval = setInterval(fetchStatus, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [importId]);

  async function fetchStatus() {
    const { data, error } = await supabase
      .from("edital_imports")
      .select("*")
      .eq("id", importId)
      .single();

    if (error) return;

    setStatus(data.status);
    setProgress(data.progress_pct);
    setError(data.error_message);

    if (data.status === "completed") {
      onComplete(data.extracted_json);
    }

    const { data: logsData } = await supabase
      .from("edital_logs")
      .select("*")
      .eq("import_id", importId)
      .order("created_at", { ascending: false });
    
    if (logsData) setLogs(logsData);
  }

  const getStatusBadge = () => {
    switch (status) {
      case "pending": return <Badge variant="outline">Aguardando</Badge>;
      case "processing_ocr": return <Badge variant="secondary" className="animate-pulse">OCR Profissional</Badge>;
      case "processing_ai": return <Badge variant="default" className="bg-blue-500 animate-pulse">Inteligência Artificial</Badge>;
      case "completed": return <Badge variant="default" className="bg-green-500">Concluído</Badge>;
      case "error": return <Badge variant="destructive">Erro</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            Motor de Importação Assíncrono
          </div>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span>Progresso da Extração</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex gap-2 text-destructive text-sm">
            <AlertCircle className="size-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <ScrollText className="size-4" />
            Logs de Processamento
          </h4>
          <div className="max-h-48 overflow-y-auto border rounded-md bg-muted/20 p-2 space-y-2">
            {logs.length === 0 && (
              <div className="text-xs text-muted-foreground italic text-center py-4">
                Iniciando motores...
              </div>
            )}
            {logs.map((log) => (
              <div key={log.id} className="text-xs flex gap-2 border-b border-border/50 pb-1 last:border-0">
                <span className="text-muted-foreground shrink-0">
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
                <span className={`font-medium shrink-0 ${log.level === 'error' ? 'text-destructive' : log.level === 'warning' ? 'text-yellow-600' : 'text-blue-600'}`}>
                  [{log.level.toUpperCase()}]
                </span>
                <span className="text-foreground">{log.message}</span>
              </div>
            ))}
            {status !== "completed" && status !== "error" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                <Loader2 className="size-3 animate-spin" />
                Processando...
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
