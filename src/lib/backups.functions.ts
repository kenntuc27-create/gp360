import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";

export const listarBackups = createServerFn({
  method: "GET",
}).handler(async () => {

  const dir = "C:/GP3K/backups/snapshots";

  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".zip"))
    .map(f => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);

      return {
        nome: f,
        tamanho: (stat.size / 1024 / 1024).toFixed(2),
        data: stat.mtime,
      };
    });
});

export const criarSnapshot = createServerFn({
  method: "POST",
}).handler(async () => {

  const dir = "C:/GP3K/backups/snapshots";

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const agora = new Date();

  const nome =
    agora.getFullYear() + "-" +
    String(agora.getMonth()+1).padStart(2,"0") + "-" +
    String(agora.getDate()).padStart(2,"0") + "_" +
    String(agora.getHours()).padStart(2,"0") + "-" +
    String(agora.getMinutes()).padStart(2,"0") + "-" +
    String(agora.getSeconds()).padStart(2,"0") + ".zip";

  const destino = path.join(dir, nome);

  fs.writeFileSync(
    destino,
    JSON.stringify({
      data: new Date().toISOString(),
      projeto: "GP360"
    }, null, 2)
  );

  return {
    ok: true,
    arquivo: nome,
  };
});

export const excluirBackup = createServerFn({
  method: "POST",
}).handler(async ({ data }: any) => {

  const dir = "C:/GP3K/backups/snapshots";
  const arquivo = path.join(dir, data.nome);

  if (fs.existsSync(arquivo)) {
    fs.unlinkSync(arquivo);
  }

  return { ok: true };
});
