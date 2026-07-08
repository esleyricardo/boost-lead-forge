/**
 * Rotas da API REST.
 */
import { Router, type Response } from "express";
import { db, getConfig } from "./db";
import {
  AuthRequest,
  HttpError,
  login,
  registrar,
  requireAdmin,
  requireAuth,
  toUsuario,
} from "./auth";
import {
  buscarEmpresa,
  listarEmpresas,
  listarEnriquecidas,
  listarParaExportacao,
} from "./services/empresas";
import {
  executarSincronizacao,
  isSincronizando,
  listarSincronizacoes,
} from "./services/pgfn-sync";
import { atualizarConfigCron, proximaExecucao } from "./services/cron";
import { executarComparativo, getComparativoStatus, isComparando } from "./services/comparativo";
import { getEnriquecimentoStatus, iniciarEnriquecimento } from "./services/enrichment";
import { gerarExcel } from "./services/excel";
import type { DashboardMetrics, EmpresasFiltro, SyncConfig } from "../shared/types";

export const api = Router();

// Usado pelos serviços de hospedagem para verificar que o app está no ar
api.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function handle(fn: (req: AuthRequest, res: Response) => void | Promise<void>) {
  return async (req: AuthRequest, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
      } else {
        const msg = err instanceof Error ? err.message : "Erro interno.";
        console.error("[API]", err);
        res.status(500).json({ error: msg });
      }
    }
  };
}

// ---------- Autenticação ----------

api.post(
  "/auth/registro",
  handle((req, res) => {
    const { nome, email, senha } = req.body || {};
    const usuario = registrar(String(nome || ""), String(email || ""), String(senha || ""));
    res.status(201).json({ usuario });
  })
);

api.post(
  "/auth/login",
  handle((req, res) => {
    const { email, senha } = req.body || {};
    res.json(login(String(email || ""), String(senha || "")));
  })
);

api.get(
  "/auth/me",
  requireAuth,
  handle((req, res) => {
    res.json({ usuario: req.usuario });
  })
);

// ---------- Usuários (admin) ----------

api.get(
  "/usuarios",
  requireAuth,
  requireAdmin,
  handle((_req, res) => {
    const rows = db.prepare("SELECT * FROM usuarios ORDER BY created_at DESC").all();
    res.json({ usuarios: (rows as Parameters<typeof toUsuario>[0][]).map(toUsuario) });
  })
);

api.patch(
  "/usuarios/:id",
  requireAuth,
  requireAdmin,
  handle((req, res) => {
    const id = Number(req.params.id);
    const { status, role } = req.body || {};
    if (id === req.usuario!.id && (status === "bloqueado" || role === "user")) {
      throw new HttpError(400, "Você não pode rebaixar ou bloquear a si mesmo.");
    }
    if (status) {
      if (!["pendente", "aprovado", "bloqueado"].includes(status)) {
        throw new HttpError(400, "Status inválido.");
      }
      db.prepare("UPDATE usuarios SET status = ? WHERE id = ?").run(status, id);
    }
    if (role) {
      if (!["admin", "user"].includes(role)) throw new HttpError(400, "Perfil inválido.");
      db.prepare("UPDATE usuarios SET role = ? WHERE id = ?").run(role, id);
    }
    const row = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id);
    if (!row) throw new HttpError(404, "Usuário não encontrado.");
    res.json({ usuario: toUsuario(row as Parameters<typeof toUsuario>[0]) });
  })
);

// ---------- Empresas / Devedores ----------

function parseFiltro(query: Record<string, unknown>): EmpresasFiltro {
  return {
    busca: query.busca ? String(query.busca) : undefined,
    natureza: query.natureza ? String(query.natureza) : undefined,
    uf: query.uf ? String(query.uf) : undefined,
    valorMin: query.valorMin != null && query.valorMin !== "" ? Number(query.valorMin) : undefined,
    valorMax: query.valorMax != null && query.valorMax !== "" ? Number(query.valorMax) : undefined,
    apenasNovas: query.apenasNovas === "true",
    entrouUltimoTrimestre: query.entrouUltimoTrimestre === "true",
    enriquecidas:
      query.enriquecidas === "sim" || query.enriquecidas === "nao"
        ? (query.enriquecidas as "sim" | "nao")
        : undefined,
    page: query.page ? Number(query.page) : 1,
    pageSize: query.pageSize ? Number(query.pageSize) : 25,
    orderBy: query.orderBy ? (String(query.orderBy) as EmpresasFiltro["orderBy"]) : undefined,
    orderDir: query.orderDir === "asc" ? "asc" : "desc",
  };
}

api.get(
  "/empresas",
  requireAuth,
  handle((req, res) => {
    res.json(listarEmpresas(parseFiltro(req.query as Record<string, unknown>)));
  })
);

api.get(
  "/empresas/:cnpj",
  requireAuth,
  handle((req, res) => {
    const detalhe = buscarEmpresa(String(req.params.cnpj).replace(/\D/g, ""));
    if (!detalhe) throw new HttpError(404, "Empresa não encontrada.");
    res.json(detalhe);
  })
);

// ---------- Enriquecimento ----------

api.post(
  "/enriquecimento",
  requireAuth,
  handle((req, res) => {
    const { cnpjs } = req.body || {};
    if (!Array.isArray(cnpjs)) throw new HttpError(400, "Envie a lista de CNPJs selecionados.");
    if (cnpjs.length > 500) {
      throw new HttpError(400, "Selecione no máximo 500 empresas por vez.");
    }
    res.json({ status: iniciarEnriquecimento(cnpjs.map(String), req.usuario!.id) });
  })
);

api.get(
  "/enriquecimento/status",
  requireAuth,
  handle((_req, res) => {
    res.json({ status: getEnriquecimentoStatus() });
  })
);

api.get(
  "/enriquecidas",
  requireAuth,
  handle((req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    res.json(listarEnriquecidas(page, pageSize));
  })
);

// ---------- Sincronização ----------

api.get(
  "/sync/config",
  requireAuth,
  handle((_req, res) => {
    const config: SyncConfig = {
      cronAtivo: getConfig("cron_ativo") === "true",
      cronHorario: getConfig("cron_horario") || "06:00",
      ultimaSincronizacao: getConfig("ultima_sincronizacao"),
      proximaExecucao: proximaExecucao(),
      executando: isSincronizando(),
    };
    res.json(config);
  })
);

api.put(
  "/sync/config",
  requireAuth,
  requireAdmin,
  handle((req, res) => {
    const { cronAtivo, cronHorario } = req.body || {};
    atualizarConfigCron(Boolean(cronAtivo), String(cronHorario || "06:00"));
    res.json({ ok: true });
  })
);

api.post(
  "/sync/executar",
  requireAuth,
  handle((req, res) => {
    if (isSincronizando()) throw new HttpError(409, "Já existe uma sincronização em andamento.");
    if (isComparando()) {
      throw new HttpError(409, "Há um comparativo de trimestres em andamento. Aguarde a conclusão.");
    }
    const forcar = (req.body || {}).forcar === true;
    // Dispara em segundo plano; o acompanhamento é feito pelo histórico
    executarSincronizacao("manual", forcar).catch((err) =>
      console.error("[Sync manual] Erro:", err instanceof Error ? err.message : err)
    );
    res.status(202).json({ ok: true });
  })
);

api.get(
  "/sync/historico",
  requireAuth,
  handle((_req, res) => {
    res.json({ sincronizacoes: listarSincronizacoes() });
  })
);

// ---------- Comparativo de trimestres ----------

api.post(
  "/comparativo/executar",
  requireAuth,
  handle((_req, res) => {
    if (isComparando()) throw new HttpError(409, "Já existe um comparativo em andamento.");
    if (isSincronizando()) {
      throw new HttpError(409, "Há uma sincronização em andamento. Aguarde a conclusão.");
    }
    // Dispara em segundo plano; o acompanhamento é feito pelo status
    executarComparativo().catch((err) =>
      console.error("[Comparativo] Erro:", err instanceof Error ? err.message : err)
    );
    res.status(202).json({ ok: true });
  })
);

api.get(
  "/comparativo/status",
  requireAuth,
  handle((_req, res) => {
    res.json(getComparativoStatus());
  })
);

// ---------- Exportação ----------

api.post(
  "/export/excel",
  requireAuth,
  handle(async (req, res) => {
    const { filtro, cnpjs } = req.body || {};
    const empresas = listarParaExportacao(
      parseFiltro(filtro || {}),
      Array.isArray(cnpjs) && cnpjs.length > 0 ? cnpjs.map(String) : undefined
    );
    const buffer = await gerarExcel(empresas);
    const nome = `devedores-pgfn-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res
      .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .setHeader("Content-Disposition", `attachment; filename="${nome}"`)
      .send(buffer);
  })
);

// ---------- Dashboard ----------

api.get(
  "/dashboard",
  requireAuth,
  handle((_req, res) => {
    const base = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM empresas WHERE qtd_dividas > 0) AS totalEmpresas,
           (SELECT COUNT(*) FROM dividas WHERE ativa = 1) AS totalDividas,
           (SELECT COALESCE(SUM(valor_total), 0) FROM empresas) AS valorTotal,
           (SELECT COUNT(*) FROM empresas WHERE enriched_at IS NOT NULL) AS empresasEnriquecidas,
           (SELECT COUNT(*) FROM usuarios WHERE status = 'pendente') AS usuariosPendentes,
           (SELECT novas_empresas FROM sincronizacoes WHERE status = 'completed' ORDER BY id DESC LIMIT 1) AS novasEmpresasUltimaSync`
      )
      .get() as Record<string, number | null>;

    const porNatureza = db
      .prepare(
        `SELECT natureza_divida AS natureza, COUNT(*) AS qtd, COALESCE(SUM(valor_consolidado), 0) AS valor
         FROM dividas WHERE ativa = 1 GROUP BY natureza_divida ORDER BY valor DESC`
      )
      .all() as DashboardMetrics["porNatureza"];

    const porUf = db
      .prepare(
        `SELECT uf, COUNT(*) AS qtd FROM empresas
         WHERE qtd_dividas > 0 AND uf IS NOT NULL AND uf != ''
         GROUP BY uf ORDER BY qtd DESC LIMIT 10`
      )
      .all() as DashboardMetrics["porUf"];

    const metrics: DashboardMetrics = {
      totalEmpresas: base.totalEmpresas || 0,
      totalDividas: base.totalDividas || 0,
      valorTotal: base.valorTotal || 0,
      novasEmpresasUltimaSync: base.novasEmpresasUltimaSync || 0,
      empresasEnriquecidas: base.empresasEnriquecidas || 0,
      usuariosPendentes: base.usuariosPendentes || 0,
      ultimaSincronizacao: getConfig("ultima_sincronizacao"),
      proximaExecucao: proximaExecucao(),
      porNatureza,
      porUf,
    };
    res.json(metrics);
  })
);
