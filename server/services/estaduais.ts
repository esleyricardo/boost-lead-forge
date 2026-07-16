/**
 * Dívida ativa ESTADUAL — conectores por fonte (uma PGE/Sefaz por estado).
 *
 * Diferente da PGFN (base única nacional), cada estado publica seus dados
 * de um jeito. Cada conector sabe DESCOBRIR o arquivo mais recente da sua
 * fonte e o pipeline comum baixa, interpreta (mapeamento tolerante de
 * colunas), grava com origem/esfera próprias e consolida por empresa.
 *
 * Sincronização precisa e rápida: antes de baixar, compara a "assinatura"
 * do arquivo publicado (URL + data de modificação) com a da última carga —
 * se nada mudou, encerra em segundos. A checagem roda no cron diário; as
 * fontes publicam tipicamente uma vez por mês.
 */
import { parse } from "csv-parse";
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";
import { db, getConfig, setConfig } from "../db";
import {
  consolidarEmpresas,
  extrairZip,
  inserirLote,
  isSincronizando,
  normalizarData,
  parseValor,
  type LinhaDivida,
} from "./pgfn-sync";
import type { FonteEstadualStatus, Sincronizacao } from "../../shared/types";

// Vários portais estaduais recusam requisições sem cara de navegador
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface FonteEstadual {
  id: string;
  nome: string;
  uf: string;
  atualizacao: string;
  /** Encontra o arquivo mais recente publicado: URL + assinatura de versão. */
  descobrirArquivo(): Promise<{ url: string; assinatura: string; formato: "csv" | "xlsx" | "zip" }>;
}

// ---------- HTTP com User-Agent (portais estaduais exigem) ----------

function clienteDe(url: string) {
  return url.startsWith("http:") ? http : https;
}

function baixarTexto(url: string, redirects = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Muitos redirecionamentos: " + url));
    const req = clienteDe(url).get(
      url,
      { timeout: 60000, headers: { "User-Agent": USER_AGENT, Accept: "*/*" } },
      (res) => {
        if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          resolve(baixarTexto(new URL(res.headers.location, url).toString(), redirects + 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} em ${url}`));
          return;
        }
        const pedacos: Buffer[] = [];
        res.on("data", (c: Buffer) => pedacos.push(c));
        res.on("end", () => resolve(Buffer.concat(pedacos).toString("utf8")));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado em " + url)));
  });
}

export function baixarArquivoComUA(url: string, destino: string, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Muitos redirecionamentos: " + url));
    const arquivo = fs.createWriteStream(destino);
    const req = clienteDe(url).get(
      url,
      { timeout: 120000, headers: { "User-Agent": USER_AGENT, Accept: "*/*" } },
      (res) => {
        if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          arquivo.close();
          res.resume();
          baixarArquivoComUA(new URL(res.headers.location, url).toString(), destino, redirects + 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          arquivo.close();
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} ao baixar ${url}`));
          return;
        }
        res.pipe(arquivo);
        arquivo.on("finish", () => arquivo.close(() => resolve()));
        arquivo.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`Download travado: ${url}`)));
  });
}

function assinaturaHead(url: string, redirects = 0): Promise<string | null> {
  return new Promise((resolve) => {
    if (redirects > 5) return resolve(null);
    const req = clienteDe(url).request(
      url,
      { method: "HEAD", timeout: 20000, headers: { "User-Agent": USER_AGENT } },
      (res) => {
        res.resume();
        if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          assinaturaHead(new URL(res.headers.location, url).toString(), redirects + 1).then(resolve);
          return;
        }
        if (res.statusCode !== 200) return resolve(null);
        resolve(`${res.headers["last-modified"] || ""}|${res.headers["content-length"] || ""}`);
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

// ---------- Descoberta via CKAN (padrão dos portais de dados abertos) ----------

interface RecursoCkan {
  url: string;
  format?: string;
  name?: string;
  last_modified?: string;
  created?: string;
}

async function descobrirViaCkan(
  apiUrl: string,
  filtroNome: RegExp | null
): Promise<{ url: string; assinatura: string; formato: "csv" | "xlsx" | "zip" }> {
  const corpo = await baixarTexto(apiUrl);
  const json = JSON.parse(corpo) as { success: boolean; result?: { resources?: RecursoCkan[] } };
  const recursos = json.result?.resources || [];

  const candidatos = recursos
    .map((r) => ({
      ...r,
      formato: (r.format || "").toLowerCase(),
      quando: r.last_modified || r.created || "",
    }))
    .filter((r) => ["csv", "xlsx", "zip"].includes(r.formato))
    .filter((r) => !filtroNome || filtroNome.test(`${r.name || ""} ${r.url}`))
    .sort((a, b) => (a.quando < b.quando ? 1 : -1));

  if (candidatos.length === 0) {
    const nomes = recursos.map((r) => `${r.name} (${r.format})`).join("; ");
    throw new Error(
      `Nenhum arquivo CSV/XLSX encontrado no portal. Recursos disponíveis: ${nomes || "nenhum"}. ` +
        `O portal pode ter mudado — me envie esta mensagem.`
    );
  }
  const escolhido = candidatos[0];
  return {
    url: escolhido.url,
    assinatura: `${escolhido.url}|${escolhido.quando}`,
    formato: escolhido.formato as "csv" | "xlsx" | "zip",
  };
}

// ---------- As fontes ----------

export const FONTES_ESTADUAIS: FonteEstadual[] = [
  {
    id: "PGE-GO",
    nome: "Goiás — Dívida Ativa Estadual",
    uf: "GO",
    atualizacao: "mensal",
    descobrirArquivo: () =>
      descobrirViaCkan(
        "https://dadosabertos.go.gov.br/api/3/action/package_show?id=f19ca740-fa9f-420f-9fd4-6b4607d30138",
        /devedor/i
      ),
  },
  {
    id: "PGE-SP",
    nome: "São Paulo — Dívida Ativa Estadual",
    uf: "SP",
    atualizacao: "mensal",
    descobrirArquivo: () =>
      descobrirViaCkan(
        "https://dadosabertos.sp.gov.br/api/3/action/package_show?id=divida-ativa-do-estado-de-sao-paulo",
        null
      ),
  },
  {
    id: "PGE-RS",
    nome: "Rio Grande do Sul — Dívida Ativa Estadual",
    uf: "RS",
    atualizacao: "mensal",
    async descobrirArquivo() {
      // O portal de transparência do RS publica links diretos para CSV
      const pagina = await baixarTexto(
        "https://www.transparencia.rs.gov.br/receitas-do-estado/divida-ativa-lista-de-devedores/dados/"
      );
      const links = [...pagina.matchAll(/href="([^"]+\.(?:csv|zip|xlsx))"/gi)].map((m) => m[1]);
      if (links.length === 0) {
        throw new Error(
          "Não encontrei links de arquivo (CSV/ZIP) na página do RS. O portal pode ter mudado — me envie esta mensagem."
        );
      }
      // O mais recente costuma ser o primeiro/mais "alto" na ordenação por nome
      const url = new URL(links.sort().reverse()[0], "https://www.transparencia.rs.gov.br").toString();
      const assinatura = (await assinaturaHead(url)) || url;
      const ext = url.toLowerCase().endsWith(".zip") ? "zip" : url.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";
      return { url, assinatura: `${url}|${assinatura}`, formato: ext };
    },
  },
];

export function getFonte(id: string): FonteEstadual | undefined {
  return FONTES_ESTADUAIS.find((f) => f.id === id);
}

// ---------- Mapeamento tolerante de colunas ----------

function normalizarChave(k: string): string {
  return k
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[/.]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function primeiro(row: Record<string, string>, candidatos: string[]): string | undefined {
  for (const c of candidatos) {
    const v = row[c];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return undefined;
}

const CANDIDATOS = {
  documento: [
    "cpf_cnpj", "cnpj_cpf", "cnpj", "cpfcnpj", "nr_documento", "num_documento",
    "numero_documento", "nu_documento", "documento", "cd_documento",
    "cpf_cnpj_devedor", "cnpj_cpf_devedor", "doc_devedor", "identificacao",
  ],
  nome: [
    "nome_devedor", "razao_social", "nome", "devedor", "nome_razao_social",
    "interessado", "nome_interessado", "contribuinte", "nome_contribuinte",
    "nome_fantasia",
  ],
  valor: [
    "valor_consolidado", "valor_atualizado", "valor_total", "vl_total", "vl_saldo",
    "saldo_devedor", "saldo_atualizado", "vl_divida", "valor_divida", "montante",
    "vl_consolidado", "valor_saldo", "total_devido", "valor", "saldo",
  ],
  dataInscricao: [
    "data_inscricao", "dt_inscricao", "data_da_inscricao", "data_inscr", "dt_inscr",
    "data_de_inscricao", "ano_inscricao",
  ],
  cda: [
    "cda", "numero_cda", "num_cda", "nr_cda", "numero_da_cda", "certidao_divida_ativa",
    "numero_certidao", "nr_certidao", "num_certidao", "numero_inscricao", "n_cda", "no_cda",
  ],
  receita: ["tipo_divida", "natureza", "tributo", "receita", "tipo_debito", "origem_divida", "tipo"],
  situacao: ["situacao", "situacao_divida", "status", "fase", "fase_cobranca"],
};

export interface LinhaEstadualBruta {
  [chave: string]: string;
}

/**
 * Converte uma linha bruta de arquivo estadual em LinhaDivida.
 * Retorna null para linhas fora do escopo (sem CNPJ de 14 dígitos — pessoas
 * físicas ficam para uma etapa futura).
 */
export function mapearLinhaEstadual(
  registro: Record<string, string>,
  fonte: { id: string; uf: string }
): LinhaDivida | null {
  const row: Record<string, string> = {};
  for (const k of Object.keys(registro)) row[normalizarChave(k)] = registro[k];

  const doc = (primeiro(row, CANDIDATOS.documento) || "").replace(/\D/g, "");
  if (doc.length !== 14) return null; // só pessoas jurídicas nesta etapa

  const nome = (primeiro(row, CANDIDATOS.nome) || "").substring(0, 512);
  if (!nome) return null;

  const valor = parseValor(primeiro(row, CANDIDATOS.valor));
  const dataBruta = primeiro(row, CANDIDATOS.dataInscricao);
  // Alguns arquivos trazem só o ano de inscrição
  const data =
    normalizarData(dataBruta) || (dataBruta && /^\d{4}$/.test(dataBruta.trim()) ? `${dataBruta.trim()}-01-01` : null);

  const cda = (primeiro(row, CANDIDATOS.cda) || "").trim();
  // Chave estável para o upsert: CDA quando existe; senão uma linha agregada
  // por devedor nesta fonte (arquivos "lista de devedores" têm 1 linha/devedor)
  const numeroInscricao = cda ? `${fonte.id}:${cda}` : `${fonte.id}:${doc}`;

  return {
    numeroInscricao,
    cnpj: doc,
    nomeDevedor: nome,
    uf: fonte.uf,
    naturezaDivida: `Dívida Ativa Estadual (${fonte.uf})`,
    receitaPrincipal: primeiro(row, CANDIDATOS.receita) || null,
    situacaoInscricao: primeiro(row, CANDIDATOS.situacao) || null,
    indicadorAjuizado: null,
    dataInscricao: data,
    valorConsolidado: valor,
  };
}

// ---------- Leitura de arquivos (CSV com detecção, XLSX em streaming) ----------

/** Detecta codificação (UTF-8 × Latin-1) e separador (";" × "," × tab). */
export function detectarFormatoCsv(caminho: string): { encoding: BufferEncoding; delimiter: string } {
  const fd = fs.openSync(caminho, "r");
  const buf = Buffer.alloc(65536);
  const lidos = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const amostra = buf.subarray(0, lidos);

  let encoding: BufferEncoding = "latin1";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(amostra);
    encoding = "utf8";
  } catch {
    encoding = "latin1";
  }

  const primeiraLinha = amostra.toString(encoding).split(/\r?\n/)[0] || "";
  const contagens: [string, number][] = [
    [";", (primeiraLinha.match(/;/g) || []).length],
    [",", (primeiraLinha.match(/,/g) || []).length],
    ["\t", (primeiraLinha.match(/\t/g) || []).length],
  ];
  contagens.sort((a, b) => b[1] - a[1]);
  return { encoding, delimiter: contagens[0][1] > 0 ? contagens[0][0] : ";" };
}

async function processarCsvEstadual(
  caminho: string,
  fonte: FonteEstadual,
  syncId: number,
  aoProgresso: (n: number) => void
): Promise<{ total: number; ignoradas: number; cabecalhos: string[] }> {
  const { encoding, delimiter } = detectarFormatoCsv(caminho);
  return new Promise((resolve, reject) => {
    let total = 0;
    let ignoradas = 0;
    let cabecalhos: string[] = [];
    let lote: LinhaDivida[] = [];
    const TAMANHO_LOTE = 2000;

    const parser = parse({
      delimiter,
      columns: (linha: string[]) => {
        cabecalhos = linha;
        return linha;
      },
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      bom: true,
    });

    parser.on("readable", () => {
      let registro: Record<string, string>;
      while ((registro = parser.read()) !== null) {
        const linha = mapearLinhaEstadual(registro, fonte);
        if (!linha) {
          ignoradas++;
          continue;
        }
        lote.push(linha);
        total++;
        if (lote.length >= TAMANHO_LOTE) {
          inserirLote(lote, syncId, fonte.id, "estadual");
          lote = [];
          aoProgresso(total);
        }
      }
    });
    parser.on("end", () => {
      if (lote.length > 0) inserirLote(lote, syncId, fonte.id, "estadual");
      resolve({ total, ignoradas, cabecalhos });
    });
    parser.on("error", reject);

    fs.createReadStream(caminho, { encoding }).pipe(parser);
  });
}

async function processarXlsxEstadual(
  caminho: string,
  fonte: FonteEstadual,
  syncId: number,
  aoProgresso: (n: number) => void
): Promise<{ total: number; ignoradas: number; cabecalhos: string[] }> {
  let total = 0;
  let ignoradas = 0;
  let cabecalhos: string[] = [];
  let lote: LinhaDivida[] = [];
  const TAMANHO_LOTE = 2000;

  const leitor = new ExcelJS.stream.xlsx.WorkbookReader(fs.createReadStream(caminho), {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });

  for await (const planilha of leitor) {
    for await (const linha of planilha) {
      const valores = (linha.values || []) as unknown[];
      if (cabecalhos.length === 0) {
        cabecalhos = valores.map((v) => String(v ?? "")).filter((v) => v !== "");
        continue;
      }
      const registro: Record<string, string> = {};
      // linha.values é indexado a partir de 1
      for (let i = 0; i < cabecalhos.length; i++) {
        const bruto = valores[i + 1];
        registro[cabecalhos[i]] =
          bruto == null
            ? ""
            : bruto instanceof Date
              ? bruto.toISOString().slice(0, 10)
              : typeof bruto === "object" && bruto !== null && "text" in (bruto as object)
                ? String((bruto as { text: unknown }).text)
                : String(bruto);
      }
      const mapeada = mapearLinhaEstadual(registro, fonte);
      if (!mapeada) {
        ignoradas++;
        continue;
      }
      lote.push(mapeada);
      total++;
      if (lote.length >= TAMANHO_LOTE) {
        inserirLote(lote, syncId, fonte.id, "estadual");
        lote = [];
        aoProgresso(total);
      }
    }
    break; // só a primeira planilha
  }
  if (lote.length > 0) inserirLote(lote, syncId, fonte.id, "estadual");
  return { total, ignoradas, cabecalhos };
}

// ---------- Orquestração ----------

let fonteEmExecucao: string | null = null;

export function isSincronizandoEstadual(): boolean {
  return fonteEmExecucao !== null;
}

export function listarFontesStatus(): FonteEstadualStatus[] {
  return FONTES_ESTADUAIS.map((f) => ({
    id: f.id,
    nome: f.nome,
    uf: f.uf,
    atualizacao: f.atualizacao,
    ultimaSincronizacao: getConfig(`ultima_sincronizacao_${f.id}`),
    executando: fonteEmExecucao === f.id,
  }));
}

function progresso(syncId: number, msg: string): void {
  console.log(`[Sync ${syncId}] ${msg}`);
  db.prepare("UPDATE sincronizacoes SET progresso = ? WHERE id = ?").run(msg, syncId);
}

export async function executarSincronizacaoFonte(
  fonteId: string,
  disparo: "manual" | "automatica",
  forcar = false
): Promise<Sincronizacao | null> {
  const fonte = getFonte(fonteId);
  if (!fonte) throw new Error(`Fonte desconhecida: ${fonteId}`);
  if (fonteEmExecucao) throw new Error(`Já existe uma sincronização estadual em andamento (${fonteEmExecucao}).`);
  if (isSincronizando()) throw new Error("Aguarde a sincronização federal terminar.");
  fonteEmExecucao = fonte.id;

  const result = db
    .prepare("INSERT INTO sincronizacoes (status, disparo, fonte) VALUES ('running', ?, ?)")
    .run(disparo, fonte.id);
  const syncId = result.lastInsertRowid as number;

  const dividasAntes = (
    db.prepare("SELECT COUNT(*) AS n FROM dividas WHERE origem = ?").get(fonte.id) as { n: number }
  ).n;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `estadual-${fonte.uf}-`));

  try {
    progresso(syncId, `Descobrindo o arquivo mais recente de ${fonte.nome}...`);
    const arquivo = await fonte.descobrirArquivo();

    const chaveAssinatura = `assinatura_${fonte.id}`;
    const assinaturaAnterior = getConfig(chaveAssinatura);
    if (!forcar && dividasAntes > 0 && arquivo.assinatura === assinaturaAnterior) {
      const vivos = (
        db.prepare("SELECT COUNT(*) AS n FROM dividas WHERE origem = ? AND ativa = 1").get(fonte.id) as { n: number }
      ).n;
      db.prepare(
        `UPDATE sincronizacoes SET status='completed', total_dividas=?, progresso=?, concluida_em=datetime('now') WHERE id=?`
      ).run(
        vivos,
        `Sem novidades: ${fonte.nome} não publicou arquivo novo desde a última sincronização.`,
        syncId
      );
      setConfig(`ultima_sincronizacao_${fonte.id}`, new Date().toISOString());
      return getSincronizacaoLocal(syncId);
    }

    progresso(syncId, `Baixando ${fonte.nome}... (${arquivo.formato.toUpperCase()})`);
    const destino = path.join(tmpDir, `dados.${arquivo.formato}`);
    await baixarArquivoComUA(arquivo.url, destino);

    // ZIP: extrai e processa o primeiro CSV que encontrar
    let caminhoDados = destino;
    let formato: "csv" | "xlsx" = arquivo.formato === "xlsx" ? "xlsx" : "csv";
    if (arquivo.formato === "zip") {
      progresso(syncId, "Extraindo arquivo...");
      const csvs = await extrairZip(destino, tmpDir);
      if (csvs.length === 0) throw new Error("O ZIP baixado não contém CSV.");
      caminhoDados = csvs[0];
      formato = "csv";
    }

    progresso(syncId, "Importando registros...");
    const processar = formato === "xlsx" ? processarXlsxEstadual : processarCsvEstadual;
    const resultado = await processar(caminhoDados, fonte, syncId, (n) => {
      if (n % 50000 < 2000) {
        progresso(syncId, `Importando ${fonte.nome}: ${n.toLocaleString("pt-BR")} registros...`);
      }
    });

    if (resultado.total === 0) {
      throw new Error(
        `Nenhum registro com CNPJ reconhecido no arquivo. Colunas encontradas: ` +
          `${resultado.cabecalhos.join("; ") || "nenhuma"}. Me envie esta mensagem para eu ajustar o leitor.`
      );
    }

    progresso(syncId, "Consolidando dados por empresa...");
    consolidarEmpresas(syncId, null, fonte.id);

    const stats = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM dividas WHERE origem = @origem AND ativa = 1) AS totalDividas,
           (SELECT COUNT(DISTINCT cnpj) FROM dividas WHERE origem = @origem AND ativa = 1) AS totalEmpresas,
           (SELECT COUNT(*) FROM dividas WHERE origem = @origem AND primeira_sync_id = @syncId) AS novasDividas`
      )
      .get({ origem: fonte.id, syncId }) as { totalDividas: number; totalEmpresas: number; novasDividas: number };

    db.prepare(
      `UPDATE sincronizacoes SET
         status='completed', total_dividas=?, total_empresas=?, novas_dividas=?, novas_empresas=?,
         progresso=?, concluida_em=datetime('now')
       WHERE id=?`
    ).run(
      stats.totalDividas,
      stats.totalEmpresas,
      dividasAntes === 0 ? 0 : stats.novasDividas,
      0,
      `Concluída: ${resultado.total.toLocaleString("pt-BR")} registros importados` +
        (resultado.ignoradas > 0
          ? ` (${resultado.ignoradas.toLocaleString("pt-BR")} linhas sem CNPJ de empresa, ignoradas)`
          : "") +
        ".",
      syncId
    );

    setConfig(chaveAssinatura, arquivo.assinatura);
    setConfig(`ultima_sincronizacao_${fonte.id}`, new Date().toISOString());
    return getSincronizacaoLocal(syncId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    db.prepare(
      "UPDATE sincronizacoes SET status='error', error_message=?, concluida_em=datetime('now') WHERE id=?"
    ).run(msg, syncId);
    throw error;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fonteEmExecucao = null;
  }
}

function getSincronizacaoLocal(id: number): Sincronizacao | null {
  const row = db.prepare("SELECT * FROM sincronizacoes WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    id: row.id as number,
    status: row.status as Sincronizacao["status"],
    fonte: (row.fonte as string) || "PGFN",
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

/**
 * Verificação diária (cron): checa cada fonte e sincroniza só as que
 * publicaram arquivo novo. A checagem em si leva segundos por fonte.
 */
export async function verificarFontesEstaduais(): Promise<void> {
  for (const fonte of FONTES_ESTADUAIS) {
    // Fonte nunca sincronizada manualmente: não baixa sozinha da primeira vez
    // (o primeiro download pode ser pesado; o usuário decide quando)
    const jaCarregada = (
      db.prepare("SELECT COUNT(*) AS n FROM dividas WHERE origem = ?").get(fonte.id) as { n: number }
    ).n;
    if (jaCarregada === 0) continue;
    try {
      await executarSincronizacaoFonte(fonte.id, "automatica", false);
    } catch (err) {
      console.error(`[Cron estadual ${fonte.id}]`, err instanceof Error ? err.message : err);
    }
  }
}
