/**
 * Comparativo de trimestres: descobre EM QUAL trimestre cada empresa ENTROU
 * na base da PGFN, comparando a base atual (já sincronizada) com as bases dos
 * trimestres anteriores.
 *
 * Como funciona:
 *  1. Exige que a base atual já esteja carregada (sincronização concluída).
 *  2. Baixa os arquivos de cada trimestre anterior (do mais recente ao mais
 *     antigo), guardando APENAS os CNPJs (tabela cnpjs_trimestre_ref) — nada
 *     é gravado nas tabelas principais.
 *  3. A cada passe, empresas ainda não classificadas que estão AUSENTES no
 *     trimestre baixado são marcadas: entraram no trimestre seguinte a ele.
 *     Quem está presente no trimestre mais antigo baixado fica sem marca
 *     (já estava na base antes do período comparado).
 *
 * Determinístico: é uma comparação de conjuntos de CNPJs, sem IA.
 */
import { parse } from "csv-parse";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { db, getConfig, setConfig } from "../db";
import {
  ARQUIVOS,
  downloadFile,
  extrairZip,
  headOk,
  isSincronizando,
  normalizarLinha,
  urlArquivo,
} from "./pgfn-sync";
import type { ComparativoResultado, ComparativoStatus } from "../../shared/types";

let comparandoAgora = false;
let etapaAtual: string | null = null;
let ultimoErro: string | null = null;

export function isComparando(): boolean {
  return comparandoAgora;
}

export function getComparativoStatus(): ComparativoStatus {
  const salvo = getConfig("comparativo_resultado");
  let resultado: ComparativoResultado | null = null;
  if (salvo) {
    try {
      const parsed = JSON.parse(salvo) as ComparativoResultado;
      // Descarta resultados gravados por versões antigas (formato diferente)
      resultado = Array.isArray(parsed.porTrimestre) ? parsed : null;
    } catch {
      resultado = null;
    }
  }
  return { executando: comparandoAgora, etapa: etapaAtual, errorMessage: ultimoErro, resultado };
}

function setEtapa(msg: string): void {
  etapaAtual = msg;
  console.log(`[Comparativo] ${msg}`);
}

/** "2026_trimestre_01" -> "2025_trimestre_04"; retorna null se o formato for inválido. */
export function trimestreAnteriorDe(trimestre: string): string | null {
  const m = trimestre.match(/^(\d{4})_trimestre_0([1-4])$/);
  if (!m) return null;
  let year = Number(m[1]);
  let quarter = Number(m[2]) - 1;
  if (quarter === 0) {
    quarter = 4;
    year--;
  }
  return `${year}_trimestre_0${quarter}`;
}

/** Limpa a classificação para recomputar do zero. Separado para ser testável. */
export function resetarEntradas(): void {
  db.prepare("UPDATE empresas SET entrou_na_base_em = NULL").run();
}

/**
 * Um passe do comparativo: empresas ativas AINDA sem classificação que NÃO
 * aparecem em cnpjs_trimestre_ref (o trimestre anterior baixado) entraram na
 * base no trimestre `trimestreEntrada` (o seguinte ao baixado).
 * Retorna quantas empresas foram marcadas neste passe. Separado para ser testável.
 */
export function aplicarPasseComparativo(trimestreEntrada: string): number {
  const info = db
    .prepare(
      `UPDATE empresas SET entrou_na_base_em = @t
       WHERE qtd_dividas > 0 AND entrou_na_base_em IS NULL
         AND cnpj NOT IN (SELECT cnpj FROM cnpjs_trimestre_ref)`
    )
    .run({ t: trimestreEntrada });
  return info.changes;
}

const insertCnpjStmt = db.prepare("INSERT OR IGNORE INTO cnpjs_trimestre_ref (cnpj) VALUES (?)");
const inserirCnpjs = db.transaction((cnpjs: string[]) => {
  for (const c of cnpjs) insertCnpjStmt.run(c);
});

/** Lê um CSV da PGFN e guarda apenas os CNPJs (mesmos critérios da sincronização). */
function coletarCnpjs(csvFile: string, arquivo: string, onProgresso: (total: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    let total = 0;
    let batch: string[] = [];
    const BATCH_SIZE = 5000;

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
        batch.push(linha.cnpj);
        total++;
        if (batch.length >= BATCH_SIZE) {
          inserirCnpjs(batch);
          batch = [];
          onProgresso(total);
        }
      }
    });
    parser.on("end", () => {
      if (batch.length > 0) inserirCnpjs(batch);
      resolve(total);
    });
    parser.on("error", reject);

    fs.createReadStream(csvFile, { encoding: "latin1" }).pipe(parser);
  });
}

/** Baixa um trimestre e preenche cnpjs_trimestre_ref com os CNPJs dele. */
async function baixarCnpjsDoTrimestre(trimestre: string, tmpDir: string): Promise<void> {
  db.prepare("DELETE FROM cnpjs_trimestre_ref").run();

  let totalLinhas = 0;
  for (const arquivo of ARQUIVOS) {
    const zipPath = path.join(tmpDir, `${arquivo}.zip`);
    const extractDir = path.join(tmpDir, arquivo);
    fs.mkdirSync(extractDir, { recursive: true });

    setEtapa(`Baixando ${arquivo} de ${trimestre}... O arquivo é grande, aguarde.`);
    await downloadFile(urlArquivo(trimestre, arquivo), zipPath);

    setEtapa(`Extraindo ${arquivo} de ${trimestre}...`);
    const csvs = await extrairZip(zipPath, extractDir);
    fs.rmSync(zipPath, { force: true });

    for (let i = 0; i < csvs.length; i++) {
      const nomeCsv = path.basename(csvs[i]);
      setEtapa(`Lendo CNPJs de ${trimestre} — ${nomeCsv} (${i + 1}/${csvs.length})...`);
      totalLinhas += await coletarCnpjs(csvs[i], arquivo, (qtd) => {
        if (qtd % 100000 < 5000) {
          setEtapa(
            `Lendo CNPJs de ${trimestre} — ${nomeCsv}: ${(totalLinhas + qtd).toLocaleString("pt-BR")} registros lidos...`
          );
        }
      });
      fs.rmSync(csvs[i], { force: true });
    }
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

/** Quantos trimestres ANTERIORES ao atual baixar (2 => comparativo dos 3 últimos). */
const TRIMESTRES_ANTERIORES = 2;

export async function executarComparativo(): Promise<ComparativoResultado> {
  if (comparandoAgora) throw new Error("Já existe um comparativo em andamento.");
  if (isSincronizando()) {
    throw new Error("Há uma sincronização em andamento. Aguarde a conclusão antes de comparar trimestres.");
  }

  const trimestreAtual = getConfig("trimestre_atual");
  const empresasAtivas = (
    db.prepare("SELECT COUNT(*) AS n FROM empresas WHERE qtd_dividas > 0").get() as { n: number }
  ).n;
  if (!trimestreAtual || empresasAtivas === 0) {
    // ultimoErro aparece no status consultado pela interface
    ultimoErro = "Execute uma sincronização completa antes de comparar trimestres.";
    throw new Error(ultimoErro);
  }

  comparandoAgora = true;
  ultimoErro = null;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pgfn-comparativo-"));

  try {
    resetarEntradas();

    const trimestresComparados: string[] = [];
    let trimestreSeguinte = trimestreAtual; // quem está ausente no baixado entrou neste
    for (let passe = 0; passe < TRIMESTRES_ANTERIORES; passe++) {
      const anterior = trimestreAnteriorDe(trimestreSeguinte);
      if (!anterior) {
        ultimoErro = `Trimestre em formato inesperado: ${trimestreSeguinte}`;
        throw new Error(ultimoErro);
      }

      setEtapa(`Verificando se a PGFN publica ${anterior}...`);
      if (!(await headOk(urlArquivo(anterior, "Previdenciario")))) {
        if (passe === 0) {
          throw new Error(
            `A PGFN não disponibiliza mais os arquivos do trimestre anterior (${anterior}). ` +
              `O comparativo passará a ser alimentado automaticamente pelas próximas sincronizações.`
          );
        }
        // Trimestres mais antigos indisponíveis: seguimos com o que foi comparado
        break;
      }

      await baixarCnpjsDoTrimestre(anterior, tmpDir);

      setEtapa(`Classificando quem entrou em ${trimestreSeguinte}...`);
      aplicarPasseComparativo(trimestreSeguinte);
      trimestresComparados.push(anterior);
      trimestreSeguinte = anterior;
    }

    // Libera espaço: o conjunto de referência não é mais necessário
    db.prepare("DELETE FROM cnpjs_trimestre_ref").run();

    const porTrimestre = db
      .prepare(
        `SELECT entrou_na_base_em AS trimestre, COUNT(*) AS empresas
         FROM empresas WHERE entrou_na_base_em IS NOT NULL AND qtd_dividas > 0
         GROUP BY entrou_na_base_em ORDER BY entrou_na_base_em DESC`
      )
      .all() as { trimestre: string; empresas: number }[];

    const resultado: ComparativoResultado = {
      trimestreAtual,
      trimestresComparados,
      porTrimestre,
      executadoEm: new Date().toISOString(),
    };
    setConfig("comparativo_resultado", JSON.stringify(resultado));
    const totalMarcadas = porTrimestre.reduce((s, p) => s + p.empresas, 0);
    setEtapa(
      `Concluído: ${totalMarcadas.toLocaleString("pt-BR")} empresas classificadas por trimestre de entrada ` +
        `(comparados ${trimestresComparados.length} trimestres anteriores).`
    );
    return resultado;
  } catch (error) {
    ultimoErro = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    comparandoAgora = false;
  }
}
