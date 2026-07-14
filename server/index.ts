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

// Diagnóstico de desempenho: registra no log qualquer requisição lenta,
// com a rota e os parâmetros — ajuda a rastrear onde o app "trava"
app.use((req, res, next) => {
  const inicio = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - inicio;
    if (ms > 800) console.log(`[Lento ${ms}ms] ${req.method} ${req.originalUrl}`);
  });
  next();
});

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
 * Abre o app assim que o servidor está pronto (versão desktop, OPEN_BROWSER=1).
 * No Windows, prefere o "modo aplicativo" do Edge/Chrome: janela própria, sem
 * barra de endereço nem abas — aparência de programa nativo. Se não encontrar,
 * cai para o navegador padrão.
 */
function abrirJanelaApp(url: string): void {
  // "error" chega de forma assíncrona quando o programa não existe; sem este
  // tratador, o evento não capturado derrubaria o servidor inteiro.
  const abrir = (command: string, args: string[]) => {
    try {
      const filho = spawn(command, args, { stdio: "ignore", detached: true });
      filho.on("error", () => {
        /* sem interface gráfica disponível (ex.: servidor na nuvem): ignora */
      });
      filho.unref();
    } catch {
      /* idem */
    }
  };

  if (process.platform === "win32") {
    const candidatos = [
      path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["LOCALAPPDATA"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    ];
    const navegador = candidatos.find((c) => fs.existsSync(c));
    if (navegador) {
      abrir(navegador, [`--app=${url}`]);
    } else {
      abrir("cmd", ["/c", "start", "", url]);
    }
    return;
  }
  if (process.platform === "darwin") {
    abrir("open", [url]);
  } else {
    abrir("xdg-open", [url]);
  }
}

app.listen(PORT, () => {
  console.log(`[Server] API rodando em http://localhost:${PORT}`);
  // Limpa sincronizações interrompidas por um restart anterior
  recuperarSincronizacoesOrfas();
  reagendarCron();
  if (process.env.OPEN_BROWSER === "1") {
    abrirJanelaApp(`http://localhost:${PORT}`);
  }
});
