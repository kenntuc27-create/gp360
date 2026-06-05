import { AppShell } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
import {
  listarBackups,
  listarTagsGit,
} from "@/lib/backups.functions";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/backups/ANTES_MOVER_SELECIONADO")({
  component: BackupsPage,
});

function BackupsPage() {

  const [tagsGit,setTagsGit] = useState<any[]>([]);
  const [backups,setBackups] = useState<any[]>([]);
  const [tipo,setTipo] = useState("Todos");
  const [busca,setBusca] = useState("");
  const [selecionado,setSelecionado] = useState<any>(null);

  async function carregar(){

    const tags =
      await listarTagsGit();

    const zips =
      await listarBackups();

    setTagsGit(tags || []);
    setBackups(zips || []);

  }

  useEffect(() => {
    carregar();
  }, []);

  const itens = useMemo(() => {

    const git = (tagsGit || []).map((t:any) => ({
      nome:t,
      tipo:"GitHub",
      data:"",
      tamanho:"--"
    }));

    const zip = (backups || []).map((b:any) => ({
      nome:b.nome,
      tipo:"Local",
      data:b.data || "",
      tamanho:(b.tamanho || "--") + " MB"
    }));

    let dados = [...git,...zip];

    if(tipo !== "Todos"){
      dados =
        dados.filter(
          x => x.tipo === tipo
        );
    }

    if(busca){
      dados =
        dados.filter(
          x =>
            x.nome
             .toLowerCase()
             .includes(
               busca.toLowerCase()
             )
        );
    }

    return dados;

  },[
    tagsGit,
    backups,
    tipo,
    busca
  ]);

  return (
    <AppShell title="Backups 3K360">

      <div className="p-6">

        <h1 className="text-3xl font-bold">
          Backups 3K360
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">

          <select
            value={tipo}
            onChange={(e)=>setTipo(e.target.value)}
            className="border rounded p-2"
          >
            <option>Todos</option>
            <option>GitHub</option>
            <option>Local</option>
          </select>

          <input
            value={busca}
            onChange={(e)=>setBusca(e.target.value)}
            placeholder="Pesquisar..."
            className="border rounded p-2"
          />

          <button
            onClick={carregar}
            className="border rounded p-2"
          >
            Atualizar
          </button>

          <div className="border rounded p-2 flex items-center justify-center">
            {itens.length} registros
          </div>

        </div>

        <div className="border rounded-xl mt-6 overflow-hidden">

          <table className="w-full">

            <thead className="border-b">

              <tr>

                <th className="text-left p-3">
                  Sel.
                </th>

                <th className="text-left p-3">
                  Nome
                </th>

                <th className="text-left p-3">
                  Tipo
                </th>

                <th className="text-left p-3">
                  Data
                </th>

                <th className="text-left p-3">
                  Tamanho
                </th>

              </tr>

            </thead>

            <tbody>

              {itens.map((item,i)=>(

                <tr
                  key={i}
                  onClick={() =>
                    setSelecionado(item)
                  }
                  className="cursor-pointer border-b hover:bg-muted/20"
                >

                  <td className="p-3">
                    {selecionado?.nome === item.nome ? "●" : "○"}
                  </td>

                  <td className="p-3">
                    {item.nome}
                  </td>

                  <td className="p-3">
                    {item.tipo}
                  </td>

                  <td className="p-3">
                    {item.data
                      ? new Date(item.data)
                          .toLocaleString("pt-BR")
                      : "--"}
                  </td>

                  <td className="p-3">
                    {item.tamanho}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

        <div className="mt-6 border rounded-xl p-4">

          <div className="text-sm opacity-70">
            Selecionado
          </div>

          <div className="font-semibold mt-2">
            {selecionado?.nome || "Nenhum item selecionado"}
          </div>

        </div>

      </div>

    </AppShell>
  );
}

