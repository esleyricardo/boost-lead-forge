/**
 * Exportação de empresas devedoras para Excel (.xlsx).
 */
import ExcelJS from "exceljs";
import type { Empresa, Socio } from "../../shared/types";

export function formatarCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

/** "2026_trimestre_01" -> "1º trim/2026" */
export function formatarTrimestre(trimestre: string | null): string {
  if (!trimestre) return "";
  const m = trimestre.match(/^(\d{4})_trimestre_0([1-4])$/);
  return m ? `${m[2]}º trim/${m[1]}` : trimestre;
}

function sociosParaTexto(sociosJson: string | null): string {
  if (!sociosJson) return "";
  try {
    const socios = JSON.parse(sociosJson) as Socio[];
    return socios.map((s) => `${s.nome} (${s.qualificacao})`).join("; ");
  } catch {
    return "";
  }
}

export async function gerarExcel(empresas: Empresa[]): Promise<Buffer> {
  // Gerador em streaming: bem mais rápido e com menos memória para
  // exportações grandes (dezenas de milhares de linhas)
  const { PassThrough } = await import("stream");
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (c: Buffer) => chunks.push(c));
  const fim = new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
  workbook.creator = "PGFN Devedores";
  const sheet = workbook.addWorksheet("Devedores PGFN", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "CNPJ", key: "cnpj", width: 20 },
    { header: "Razão Social", key: "razaoSocial", width: 45 },
    { header: "UF", key: "uf", width: 6 },
    { header: "Município", key: "municipio", width: 22 },
    { header: "Natureza(s) da Dívida", key: "naturezas", width: 35 },
    { header: "Qtd. Dívidas", key: "qtdDividas", width: 12 },
    { header: "Valor Total (R$)", key: "valorTotal", width: 18 },
    { header: "Data Inscrição Mais Antiga", key: "dataAntiga", width: 22 },
    { header: "Data Inscrição Mais Recente", key: "dataRecente", width: 22 },
    { header: "Detectada pelo Sistema em", key: "dataDeteccao", width: 22 },
    { header: "Entrou na Base (Trimestre)", key: "entrouNaBase", width: 22 },
    { header: "Telefones", key: "telefones", width: 30 },
    { header: "Email", key: "email", width: 32 },
    { header: "Sócios", key: "socios", width: 60 },
    { header: "CNAE Principal", key: "cnae", width: 40 },
    { header: "Abertura da Empresa", key: "abertura", width: 18 },
    { header: "Situação Cadastral", key: "situacao", width: 18 },
    { header: "Enriquecida em", key: "enrichedAt", width: 20 },
  ];

  sheet.getColumn("valorTotal").numFmt = "#,##0.00";
  sheet.autoFilter = { from: "A1", to: "R1" };

  const cab = sheet.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  cab.commit();

  for (const e of empresas) {
    sheet
      .addRow({
        cnpj: formatarCnpj(e.cnpj),
        razaoSocial: e.razaoSocial,
        uf: e.uf || "",
        municipio: e.municipio || "",
        naturezas: e.naturezas,
        qtdDividas: e.qtdDividas,
        valorTotal: e.valorTotal,
        dataAntiga: e.dataInscricaoMaisAntiga || "",
        dataRecente: e.dataInscricaoMaisRecente || "",
        dataDeteccao: e.dataPrimeiraDeteccao?.slice(0, 10) || "",
        entrouNaBase: formatarTrimestre(e.entrouNaBaseEm),
        telefones: e.telefones || "",
        email: e.email || "",
        socios: sociosParaTexto(e.socios),
        cnae: e.cnaeDescricao || "",
        abertura: e.dataAberturaEmpresa || "",
        situacao: e.situacaoCadastral || "",
        enrichedAt: e.enrichedAt?.slice(0, 16).replace("T", " ") || "",
      })
      .commit();
  }

  sheet.commit();
  await workbook.commit();
  await fim;
  return Buffer.concat(chunks);
}
