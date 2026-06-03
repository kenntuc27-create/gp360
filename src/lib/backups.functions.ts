import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";
import { execFileSync, execSync } from "child_process";

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
  const root = "C:/GP3K";
  const dir = "C:/GP3K/backups/snapshots";

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const agora = new Date();

  const nome =
    agora.getFullYear() + "-" +
    String(agora.getMonth() + 1).padStart(2, "0") + "-" +
    String(agora.getDate()).padStart(2, "0") + "_" +
    String(agora.getHours()).padStart(2, "0") + "-" +
    String(agora.getMinutes()).padStart(2, "0") + "-" +
    String(agora.getSeconds()).padStart(2, "0") + ".zip";

  const destino = path.join(dir, nome);

  execFileSync(
    "tar",
    [
      "-a",
      "-c",
      "-f",
      destino,
      "-C",
      root,
      "src",
      "public",
      "package.json",
      "vite.config.ts",
      "tsconfig.json",
    ],
    { stdio: "pipe" }
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

export const listarTagsGit = createServerFn({
  method: "GET",
}).handler(async () => {
  try {
    const tags = execSync(
      "git tag --sort=-creatordate",
      {
        encoding: "utf8",
        cwd: "C:/GP3K",
      }
    )
      .split(/\r?\n/)
      .filter(Boolean);

    return tags;
  } catch {
    return [];
  }
});

export const criarSnapshotGit = createServerFn({
  method: "POST",
}).handler(async () => {

  const snap =
    "SNAPSHOT_" +
    new Date()
      .toISOString()
      .replace(/[-:]/g,"")
      .replace("T","_")
      .substring(0,15);

  execSync("git add .", {
    cwd: "C:/GP3K",
    stdio: "pipe"
  });

  try {

    execSync(
      `git commit -m "${snap}"`,
      {
        cwd: "C:/GP3K",
        stdio: "pipe"
      }
    );

  } catch {}

  execSync(
    "git push origin main",
    {
      cwd: "C:/GP3K",
      stdio: "pipe"
    }
  );

  execSync(
    `git tag ${snap}`,
    {
      cwd: "C:/GP3K",
      stdio: "pipe"
    }
  );

  execSync(
    `git push origin ${snap}`,
    {
      cwd: "C:/GP3K",
      stdio: "pipe"
    }
  );

  return {
    ok: true,
    snapshot: snap
  };
});


export const restaurarSnapshotGit = createServerFn({
  method: "POST",
}).handler(async ({ data }: any) => {

  if (!data?.tag) {
    throw new Error("TAG não informada");
  }

  execSync(
    `git checkout ${data.tag}`,
    {
      cwd: "C:/GP3K",
      stdio: "pipe"
    }
  );

  return {
    ok: true,
    tag: data.tag
  };
});
