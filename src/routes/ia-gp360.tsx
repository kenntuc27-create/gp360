import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/ia-gp360")({
  component: IAGP360Page,
});

function IAGP360Page() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");

  function analisar() {
    setResponse(
      "Comando recebido: " + prompt +
      "\n\nPróxima fase: integração Gemini para análise real do projeto."
    );
  }

  return (
    <AppShell
  title="IA GP360"
  actions={
    <Button variant="outline">
      TESTE
    </Button>
  }
>
      <div className="p-6 space-y-4">

        <h1 className="text-3xl font-bold">
          IA GP360
        </h1>

        <div className="border rounded-lg p-4 space-y-4">
          <textarea
            className="w-full border rounded p-3 min-h-[120px]"
            placeholder="Ex: criar módulo financeiro, adicionar comissão, criar dashboard..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          <button
            onClick={analisar}
            className="border rounded px-4 py-2"
          >
            Analisar
          </button>
        </div>

        <div className="border rounded-lg p-4 whitespace-pre-wrap">
          {response || "Aguardando comando..."}
        </div>

      </div>
    </AppShell>
  );
}