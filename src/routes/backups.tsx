import { AppShell } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
import { listarBackups, criarSnapshot, excluirBackup } from "@/lib/backups.functions";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/backups")({
  component: BackupsPage,
});

function BackupsPage() {
  const [backups, setBackups] = useState<any[]>([]);

  useEffect(() => {
    listarBackups()
      .then((dados: any) => {
        setBackups(dados || []);
      })
      .catch(console.error);
  }, []);

  return (
    <AppShell title="Backups GP360">
      <div className="p-6">
        <h1 className="text-3xl font-bold">
          Backups GP360
        </h1>

        <p className="mt-4">
          Central de snapshots e restauração.
        </p>

        <button
          onClick={async () => {
             try {
  const r = await criarSnapshot();
  console.log(r);
  alert("SNAPSHOT CRIADO");
} catch(e:any) {
  console.error(e);
  alert("ERRO: " + (e?.message || e));
}
const dados = await listarBackups();
setBackups(dados || []);
          }}
          className="mt-4 border rounded px-4 py-2"
        >
          Criar Snapshot
        </button>

        <div className="mt-6 space-y-3">
          {backups.length === 0 ? (
            <div className="border rounded-lg p-4">
              Nenhum backup encontrado.
            </div>
          ) : (
            backups.map((b, i) => (
              <div
                key={i}
                className="border rounded-lg p-4"
              >
                <div className="font-semibold">
                  {b.nome}
                </div>

                <div className="text-sm opacity-70">
                  {b.tamanho} MB
                </div>

                <div className="text-sm opacity-70">
                  {new Date(b.data).toLocaleString("pt-BR")}
                </div>

                <div className="mt-3 flex gap-2">

                  <a
                    href={"/backups/snapshots/" + b.nome}
                    target="_blank"
                    className="border rounded px-3 py-1 text-blue-500"
                  >
                    Download
                  </a>

                  <button
                    onClick={async () => {
                      if (!confirm(`Excluir ${b.nome}?`)) return;

                      await excluirBackup({
                        data: { nome: b.nome }
                      });

                      const dados = await listarBackups();
                      setBackups(dados || []);
                    }}
                    className="border rounded px-3 py-1 text-red-500"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}












