/**
 * Consultas de empresas devedoras com filtros e paginação.
 */
import { db, ftsDisponivel } from "../db";
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

// Teto da contagem: acima disso a interface mostra "N+" em vez de varrer tudo
const CAP_CONTAGEM = 10000;

/**
 * Monta a consulta MATCH do FTS trigram: cada palavra vira uma frase que casa
 * com QUALQUER trecho do nome ("adari" encontra "PADARIA"). O trigram exige
 * termos com 3+ caracteres; havendo algum termo menor, retorna null e a busca
 * cai no modo tradicional.
 */
function montarConsultaFts(termo: string): string | null {
  const semAcento = termo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tokens = semAcento.match(/[A-Za-z0-9]+/g);
  if (!tokens || tokens.length === 0) return null;
  if (tokens.some((t) => t.length < 3)) return null;
  return tokens.map((t) => `"${t}"`).join(" AND ");
}

function montarWhere(
  filtro: EmpresasFiltro,
  ultimaSyncId: number | null,
  modoBusca: "fts" | "like" = ftsDisponivel ? "fts" : "like"
): WhereBuild {
  const conds: string[] = ["e.qtd_dividas > 0"];
  const params: Record<string, unknown> = {};

  if (filtro.busca?.trim()) {
    const termo = filtro.busca.trim();
    const somenteDigitos = termo.replace(/\D/g, "");
    const consultaFts = modoBusca === "fts" ? montarConsultaFts(termo) : null;
    if (somenteDigitos.length >= 8 && somenteDigitos.length === termo.replace(/[.\-/\s]/g, "").length) {
      // Parece um CNPJ: busca por faixa de prefixo (usa a chave primária,
      // instantanea; LIKE nao aproveitaria o indice)
      conds.push("e.cnpj >= @cnpjIni AND e.cnpj <= @cnpjFim");
      params.cnpjIni = somenteDigitos.padEnd(14, "0");
      params.cnpjFim = somenteDigitos.padEnd(14, "9");
    } else if (consultaFts) {
      // Busca por nome via indice de texto (quase instantanea em bases grandes)
      conds.push("e.rowid IN (SELECT rowid FROM empresas_fts WHERE empresas_fts MATCH @ftsQuery)");
      params.ftsQuery = consultaFts;
    } else {
      // Nome: os nomes da PGFN vêm sem acento; busca também a variante sem
      // acentos para "construção" encontrar "CONSTRUCAO"
      const semAcento = termo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      conds.push("(e.razao_social LIKE @busca OR e.razao_social LIKE @buscaSemAcento)");
      params.busca = `%${termo}%`;
      params.buscaSemAcento = `%${semAcento}%`;
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
  if (filtro.trimestreEntrada) {
    // Apurado pelo comparativo (ou pelas sincronizações seguintes à carga inicial)
    conds.push("e.entrou_na_base_em = @trimestreEntrada");
    params.trimestreEntrada = filtro.trimestreEntrada;
  }
  // Recência pela data OFICIAL de inscrição da dívida mais recente da empresa
  if (filtro.inscricaoDe) {
    conds.push("e.data_inscricao_mais_recente >= @inscricaoDe");
    params.inscricaoDe = filtro.inscricaoDe;
  }
  if (filtro.inscricaoAte) {
    conds.push("e.data_inscricao_mais_recente <= @inscricaoAte");
    params.inscricaoAte = filtro.inscricaoAte;
  }
  if (filtro.esfera) {
    // esferas guarda valores distintos separados por vírgula ("federal,estadual")
    conds.push("e.esferas LIKE @esfera");
    params.esfera = `%${filtro.esfera}%`;
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
  // O formato "AAAA_trimestre_0N" ordena cronologicamente como texto
  entrouNaBaseEm: "e.entrou_na_base_em",
  enrichedAt: "e.enriched_at",
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
    esferas: ((row.esferas as string) || "").split(",").join(", "),
    qtdDividas: row.qtd_dividas as number,
    valorTotal: row.valor_total as number,
    dataInscricaoMaisAntiga: row.data_inscricao_mais_antiga as string | null,
    dataInscricaoMaisRecente: row.data_inscricao_mais_recente as string | null,
    dataPrimeiraDeteccao: row.data_primeira_deteccao as string,
    isNova: row.is_nova === 1,
    entrouNaBaseEm: (row.entrou_na_base_em as string | null) ?? null,
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

function consultarPagina(
  filtro: EmpresasFiltro,
  ultimaSyncId: number | null,
  modoBusca: "fts" | "like"
): PaginatedEmpresas {
  const { sql: where, params } = montarWhere(filtro, ultimaSyncId, modoBusca);

  const page = Math.max(1, filtro.page || 1);
  const pageSize = Math.min(200, Math.max(1, filtro.pageSize || 25));
  const orderCol = ORDER_COLS[filtro.orderBy || "valorTotal"] || "e.valor_total";
  const orderDir = filtro.orderDir === "asc" ? "ASC" : "DESC";

  // Contar TODAS as linhas de um filtro (ex.: uma natureza) varre milhões de
  // registros e é o que deixava a pesquisa lenta. Contamos só até um teto: se
  // passar dele, a interface mostra "10.000+" — o que é suficiente, já que
  // ninguém pagina até a página 400. Filtros que retornam pouco continuam
  // exibindo o total exato.
  const bruto = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM empresas e WHERE ${where} LIMIT ${CAP_CONTAGEM + 1})`)
      .get(params) as { n: number }
  ).n;
  const totalAproximado = bruto > CAP_CONTAGEM;
  const total = totalAproximado ? CAP_CONTAGEM : bruto;

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

  return { items: rows.map(mapEmpresa), total, page, pageSize, totalAproximado };
}

export function listarEmpresas(filtro: EmpresasFiltro): PaginatedEmpresas {
  const ultimaSyncId = ultimaSyncConcluidaId();
  // O trigram cobre trechos no meio da palavra; termos muito curtos (<3
  // caracteres) caem automaticamente no modo tradicional dentro do montarWhere
  return consultarPagina(filtro, ultimaSyncId, ftsDisponivel ? "fts" : "like");
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

/**
 * CNPJs que casam com o filtro, para enriquecimento em massa.
 * Por padrão só as ainda não enriquecidas. Teto de segurança de 20.000.
 */
export function listarCnpjsParaEnriquecimento(
  filtro: EmpresasFiltro,
  incluirJaEnriquecidas = false
): string[] {
  const ultimaSyncId = ultimaSyncConcluidaId();
  const { sql: where, params } = montarWhere(filtro, ultimaSyncId);
  const extra = incluirJaEnriquecidas ? "" : " AND e.enriched_at IS NULL";
  const rows = db
    .prepare(`SELECT e.cnpj FROM empresas e WHERE ${where}${extra} ORDER BY e.valor_total DESC LIMIT 20001`)
    .all(params) as { cnpj: string }[];
  if (rows.length > 20000) {
    throw new Error(
      "A pesquisa tem mais de 20.000 empresas para enriquecer. Refine os filtros (ex.: valor mínimo ou estado) e tente novamente."
    );
  }
  return rows.map((r) => r.cnpj);
}

/** Trimestres de entrada distintos (para popular o filtro), do mais recente ao mais antigo. */
export function listarTrimestresEntrada(): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT entrou_na_base_em AS t FROM empresas
       WHERE entrou_na_base_em IS NOT NULL AND qtd_dividas > 0
       ORDER BY entrou_na_base_em DESC`
    )
    .all() as { t: string }[];
  return rows.map((r) => r.t);
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
