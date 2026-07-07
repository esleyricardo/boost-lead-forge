/**
 * Sincronização com os Dados Abertos da PGFN (dívida ativa da União).
 *
 * Melhorias em relação à versão original:
 *  - Captura o campo DATA_INSCRICAO do CSV — a data OFICIAL em que a dívida
 *    foi inscrita na Dívida Ativa — além de registrar a data em que o nosso
 *    sistema detectou a empresa/dívida pela primeira vez.
 *  - Deduplicação por NUMERO_INSCRICao (upsert): a base não é recriada a cada
 *    sincronização; dívidas novas são detectadas de verdade.
 *  - Descoberta automática do trimestre disponível (a PGFN publica com atraso).
 *  - Uma única passada processa os dois arquivos e todas as naturezas.
 */
import { parse } from "csv-parse";
import * as fs from "fs";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import unzipper from "unzipper";
import { db, getConfig, setConfig } from "../db";
import type { Sincronizacao } from "../../shared/types";

const PGFN_BASE = "https://dadosabertos.pgfn.gov.br";
const ARQUIVOS = ["Previdenciario", "Nao_Previdenciario"] as const;

let syncEmAndamento = false;

export function isSincronizando(): boolean {
  return syncEmAndamento;
}

// ---------- Trimestre ----------

/** Lista os últimos N trimestres no formato usado pela PGFN, do mais recente ao mais antigo. */
export function trimestresCandidatos(n = 6, ref = new Date()): string[] {
  let year = ref.getFullYear();
  let quarter = Math.ceil((ref.getMonth() + 1) / 3);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${year}_trimestre_0${quarter}`);
    quarter--;
    if (quarter === 0) {
      quarter = 4;
      year--;
    }
  }
  return out;
}

function urlArquivo(trimestre: string, arquivo: string): string {
  return `${PGFN_BASE}/${trimestre}/Dados_abertos_${arquivo}.zip`;
}

function headOk(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = https.request(url, { method: "HEAD", timeout: 20000 }, (res) => {
      res.resume();
      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        headOk(res.headers.location).then(resolve);
        return;
      }
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * "Impressão digital" de um arquivo da PGFN (data de modificação + tamanho),
 * obtida por uma requisição HEAD leve — sem baixar o arquivo. Serve para
 * saber se o arquivo mudou desde a última sincronização.
 */
function assinaturaArquivo(url: string, redirects = 0): Promise<string | null> {
  return new Promise((resolve) => {
    if (redirects > 5) return resolve(null);
    const req = https.request(url, { method: "HEAD", timeout: 20000 }, (res) => {
      res.resume();
      if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        assinaturaArquivo(res.headers.location, redirects + 1).then(resolve);
        return;
      }
      if (res.statusCode !== 200) return resolve(null);
      const lastModified = res.headers["last-modified"] || "";
      const contentLength = res.headers["content-length"] || "";
      resolve(`${lastModified}|${contentLength}`);
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/** Encontra o trimestre mais recente com dados publicados pela PGFN. */
export async function descobrirTrimestre(): Promise<string> {
  for (const t of trimestresCandidatos()) {
    if (await headOk(urlArquivo(t, "Previdenciario"))) return t;
  }
  throw new Error(
    "Não foi possível encontrar dados publicados pela PGFN nos últimos 6 trimestres. Verifique a conexão com dadosabertos.pgfn.gov.br."
  );
}

// ---------- Download / extração ----------

function downloadFile(url: string, destPath: string, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Muitos redirecionamentos ao baixar " + url));
    const file = fs.createWriteStream(destPath);
    https
      .get(url, { timeout: 60000 }, (response) => {
        if (
          response.statusCode &&
          [301, 302, 307, 308].includes(response.statusCode) &&
          response.headers.location
        ) {
          file.close();
          response.resume();
          downloadFile(response.headers.location, destPath, redirects + 1).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          file.close();
          response.resume();
          reject(new Error(`HTTP ${response.statusCode} ao baixar ${url}`));
          return;
        }
        response.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

async function extrairZip(zipPath: string, extractDir: string): Promise<string[]> {
  const directory = await unzipper.Open.file(zipPath);
  const csvs: string[] = [];
  for (const entry of directory.files) {
    if (entry.type !== "File" || !entry.path.toLowerCase().endsWith(".csv")) continue;
    const dest = path.join(extractDir, path.basename(entry.path));
    await new Promise<void>((resolve, reject) => {
      entry
        .stream()
        .pipe(fs.createWriteStream(dest))
        .on("finish", () => resolve())
        .on("error", reject);
    });
    csvs.push(dest);
  }
  return csvs;
}

// ---------- Parse ----------

export function mapNatureza(receitaPrincipal: string, arquivo: string): string {
  if (arquivo === "Previdenciario") return "Tributário Previdenciário";
  const receita = (receitaPrincipal || "").toUpperCase();
  if (receita.includes("SIMPLES")) return "Tributário Simples Nacional";
  return "Tributário Demais Débitos";
}

/** Converte "DD/MM/AAAA" (formato PGFN) para "AAAA-MM-DD"; retorna null se inválida. */
export function normalizarData(valor: string | undefined): string | null {
  if (!valor) return null;
  const v = valor.trim();
  let m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function parseValor(valorStr: string | undefined): number {
  if (!valorStr) return 0;
  const v = valorStr.trim();
  // Formato brasileiro: 1.234.567,89
  if (v.includes(",")) return parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(v) || 0;
}

export interface LinhaDivida {
  numeroInscricao: string;
  cnpj: string;
  nomeDevedor: string;
  uf: string | null;
  naturezaDivida: string;
  receitaPrincipal: string | null;
  situacaoInscricao: string | null;
  indicadorAjuizado: string | null;
  dataInscricao: string | null;
  valorConsolidado: number;
}

/** Normaliza uma linha bruta do CSV da PGFN. Retorna null para linhas fora do escopo (PF, situação não ativa). */
export function normalizarLinha(record: Record<string, string>, arquivo: string): LinhaDivida | null {
  const row: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    const k = key
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");
    row[k] = record[key];
  }

  // Apenas pessoas jurídicas (CNPJ com 14 dígitos)
  const cnpj = (row.cpf_cnpj || row.cnpj || "").replace(/\D/g, "");
  if (cnpj.length !== 14) return null;

  // Apenas inscrições em situação ativa / em cobrança
  const situacao = `${row.tipo_situacao_inscricao || ""} ${row.situacao_inscricao || ""}`
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (situacao && !situacao.includes("ATIVA") && !situacao.includes("ATIVO") && !situacao.includes("COBRANCA")) {
    return null;
  }

  const numeroInscricao = (row.numero_inscricao || "").trim();
  if (!numeroInscricao) return null;

  return {
    numeroInscricao,
    cnpj,
    nomeDevedor: (row.nome_devedor || row.razao_social || "").substring(0, 512),
    uf: (row.uf_devedor || row.uf_unidade_responsavel || row.uf || "").substring(0, 2) || null,
    naturezaDivida: mapNatureza(row.receita_principal || "", arquivo),
    receitaPrincipal: row.receita_principal || null,
    situacaoInscricao: row.situacao_inscricao || row.tipo_situacao_inscricao || null,
    indicadorAjuizado: row.indicador_ajuizado || null,
    dataInscricao: normalizarData(row.data_inscricao),
    valorConsolidado: parseValor(row.valor_consolidado),
  };
}

// ---------- Persistência ----------

const upsertDividaStmt = db.prepare(`
  INSERT INTO dividas (
    numero_inscricao, cnpj, nome_devedor, uf, natureza_divida, receita_principal,
    situacao_inscricao, indicador_ajuizado, data_inscricao, valor_consolidado,
    data_primeira_deteccao, primeira_sync_id, ultima_sync_id, ativa
  ) VALUES (
    @numeroInscricao, @cnpj, @nomeDevedor, @uf, @naturezaDivida, @receitaPrincipal,
    @situacaoInscricao, @indicadorAjuizado, @dataInscricao, @valorConsolidado,
    datetime('now'), @syncId, @syncId, 1
  )
  ON CONFLICT(numero_inscricao) DO UPDATE SET
    nome_devedor = excluded.nome_devedor,
    uf = excluded.uf,
    natureza_divida = excluded.natureza_divida,
    receita_principal = excluded.receita_principal,
    situacao_inscricao = excluded.situacao_inscricao,
    indicador_ajuizado = excluded.indicador_ajuizado,
    data_inscricao = COALESCE(excluded.data_inscricao, dividas.data_inscricao),
    valor_consolidado = excluded.valor_consolidado,
    ultima_sync_id = excluded.ultima_sync_id,
    ativa = 1
`);

export function inserirLote(linhas: LinhaDivida[], syncId: number): void {
  const tx = db.transaction((rows: LinhaDivida[]) => {
    for (const r of rows) upsertDividaStmt.run({ ...r, syncId });
  });
  tx(linhas);
}

/** Recalcula a tabela de empresas a partir das dívidas ativas. */
export function consolidarEmpresas(syncId: number): void {
  // Dívidas que sumiram da base da PGFN deixam de contar como ativas
  db.prepare("UPDATE dividas SET ativa = CASE WHEN ultima_sync_id = ? THEN 1 ELSE 0 END").run(syncId);

  db.prepare(
    `INSERT INTO empresas (
       cnpj, razao_social, uf, naturezas, qtd_dividas, valor_total,
       data_inscricao_mais_antiga, data_inscricao_mais_recente,
       data_primeira_deteccao, primeira_sync_id
     )
     SELECT
       d.cnpj,
       MAX(d.nome_devedor),
       MAX(d.uf),
       (SELECT GROUP_CONCAT(DISTINCT natureza_divida) FROM dividas d2 WHERE d2.cnpj = d.cnpj AND d2.ativa = 1),
       COUNT(*),
       SUM(d.valor_consolidado),
       MIN(d.data_inscricao),
       MAX(d.data_inscricao),
       datetime('now'),
       @syncId
     FROM dividas d
     WHERE d.ativa = 1
     GROUP BY d.cnpj
     ON CONFLICT(cnpj) DO UPDATE SET
       razao_social = excluded.razao_social,
       uf = excluded.uf,
       naturezas = excluded.naturezas,
       qtd_dividas = excluded.qtd_dividas,
       valor_total = excluded.valor_total,
       data_inscricao_mais_antiga = excluded.data_inscricao_mais_antiga,
       data_inscricao_mais_recente = excluded.data_inscricao_mais_recente`
  ).run({ syncId });

  // Empresas cujas dívidas todas saíram da base: zera contadores mas mantém o histórico
  db.prepare(
    `UPDATE empresas SET qtd_dividas = 0, valor_total = 0
     WHERE cnpj NOT IN (SELECT DISTINCT cnpj FROM dividas WHERE ativa = 1)`
  ).run();
}

// ---------- Orquestração ----------

function atualizarProgresso(syncId: number, msg: string): void {
  console.log(`[Sync ${syncId}] ${msg}`);
  db.prepare("UPDATE sincronizacoes SET progresso = ? WHERE id = ?").run(msg, syncId);
}

async function processarCsv(
  csvFile: string,
  arquivo: string,
  syncId: number,
  onLote: (qtd: number) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    let total = 0;
    let batch: LinhaDivida[] = [];
    const BATCH_SIZE = 2000;

    const parser = parse({
      delimiter: ";",
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    });

    parser.on("readable", () => {
      let record: Record<string, string>;
      while ((record = parser.read()) !== null) {
        const linha = normalizarLinha(record, arquivo);
        if (!linha) continue;
        batch.push(linha);
        total++;
        if (batch.length >= BATCH_SIZE) {
          inserirLote(batch, syncId);
          onLote(total);
          batch = [];
        }
      }
    });
    parser.on("end", () => {
      if (batch.length > 0) inserirLote(batch, syncId);
      resolve(total);
    });
    parser.on("error", reject);

    fs.createReadStream(csvFile, { encoding: "latin1" }).pipe(parser);
  });
}

export async function executarSincronizacao(
  disparo: "manual" | "automatica",
  forcar = false
): Promise<Sincronizacao> {
  if (syncEmAndamento) {
    throw new Error("Já existe uma sincronização em andamento. Aguarde a conclusão.");
  }
  syncEmAndamento = true;

  const result = db
    .prepare("INSERT INTO sincronizacoes (status, disparo) VALUES ('running', ?)")
    .run(disparo);
  const syncId = result.lastInsertRowid as number;

  const dividasAntes = (db.prepare("SELECT COUNT(*) AS n FROM dividas").get() as { n: number }).n;
  const empresasAntes = (db.prepare("SELECT COUNT(*) AS n FROM empresas").get() as { n: number }).n;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pgfn-sync-"));

  try {
    atualizarProgresso(syncId, "Verificando trimestre disponível na PGFN...");
    const trimestre = await descobrirTrimestre();
    db.prepare("UPDATE sincronizacoes SET trimestre_referencia = ? WHERE id = ?").run(trimestre, syncId);

    // Verificação leve: a PGFN publica os dados de forma TRIMESTRAL, não diária.
    // Antes de baixar (o que leva horas), consultamos só o "cabeçalho" dos arquivos
    // para ver se algo mudou desde a última vez. Se não mudou, encerramos em segundos.
    atualizarProgresso(syncId, "Verificando se há atualização nova na PGFN...");
    const partes: string[] = [];
    for (const arquivo of ARQUIVOS) {
      const a = await assinaturaArquivo(urlArquivo(trimestre, arquivo));
      partes.push(`${arquivo}:${a ?? "?"}`);
    }
    const assinaturaAtual = `${trimestre}|${partes.join("|")}`;
    const assinaturaAnterior = getConfig("assinatura_pgfn");

    if (!forcar && dividasAntes > 0 && assinaturaAtual === assinaturaAnterior) {
      const vivos = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM dividas WHERE ativa = 1) AS d,
                  (SELECT COUNT(*) FROM empresas WHERE qtd_dividas > 0) AS e`
        )
        .get() as { d: number; e: number };
      db.prepare(
        `UPDATE sincronizacoes SET
           status = 'completed', total_dividas = ?, total_empresas = ?,
           novas_dividas = 0, novas_empresas = 0, progresso = ?, concluida_em = datetime('now')
         WHERE id = ?`
      ).run(
        vivos.d,
        vivos.e,
        `Sem novidades: a base da PGFN (${trimestre}) não mudou desde a última sincronização. Nada foi baixado.`,
        syncId
      );
      setConfig("ultima_sincronizacao", new Date().toISOString());
      return getSincronizacao(syncId)!;
    }

    let totalLinhas = 0;
    for (const arquivo of ARQUIVOS) {
      const url = urlArquivo(trimestre, arquivo);
      const zipPath = path.join(tmpDir, `${arquivo}.zip`);
      const extractDir = path.join(tmpDir, arquivo);
      fs.mkdirSync(extractDir, { recursive: true });

      atualizarProgresso(syncId, `Baixando ${arquivo} (${trimestre})... Este arquivo é grande, aguarde.`);
      await downloadFile(url, zipPath);

      atualizarProgresso(syncId, `Extraindo ${arquivo}...`);
      const csvs = await extrairZip(zipPath, extractDir);
      fs.rmSync(zipPath, { force: true });

      for (let i = 0; i < csvs.length; i++) {
        const nomeCsv = path.basename(csvs[i]);
        atualizarProgresso(syncId, `Processando ${arquivo} — ${nomeCsv} (${i + 1}/${csvs.length})...`);
        totalLinhas += await processarCsv(csvs[i], arquivo, syncId, (qtd) => {
          if (qtd % 50000 < 2000) {
            atualizarProgresso(syncId, `Processando ${arquivo} — ${nomeCsv}: ${(totalLinhas + qtd).toLocaleString("pt-BR")} dívidas importadas...`);
          }
        });
        fs.rmSync(csvs[i], { force: true });
      }
      fs.rmSync(extractDir, { recursive: true, force: true });
    }

    atualizarProgresso(syncId, "Consolidando dados por empresa...");
    consolidarEmpresas(syncId);

    const stats = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM dividas WHERE ativa = 1) AS totalDividas,
           (SELECT COUNT(*) FROM empresas WHERE qtd_dividas > 0) AS totalEmpresas,
           (SELECT COUNT(*) FROM dividas WHERE primeira_sync_id = @syncId) AS novasDividas,
           (SELECT COUNT(*) FROM empresas WHERE primeira_sync_id = @syncId) AS novasEmpresas`
      )
      .get({ syncId }) as { totalDividas: number; totalEmpresas: number; novasDividas: number; novasEmpresas: number };

    db.prepare(
      `UPDATE sincronizacoes SET
         status = 'completed',
         total_dividas = ?, total_empresas = ?, novas_dividas = ?, novas_empresas = ?,
         progresso = ?, concluida_em = datetime('now')
       WHERE id = ?`
    ).run(
      stats.totalDividas,
      stats.totalEmpresas,
      dividasAntes === 0 ? 0 : stats.novasDividas, // na 1ª carga tudo é "novo"; não faz sentido contar
      empresasAntes === 0 ? 0 : stats.novasEmpresas,
      `Concluída: ${totalLinhas.toLocaleString("pt-BR")} dívidas processadas.`,
      syncId
    );

    setConfig("assinatura_pgfn", assinaturaAtual);
    setConfig("ultima_sincronizacao", new Date().toISOString());
    return getSincronizacao(syncId)!;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    db.prepare(
      "UPDATE sincronizacoes SET status = 'error', error_message = ?, concluida_em = datetime('now') WHERE id = ?"
    ).run(msg, syncId);
    throw error;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    syncEmAndamento = false;
  }
}

export function getSincronizacao(id: number): Sincronizacao | null {
  const row = db.prepare("SELECT * FROM sincronizacoes WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return row ? mapSync(row) : null;
}

export function listarSincronizacoes(limit = 30): Sincronizacao[] {
  const rows = db
    .prepare("SELECT * FROM sincronizacoes ORDER BY id DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.map(mapSync);
}

function mapSync(row: Record<string, unknown>): Sincronizacao {
  return {
    id: row.id as number,
    status: row.status as Sincronizacao["status"],
    trimestreReferencia: row.trimestre_referencia as string | null,
    totalDividas: row.total_dividas as number,
    totalEmpresas: row.total_empresas as number,
    novasEmpresas: row.novas_empresas as number,
    novasDividas: row.novas_dividas as number,
    progresso: row.progresso as string | null,
    errorMessage: row.error_message as string | null,
    iniciadaEm: row.iniciada_em as string,
    concluidaEm: row.concluida_em as string | null,
    disparo: row.disparo as Sincronizacao["disparo"],
  };
}
