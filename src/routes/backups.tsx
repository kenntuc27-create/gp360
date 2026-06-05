import { AppShell } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";
import {
  listarBackups,
  listarTagsGit,
} from "@/lib/backups.functions";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/backups")({
  component: BackupsPage,
});

function BackupsPage() {

  const [tagsGit,setTagsGit] = useState<any[]>([]);
  const [backups,setBackups] = useState<any[]>([]);
  const [tipo,setTipo] = useState("Todos");
  const [busca,setBusca] = useState("");
  const [selecionado,setSelecionado] = useState<any>(null);

const [ordemCampo,setOrdemCampo] =
useState("data");

const [ordemDirecao,setOrdemDirecao] =
useState("desc");

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
      nome:t.nome,
      tipo:"GitHub",
      data:t.data,
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

    dados.sort((a:any,b:any)=>{

      if(ordemCampo==="nome"){

        const r =
          String(a.nome)
          .localeCompare(String(b.nome));

        return ordemDirecao==="asc"
          ? r
          : -r;
      }

      if(ordemCampo==="tipo"){

        const r =
          String(a.tipo)
          .localeCompare(String(b.tipo));

        return ordemDirecao==="asc"
          ? r
          : -r;
      }

      const da =
        new Date(a.data || 0).getTime();

      const db =
        new Date(b.data || 0).getTime();

      return ordemDirecao==="asc"
        ? da-db
        : db-da;

    });

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
            className="border rounded p-2 bg-slate-900 text-white"
          >
            <option>Todos</option>
            <option>GitHub</option>
            <option>Local</option>
          </select>

          <input
            value={busca}
            onChange={(e)=>setBusca(e.target.value)}
            placeholder="Pesquisar..."
            className="border rounded p-2 bg-slate-900 text-white"
          />

          <button
            onClick={carregar}
            className="border rounded p-2 bg-slate-900 text-white"
          >
            Atualizar
          </button>

          <div className="border rounded p-2 flex items-center justify-center">
            {itens.length} registros
          </div>

        </div>

                <div className="mt-6 border rounded-xl p-4 bg-muted/10">

          <div className="text-sm opacity-70">
            Selecionado
          </div>

          <div className="font-semibold text-lg mt-2">
            {selecionado?.nome || "Nenhum item selecionado"}
          </div>

          <div className="mt-3 text-sm opacity-70">
            {selecionado?.tipo || "--"}
          </div>

          <div className="flex gap-2 mt-4">

            <button
              disabled={!selecionado}
              className="border rounded px-4 py-2"
            >
              Restaurar
            </button>

            <button
              disabled={!selecionado}
              className="border rounded px-4 py-2"
            >
              Download
            </button>

            <button
              disabled={!selecionado}
              className="border rounded px-4 py-2 text-red-500"
            >
              Excluir
            </button>

          </div>

        </div>
<div className="border rounded-xl mt-6 overflow-hidden"><div className="max-h-[600px] overflow-y-auto">

          <table className="w-full table-fixed">

                        <thead className="border-b sticky top-0 bg-slate-950 z-10">

              <tr>

                <th className="text-left p-3 w-[70px]">
                  Sel.
                </th>

                <th
                  onClick={()=>{
                    setOrdemCampo("nome");
                    setOrdemDirecao(ordemCampo==="nome" && ordemDirecao==="asc" ? "desc" : "asc");
                  }}
                  className="text-left p-3 cursor-pointer hover:text-blue-400"
                >
                  Nome {ordemCampo==="nome" ? (ordemDirecao==="asc" ? "▲" : "▼") : "▲▼"}
                </th>

                <th
                  onClick={()=>{
                    setOrdemCampo("tipo");
                    setOrdemDirecao(ordemCampo==="tipo" && ordemDirecao==="asc" ? "desc" : "asc");
                  }}
                  className="text-left p-3 cursor-pointer hover:text-blue-400 w-[140px]"
                >
                  Tipo {ordemCampo==="tipo" ? (ordemDirecao==="asc" ? "▲" : "▼") : "▲▼"}
                </th>

                <th
                  onClick={()=>{
                    setOrdemCampo("data");
                    setOrdemDirecao(ordemCampo==="data" && ordemDirecao==="asc" ? "desc" : "asc");
                  }}
                  className="text-left p-3 cursor-pointer hover:text-blue-400 w-[240px]"
                >
                  Data {ordemCampo==="data" ? (ordemDirecao==="asc" ? "▲" : "▼") : "▲▼"}
                </th>

                <th onClick={()=>{setOrdemCampo("tamanho");setOrdemDirecao(ordemCampo==="tamanho" && ordemDirecao==="asc" ? "desc" : "asc");}} className="text-left p-3 w-[120px] cursor-pointer hover:text-blue-400">
                  Tamanho {ordemCampo==="tamanho" ? (ordemDirecao==="asc" ? "▲" : "▼") : "▲▼"}
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
                  className={selecionado?.nome === item.nome ? "cursor-pointer border-b bg-blue-900/40 border-l-4 border-blue-500" : "cursor-pointer border-b hover:bg-slate-800/40"}
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

          </table></div>

        </div>



      </div>

    </AppShell>
  );
}


















