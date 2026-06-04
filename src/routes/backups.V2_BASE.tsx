import { AppShell } from "@/components/AppShell";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/backups/V2_BASE")({
  component: BackupsV2Page,
});

function BackupsV2Page() {

  return (
    <AppShell title="Backups 3K360">

      <div className="p-6">

        <h1 className="text-3xl font-bold">
          Backups 3K360
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">

          <select className="border rounded p-2">
            <option>Todos</option>
            <option>GitHub</option>
            <option>Local</option>
          </select>

          <input
            placeholder="Pesquisar..."
            className="border rounded p-2"
          />

          <button className="border rounded p-2">
            Atualizar
          </button>

          <button className="border rounded p-2">
            Novo Snapshot
          </button>

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

              <tr>

                <td className="p-3">
                  ○
                </td>

                <td className="p-3">
                  BACKUPS_UI_BASE_ESTAVEL
                </td>

                <td className="p-3">
                  GitHub
                </td>

                <td className="p-3">
                  --
                </td>

                <td className="p-3">
                  --
                </td>

              </tr>

            </tbody>

          </table>

        </div>

        <div className="mt-6 border rounded-xl p-4">

          <div className="text-sm opacity-70">
            Selecionado
          </div>

          <div className="font-semibold mt-2">
            Nenhum item selecionado
          </div>

          <div className="flex gap-2 mt-4">

            <button className="border rounded px-4 py-2">
              Restaurar
            </button>

            <button className="border rounded px-4 py-2">
              Download
            </button>

            <button className="border rounded px-4 py-2">
              Excluir
            </button>

          </div>

        </div>

      </div>

    </AppShell>
  );
}

