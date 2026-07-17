/**
 * Rotas da API REST.
 */
import { Router, type Response } from "express";
import { db, getConfig, resetarDadosPGFN } from "./db";
import {
  alterarPropriaSenha,
  AuthRequest,
  HttpError,
  login,
  redefinirSenha,
  registrar,
  requireAdmin,
  requireAuth,
  toUsuario,
} from "./auth";
import {
  buscarEmpresa,
  listarCnpjsParaEnriquecimento,
  listarEmpresas,
  listarEnriquecidas,
  listarParaExportacao,
  listarTrimestresEntrada,
} from "./services/empresas";
import {
  executarSincronizacao,
  isSincronizando,
  listarSincronizacoes,
} from "./services/pgfn-sync";
import { atualizarConfigCron, proximaExecucao } from "./services/cron";
import { executarComparativo, getComparativoStatus, isComparando } from "./services/comparativo";
import {
  executarSincronizacaoFonte,
  isSincronizandoEstadual,
  listarFontesStatus,
} from "./services/estaduais";
import { getEnriquecimentoStatus, iniciarEnriquecimento } from "./services/enrichment";
import { gerarExcel } from "./services/excel";
import { gerarCsv, gerarPdf, PDF_MAX_LINHAS } from "./services/export-formats";
import type { DashboardMetrics, EmpresasFiltro, SyncConfig } from "../shared/types";

export const api = Router();

// Usado pelos serviços de hospedagem para verificar que o app está no ar.
// "versao" é o commit instalado (definido pelo inicializador desktop).
api.get("/health", (_req, res) => {
  res.json({ ok: true, versao: (process.env.APP_VERSAO || "").slice(0, 7) || null });
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

api.post(
  "/auth/alterar-senha",
  requireAuth,
  handle((req, res) => {
    const { senhaAtual, novaSenha } = req.body || {};
    alterarPropriaSenha(req.usuario!.id, String(senhaAtual || ""), String(novaSenha || ""));
    res.json({ ok: true });
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

api.post(
  "/usuarios/:id/senha",
  requireAuth,
  requireAdmin,
  handle((req, res) => {
    const { novaSenha } = req.body || {};
    redefinirSenha(Number(req.params.id), String(novaSenha || ""));
    res.json({ ok: true });
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
    trimestreEntrada: query.trimestreEntrada ? String(query.trimestreEntrada) : undefined,
    inscricaoDe: query.inscricaoDe ? String(query.inscricaoDe) : undefined,
    inscricaoAte: query.inscricaoAte ? String(query.inscricaoAte) : undefined,
    esfera:
      query.esfera === "federal" || query.esfera === "estadual"
        ? (query.esfera as "federal" | "estadual")
        : undefined,
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

// Registrada antes de /empresas/:cnpj para a rota específica ter prioridade
api.get(
  "/empresas-meta/trimestres-entrada",
  requireAuth,
  handle((_req, res) => {
    res.json({ trimestres: listarTrimestresEntrada() });
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

// Enriquece TODAS as empresas que casam com o filtro atual da pesquisa
api.post(
  "/enriquecimento/filtro",
  requireAuth,
  handle((req, res) => {
    const { filtro, incluirJaEnriquecidas } = req.body || {};
    const cnpjs = listarCnpjsParaEnriquecimento(
      parseFiltro(filtro || {}),
      incluirJaEnriquecidas === true
    );
    if (cnpjs.length === 0) {
      throw new HttpError(400, "Nenhuma empresa para enriquecer nesta pesquisa (talvez todas já estejam enriquecidas).");
    }
    res.json({ status: iniciarEnriquecimento(cnpjs, req.usuario!.id) });
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
    if (isSincronizandoEstadual()) {
      throw new HttpError(409, "Há uma sincronização estadual em andamento. Aguarde a conclusão.");
    }
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

// Zera os dados de sincronização para recomeçar do zero (mantém usuários)
api.post(
  "/sync/reset",
  requireAuth,
  requireAdmin,
  handle((_req, res) => {
    if (isSincronizando() || isComparando()) {
      throw new HttpError(409, "Aguarde a sincronização/comparativo em andamento terminar.");
    }
    resetarDadosPGFN();
    res.json({ ok: true });
  })
);

// ---------- Fontes estaduais ----------

api.get(
  "/fontes",
  requireAuth,
  handle((_req, res) => {
    res.json({ fontes: listarFontesStatus() });
  })
);

api.post(
  "/fontes/:id/sincronizar",
  requireAuth,
  handle((req, res) => {
    if (isSincronizando()) throw new HttpError(409, "Aguarde a sincronização federal terminar.");
    if (isSincronizandoEstadual()) {
      throw new HttpError(409, "Já existe uma sincronização estadual em andamento.");
    }
    const forcar = (req.body || {}).forcar === true;
    const fonteId = String(req.params.id);
    // Dispara em segundo plano; o acompanhamento é feito pelo histórico
    executarSincronizacaoFonte(fonteId, "manual", forcar).catch((err) =>
      console.error(`[Sync ${fonteId}] Erro:`, err instanceof Error ? err.message : err)
    );
    res.status(202).json({ ok: true });
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
  "/export/:formato",
  requireAuth,
  handle(async (req, res) => {
    const formato = String(req.params.formato).toLowerCase();
    if (!["excel", "csv", "pdf"].includes(formato)) {
      throw new HttpError(400, "Formato inválido. Use excel, csv ou pdf.");
    }
    const { filtro, cnpjs } = req.body || {};
    let empresas = listarParaExportacao(
      parseFiltro(filtro || {}),
      Array.isArray(cnpjs) && cnpjs.length > 0 ? cnpjs.map(String) : undefined
    );

    const dataStr = new Date().toISOString().slice(0, 10);
    const base = `devedores-pgfn-${dataStr}`;

    if (formato === "csv") {
      res
        .setHeader("Content-Type", "text/csv; charset=utf-8")
        .setHeader("Content-Disposition", `attachment; filename="${base}.csv"`)
        .send(gerarCsv(empresas));
      return;
    }
    if (formato === "pdf") {
      // PDF de milhares de páginas é inútil; limita e sinaliza no nome do arquivo
      const limitado = empresas.length > PDF_MAX_LINHAS;
      if (limitado) empresas = empresas.slice(0, PDF_MAX_LINHAS);
      const buffer = await gerarPdf(empresas);
      const nome = limitado ? `${base}-primeiras-${PDF_MAX_LINHAS}.pdf` : `${base}.pdf`;
      res
        .setHeader("Content-Type", "application/pdf")
        .setHeader("Content-Disposition", `attachment; filename="${nome}"`)
        .send(buffer);
      return;
    }
    // excel
    const buffer = await gerarExcel(empresas);
    res
      .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .setHeader("Content-Disposition", `attachment; filename="${base}.xlsx"`)
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
