/**
 * Servidor Express: API + arquivos estáticos do frontend em produção.
 */
import { spawn } from "child_process";
import cors from "cors";
import express from "express";
import * as fs from "fs";
import * as path from "path";
import { api } from "./routes";
import { reagendarCron } from "./services/cron";
import { recuperarSincronizacoesOrfas } from "./services/pgfn-sync";

const PORT = Number(process.env.PORT) || 3001;
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/api", api);

// Em produção, serve o build do Vite (dist/)
const distDir = path.join(process.cwd(), "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

/**
 * Abre o navegador no app assim que o servidor está pronto. Usado pela versão
 * desktop (ativado por OPEN_BROWSER=1) — evita a "corrida" de abrir o navegador
 * antes do servidor subir, que causava "Failed to fetch" na primeira execução.
 */
function abrirNavegador(url: string): void {
  const cmd =
    process.platform === "win32"
      ? { command: "cmd", args: ["/c", "start", "", url] }
      : process.platform === "darwin"
        ? { command: "open", args: [url] }
        : { command: "xdg-open", args: [url] };
  try {
    spawn(cmd.command, cmd.args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* sem navegador disponível (ex.: servidor): ignora */
  }
}

app.listen(PORT, () => {
  console.log(`[Server] API rodando em http://localhost:${PORT}`);
  // Limpa sincronizações interrompidas por um restart anterior
  recuperarSincronizacoesOrfas();
  reagendarCron();
  if (process.env.OPEN_BROWSER === "1") {
    abrirNavegador(`http://localhost:${PORT}`);
  }
});
