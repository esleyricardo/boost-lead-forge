/**
 * Consultas de empresas devedoras com filtros e paginação.
 */
import { db } from "../db";
import type { Divida, Empresa, EmpresasFiltro, PaginatedEmpresas } from "../../shared/types";

function ultimaSyncConcluidaId(): number | null {
  const row = db
    .prepare("SELECT id FROM sincronizacoes WHERE status = 'completed' ORDER BY id DESC LIMIT 1")
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

interface WhereBuild {
  sql: string;
  params: Record<string, unknown>;
}

function montarWhere(filtro: EmpresasFiltro, ultimaSyncId: number | null): WhereBuild {
  const conds: string[] = ["e.qtd_dividas > 0"];
  const params: Record<string, unknown> = {};

  if (filtro.busca?.trim()) {
    const somenteDigitos = filtro.busca.replace(/\D/g, "");
    if (somenteDigitos.length >= 8 && somenteDigitos.length === filtro.busca.replace(/[.\-/\s]/g, "").length) {
      conds.push("e.cnpj LIKE @cnpjBusca");
      params.cnpjBusca = `${somenteDigitos}%`;
    } else {
      conds.push("e.razao_social LIKE @busca");
      params.busca = `%${filtro.busca.trim()}%`;
    }
  }
  if (filtro.natureza) {
    conds.push("e.naturezas LIKE @natureza");
    params.natureza = `%${filtro.natureza}%`;
  }
  if (filtro.uf) {
    conds.push("e.uf = @uf");
    params.uf = filtro.uf;
  }
  if (filtro.valorMin != null) {
    conds.push("e.valor_total >= @valorMin");
    params.valorMin = filtro.valorMin;
  }
  if (filtro.valorMax != null) {
    conds.push("e.valor_total <= @valorMax");
    params.valorMax = filtro.valorMax;
  }
  if (filtro.apenasNovas && ultimaSyncId != null) {
    conds.push("e.primeira_sync_id = @ultimaSyncId");
    params.ultimaSyncId = ultimaSyncId;
  }
  if (filtro.enriquecidas === "sim") conds.push("e.enriched_at IS NOT NULL");
  if (filtro.enriquecidas === "nao") conds.push("e.enriched_at IS NULL");

  return { sql: conds.join(" AND "), params };
}

const ORDER_COLS: Record<string, string> = {
  valorTotal: "e.valor_total",
  dataInscricaoMaisRecente: "e.data_inscricao_mais_recente",
  dataPrimeiraDeteccao: "e.data_primeira_deteccao",
  razaoSocial: "e.razao_social",
};

const SELECT_EMPRESA = `
  SELECT e.*, u.nome AS enriched_by_nome,
         CASE WHEN e.primeira_sync_id = @ultimaSyncIdBadge THEN 1 ELSE 0 END AS is_nova
  FROM empresas e
  LEFT JOIN usuarios u ON u.id = e.enriched_by
`;

function mapEmpresa(row: Record<string, unknown>): Empresa {
  return {
    cnpj: row.cnpj as string,
    razaoSocial: row.razao_social as string,
    uf: row.uf as string | null,
    naturezas: ((row.naturezas as string) || "").split(",").join(", "),
    qtdDividas: row.qtd_dividas as number,
    valorTotal: row.valor_total as number,
    dataInscricaoMaisAntiga: row.data_inscricao_mais_antiga as string | null,
    dataInscricaoMaisRecente: row.data_inscricao_mais_recente as string | null,
    dataPrimeiraDeteccao: row.data_primeira_deteccao as string,
    isNova: row.is_nova === 1,
    telefones: row.telefones as string | null,
    email: row.email as string | null,
    socios: row.socios as string | null,
    municipio: row.municipio as string | null,
    cnaeDescricao: row.cnae_descricao as string | null,
    dataAberturaEmpresa: row.data_abertura_empresa as string | null,
    situacaoCadastral: row.situacao_cadastral as string | null,
    enrichedAt: row.enriched_at as string | null,
    enrichedByNome: row.enriched_by_nome as string | null,
  };
}

export function listarEmpresas(filtro: EmpresasFiltro): PaginatedEmpresas {
  const ultimaSyncId = ultimaSyncConcluidaId();
  const { sql: where, params } = montarWhere(filtro, ultimaSyncId);

  const page = Math.max(1, filtro.page || 1);
  const pageSize = Math.min(200, Math.max(1, filtro.pageSize || 25));
  const orderCol = ORDER_COLS[filtro.orderBy || "valorTotal"] || "e.valor_total";
  const orderDir = filtro.orderDir === "asc" ? "ASC" : "DESC";

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM empresas e WHERE ${where}`).get(params) as { n: number }
  ).n;

  const rows = db
    .prepare(
      `${SELECT_EMPRESA} WHERE ${where}
       ORDER BY ${orderCol} ${orderDir} NULLS LAST
       LIMIT @limit OFFSET @offset`
    )
    .all({
      ...params,
      ultimaSyncIdBadge: ultimaSyncId ?? -1,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }) as Record<string, unknown>[];

  return { items: rows.map(mapEmpresa), total, page, pageSize };
}

export function buscarEmpresa(cnpj: string): { empresa: Empresa; dividas: Divida[] } | null {
  const ultimaSyncId = ultimaSyncConcluidaId();
  const row = db
    .prepare(`${SELECT_EMPRESA} WHERE e.cnpj = @cnpj`)
    .get({ cnpj, ultimaSyncIdBadge: ultimaSyncId ?? -1 }) as Record<string, unknown> | undefined;
  if (!row) return null;

  const dividas = db
    .prepare(
      `SELECT id, cnpj, numero_inscricao, natureza_divida, receita_principal,
              situacao_inscricao, indicador_ajuizado, data_inscricao,
              valor_consolidado, data_primeira_deteccao, ativa
       FROM dividas WHERE cnpj = ? AND ativa = 1
       ORDER BY data_inscricao DESC`
    )
    .all(cnpj) as Record<string, unknown>[];

  return {
    empresa: mapEmpresa(row),
    dividas: dividas.map((d) => ({
      id: d.id as number,
      cnpj: d.cnpj as string,
      numeroInscricao: d.numero_inscricao as string,
      naturezaDivida: d.natureza_divida as string,
      receitaPrincipal: d.receita_principal as string | null,
      situacaoInscricao: d.situacao_inscricao as string | null,
      indicadorAjuizado: d.indicador_ajuizado as string | null,
      dataInscricao: d.data_inscricao as string | null,
      valorConsolidado: d.valor_consolidado as number,
      dataPrimeiraDeteccao: d.data_primeira_deteccao as string,
      ativa: d.ativa as number,
    })),
  };
}

/** Lista para exportação (sem paginação, com teto de segurança). */
export function listarParaExportacao(filtro: EmpresasFiltro, cnpjs?: string[]): Empresa[] {
  const ultimaSyncId = ultimaSyncConcluidaId();

  if (cnpjs && cnpjs.length > 0) {
    const placeholders = cnpjs.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT e.*, u.nome AS enriched_by_nome,
                CASE WHEN e.primeira_sync_id = ? THEN 1 ELSE 0 END AS is_nova
         FROM empresas e LEFT JOIN usuarios u ON u.id = e.enriched_by
         WHERE e.cnpj IN (${placeholders})
         ORDER BY e.valor_total DESC`
      )
      .all(ultimaSyncId ?? -1, ...cnpjs) as Record<string, unknown>[];
    return rows.map(mapEmpresa);
  }

  const { sql: where, params } = montarWhere(filtro, ultimaSyncId);
  const rows = db
    .prepare(
      `${SELECT_EMPRESA} WHERE ${where} ORDER BY e.valor_total DESC LIMIT 50000`
    )
    .all({ ...params, ultimaSyncIdBadge: ultimaSyncId ?? -1 }) as Record<string, unknown>[];
  return rows.map(mapEmpresa);
}

export function listarEnriquecidas(page: number, pageSize: number): PaginatedEmpresas {
  const ultimaSyncId = ultimaSyncConcluidaId();
  const total = (
    db.prepare("SELECT COUNT(*) AS n FROM empresas WHERE enriched_at IS NOT NULL").get() as { n: number }
  ).n;
  const rows = db
    .prepare(
      `${SELECT_EMPRESA} WHERE e.enriched_at IS NOT NULL
       ORDER BY e.enriched_at DESC LIMIT @limit OFFSET @offset`
    )
    .all({
      ultimaSyncIdBadge: ultimaSyncId ?? -1,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }) as Record<string, unknown>[];
  return { items: rows.map(mapEmpresa), total, page, pageSize };
}
