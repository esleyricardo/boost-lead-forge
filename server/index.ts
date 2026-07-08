/**
 * Servidor Express: API + arquivos estáticos do frontend em produção.
 */
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

app.listen(PORT, () => {
  console.log(`[Server] API rodando em http://localhost:${PORT}`);
  // Limpa sincronizações interrompidas por um restart anterior
  recuperarSincronizacoesOrfas();
  reagendarCron();
});
