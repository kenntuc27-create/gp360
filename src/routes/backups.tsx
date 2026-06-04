import { AppShell } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
import {
  listarBackups,
  criarSnapshot,
  criarSnapshotGit,
  excluirBackup,
  listarTagsGit,
  restaurarSnapshotGit
} from "@/lib/backups.functions";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/backups")({
  component: BackupsPage,
});

function BackupsPage() {

  const [backups, setBackups] = useState<any[]>([]);
  const [tagsGit, setTagsGit] = useState<string[]>([]);
  const [snapshotSelecionado, setSnapshotSelecionado] = useState("");
const [backupLocalSelecionado, setBackupLocalSelecionado] = useState("");

  useEffect(() => {

    listarBackups()
      .then((dados:any) => setBackups(dados || []))
      .catch(console.error);

    listarTagsGit()
      .then((dados:any) => setTagsGit(dados || []))
      .catch(console.error);

  }, []);

  const ultimoBackup =
    backups.length > 0
      ? new Date(backups[0].data).toLocaleString("pt-BR")
      : "--";

  return (
    <AppShell title="Backups 3K360">

      <div className="p-6">

        <h1 className="text-3xl font-bold">
          Backups 3K360
        </h1>

        <p className="mt-2 opacity-70">
          Central de snapshots e restauração
        </p>

        <button
          onClick={async () => {

            try {

              await criarSnapshotGit();
              await criarSnapshot();

              const tags = await listarTagsGit();
              setTagsGit(tags || []);

              const dados = await listarBackups();
              setBackups(dados || []);

              alert("Snapshot criado com sucesso");

            } catch (e:any) {

              console.error(e);
              alert("Erro ao criar snapshot");

            }
          }}
          className="mt-4 border rounded px-4 py-2 cursor-pointer hover:opacity-80 transition-all"
        >
          Criar Snapshot
        </button>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">

          <div className="border rounded-xl p-4">
            <div className="text-sm opacity-70">
              Snapshots GitHub
            </div>

            <div className="text-3xl font-bold">
              {tagsGit.length}
            </div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="text-sm opacity-70">
              Arquivos Locais
            </div>

            <div className="text-3xl font-bold">
              {backups.length}
            </div>
          </div>

          <div className="border rounded-xl p-4">
            <div className="text-sm opacity-70">
              Último Backup
            </div>

            <div className="font-semibold">
              {ultimoBackup}
            </div>
          </div>

        </div>

        <div className="mt-10">

          <h2 className="text-xl font-bold mb-4">
            Snapshots GitHub
          </h2>

          <div className="space-y-3">

  <div className="border rounded-xl p-4 mb-4 bg-muted/20">

    <div className="text-sm opacity-70">
      Snapshot Selecionado
    </div>

    <div className="text-lg font-semibold mt-2">
      {snapshotSelecionado || "Nenhum snapshot selecionado"}
    </div>

    <button
      disabled={!snapshotSelecionado}
      className="mt-4 border rounded px-4 py-2 cursor-pointer hover:opacity-80 transition-all"
      onClick={async () => {

        if(!snapshotSelecionado){
          alert("Selecione um snapshot");
          return;
        }

        const ok = confirm(
          "CONFIRMAR RESTAURAÇÃO?\n\n" +
          "Snapshot:\n" +
          snapshotSelecionado +
          "\n\nSerá criado um backup automático antes da restauração."
        );

        if(!ok) return;

        try{

          await criarSnapshotGit();
          await criarSnapshot();

          await restaurarSnapshotGit({
            data:{
              tag:snapshotSelecionado
            }
          });

          alert(
            "Restauração concluída:\n\n" +
            snapshotSelecionado
          );

        }catch(e:any){

          console.error(e);

          alert(
            "Erro na restauração:\n\n" +
            (e?.message || e)
          );
        }

      }}
    >
      Restaurar Selecionado
    </button>

  </div>

            {tagsGit.map((tag, i) => (

              <div
                key={i}
                className="border rounded-xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="snapshotGit"
                    checked={snapshotSelecionado === tag}
                    onChange={() => setSnapshotSelecionado(tag)}
                  />
                  <span>{tag}</span>
                </div>



              </div>

            ))}

          </div>

        </div>

        <div className="mt-10">

          <h2 className="text-xl font-bold mb-4">
            Arquivos Locais
          </h2>

          <div className="space-y-4">

            {backups.map((b, i) => (

              <div
                key={i}
                className="border rounded-xl p-4"
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
                    className="border rounded px-3 py-1 cursor-pointer hover:opacity-80 transition-all"
                  >
                    Download
                  </a>

                  <button
                    onClick={async () => {

                      if (!confirm(`Excluir ${b.nome}?`))
                        return;

                      await excluirBackup({
                        data: {
                          nome: b.nome
                        }
                      });

                      const dados =
                        await listarBackups();

                      setBackups(dados || []);

                    }}
                    className="border rounded px-3 py-1 text-red-500"
                  >
                    Excluir
                  </button>

                </div>

              </div>

            ))}

          </div>

        </div>

      </div>

    </AppShell>
  );
}






















