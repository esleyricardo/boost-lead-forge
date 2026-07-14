/**
 * Servidor Express: API + arquivos estáticos do frontend em produção.
 */
import { spawn, type ChildProcess } from "child_process";
import cors from "cors";
import express from "express";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { api } from "./routes";
import { isComparando } from "./services/comparativo";
import { reagendarCron } from "./services/cron";
import { getEnriquecimentoStatus } from "./services/enrichment";
import { isSincronizando, recuperarSincronizacoesOrfas } from "./services/pgfn-sync";

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

/** Abre a URL no navegador padrão, sem vínculo com este processo. */
function abrirDesvinculado(command: string, args: string[]): void {
  try {
    const filho = spawn(command, args, { stdio: "ignore", detached: true });
    // "error" chega de forma assíncrona quando o programa não existe; sem este
    // tratador, o evento não capturado derrubaria o servidor inteiro.
    filho.on("error", () => {});
    filho.unref();
  } catch {
    /* sem interface gráfica disponível (ex.: servidor na nuvem): ignora */
  }
}

/**
 * Abre o app em janela própria (modo aplicativo do Edge/Chrome, sem barra de
 * endereço). Retorna o processo da janela quando conseguimos acompanhá-lo —
 * usado para encerrar o servidor quando o usuário fecha a janela.
 */
function abrirJanelaApp(url: string): ChildProcess | null {
  if (process.platform === "win32") {
    const candidatos = [
      path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env["LOCALAPPDATA"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    ];
    const navegador = candidatos.find((c) => fs.existsSync(c));
    if (navegador) {
      try {
        // Perfil dedicado: garante um processo próprio para a janela do app,
        // permitindo saber quando ela é fechada
        const perfil = path.join(process.env["LOCALAPPDATA"] || os.tmpdir(), "PGFN-Devedores", "janela");
        fs.mkdirSync(perfil, { recursive: true });
        const filho = spawn(navegador, [`--app=${url}`, `--user-data-dir=${perfil}`, "--no-first-run"], {
          stdio: "ignore",
        });
        filho.on("error", () => abrirDesvinculado("cmd", ["/c", "start", "", url]));
        return filho;
      } catch {
        /* cai para o navegador padrão abaixo */
      }
    }
    abrirDesvinculado("cmd", ["/c", "start", "", url]);
    return null;
  }
  abrirDesvinculado(process.platform === "darwin" ? "open" : "xdg-open", [url]);
  return null;
}

/** Encerra o servidor quando a janela fecha — mas espera tarefas em andamento. */
function encerrarQuandoOcioso(): void {
  const ocupado =
    isSincronizando() || isComparando() || getEnriquecimentoStatus().executando;
  if (ocupado) {
    console.log(
      "[Server] Janela fechada, mas há sincronização/enriquecimento em andamento; o servidor continua até concluir."
    );
    setTimeout(encerrarQuandoOcioso, 60_000);
    return;
  }
  console.log("[Server] Janela do app fechada; encerrando o servidor.");
  process.exit(0);
}

const servidor = app.listen(PORT, () => {
  console.log(`[Server] API rodando em http://localhost:${PORT}`);
  // Limpa sincronizações interrompidas por um restart anterior
  recuperarSincronizacoesOrfas();
  reagendarCron();
  if (process.env.OPEN_BROWSER === "1") {
    const janela = abrirJanelaApp(`http://localhost:${PORT}`);
    if (janela) janela.on("exit", encerrarQuandoOcioso);
  }
});

// Já existe outra instância rodando? Só abre a janela apontando para ela.
servidor.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE" && process.env.OPEN_BROWSER === "1") {
    console.log("[Server] O sistema já está aberto; reabrindo a janela do app.");
    abrirDesvinculado("cmd", ["/c", "start", "", `http://localhost:${PORT}`]);
    setTimeout(() => process.exit(0), 1500);
    return;
  }
  console.error("[Server] Falha ao iniciar:", err.message);
  process.exit(1);
});
