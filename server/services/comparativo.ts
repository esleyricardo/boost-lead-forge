/**
 * Comparativo de trimestres: descobre quais empresas ENTRARAM na base da PGFN
 * no último trimestre, comparando a base atual (já sincronizada) com a base
 * do trimestre ANTERIOR.
 *
 * Como funciona:
 *  1. Exige que a base atual já esteja carregada (sincronização concluída).
 *  2. Baixa os arquivos do trimestre anterior, mas guarda APENAS os CNPJs
 *     (tabela de trabalho cnpjs_trimestre_ref) — nada é gravado nas tabelas
 *     principais.
 *  3. Empresas presentes na base atual mas ausentes no trimestre anterior são
 *     marcadas com entrou_na_base_em = trimestre atual.
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
      resultado = JSON.parse(salvo) as ComparativoResultado;
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

/**
 * Marca as empresas ativas que NÃO aparecem em cnpjs_trimestre_ref como
 * "entraram na base" no trimestre informado (e desmarca falsos positivos).
 * Retorna quantas empresas ficaram marcadas. Separado para ser testável.
 */
export function marcarEmpresasNovasDoTrimestre(trimestreAtual: string): number {
  const tx = db.transaction(() => {
    // Quem está no trimestre anterior certamente NÃO entrou agora
    db.prepare(
      `UPDATE empresas SET entrou_na_base_em = NULL
       WHERE entrou_na_base_em = @t AND cnpj IN (SELECT cnpj FROM cnpjs_trimestre_ref)`
    ).run({ t: trimestreAtual });

    db.prepare(
      `UPDATE empresas SET entrou_na_base_em = @t
       WHERE qtd_dividas > 0 AND cnpj NOT IN (SELECT cnpj FROM cnpjs_trimestre_ref)`
    ).run({ t: trimestreAtual });
  });
  tx();

  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM empresas WHERE entrou_na_base_em = ? AND qtd_dividas > 0")
      .get(trimestreAtual) as { n: number }
  ).n;
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

  const trimestreAnterior = trimestreAnteriorDe(trimestreAtual);
  if (!trimestreAnterior) {
    ultimoErro = `Trimestre atual em formato inesperado: ${trimestreAtual}`;
    throw new Error(ultimoErro);
  }

  comparandoAgora = true;
  ultimoErro = null;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pgfn-comparativo-"));

  try {
    setEtapa(`Verificando se a PGFN ainda publica o trimestre anterior (${trimestreAnterior})...`);
    if (!(await headOk(urlArquivo(trimestreAnterior, "Previdenciario")))) {
      throw new Error(
        `A PGFN não disponibiliza mais os arquivos do trimestre anterior (${trimestreAnterior}). ` +
          `O comparativo passará a ser alimentado automaticamente pelas próximas sincronizações.`
      );
    }

    db.prepare("DELETE FROM cnpjs_trimestre_ref").run();

    let totalLinhas = 0;
    for (const arquivo of ARQUIVOS) {
      const zipPath = path.join(tmpDir, `${arquivo}.zip`);
      const extractDir = path.join(tmpDir, arquivo);
      fs.mkdirSync(extractDir, { recursive: true });

      setEtapa(`Baixando ${arquivo} do trimestre anterior (${trimestreAnterior})... O arquivo é grande, aguarde.`);
      await downloadFile(urlArquivo(trimestreAnterior, arquivo), zipPath);

      setEtapa(`Extraindo ${arquivo}...`);
      const csvs = await extrairZip(zipPath, extractDir);
      fs.rmSync(zipPath, { force: true });

      for (let i = 0; i < csvs.length; i++) {
        const nomeCsv = path.basename(csvs[i]);
        setEtapa(`Lendo CNPJs de ${arquivo} — ${nomeCsv} (${i + 1}/${csvs.length})...`);
        totalLinhas += await coletarCnpjs(csvs[i], arquivo, (qtd) => {
          if (qtd % 100000 < 5000) {
            setEtapa(
              `Lendo CNPJs de ${arquivo} — ${nomeCsv}: ${(totalLinhas + qtd).toLocaleString("pt-BR")} registros lidos...`
            );
          }
        });
        fs.rmSync(csvs[i], { force: true });
      }
      fs.rmSync(extractDir, { recursive: true, force: true });
    }

    setEtapa("Comparando as duas bases (quem entrou no último trimestre)...");
    const empresasNovas = marcarEmpresasNovasDoTrimestre(trimestreAtual);

    // Libera espaço: o conjunto de referência não é mais necessário
    db.prepare("DELETE FROM cnpjs_trimestre_ref").run();

    const resultado: ComparativoResultado = {
      trimestreAtual,
      trimestreAnterior,
      empresasNovas,
      executadoEm: new Date().toISOString(),
    };
    setConfig("comparativo_resultado", JSON.stringify(resultado));
    setEtapa(
      `Concluído: ${empresasNovas.toLocaleString("pt-BR")} empresas entraram na base no último trimestre.`
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
