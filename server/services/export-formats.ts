/**
 * Geradores de exportação em CSV e PDF (o Excel fica em excel.ts).
 * Todos aplicam o DDI +55 nos telefones e usam o mesmo conjunto de campos.
 */
import PDFDocument from "pdfkit";
import type { Empresa, Socio } from "../../shared/types";
import { telefonesComDDI } from "../../shared/format";
import { formatarCnpj, formatarTrimestre } from "./excel";

function sociosParaTexto(sociosJson: string | null): string {
  if (!sociosJson) return "";
  try {
    const socios = JSON.parse(sociosJson) as Socio[];
    return socios
      .map((s) => `${s.nome}${s.documento ? ` [CPF ${s.documento}]` : ""} (${s.qualificacao})`)
      .join("; ");
  } catch {
    return "";
  }
}

const COLUNAS: { titulo: string; valor: (e: Empresa) => string }[] = [
  { titulo: "CNPJ", valor: (e) => formatarCnpj(e.cnpj) },
  { titulo: "Razão Social", valor: (e) => e.razaoSocial },
  { titulo: "UF", valor: (e) => e.uf || "" },
  { titulo: "Município", valor: (e) => e.municipio || "" },
  { titulo: "Natureza(s)", valor: (e) => e.naturezas },
  { titulo: "Esfera(s)", valor: (e) => e.esferas },
  { titulo: "Qtd. Dívidas", valor: (e) => String(e.qtdDividas) },
  { titulo: "Valor Total (R$)", valor: (e) => e.valorTotal.toFixed(2) },
  { titulo: "Inscrição Mais Antiga", valor: (e) => e.dataInscricaoMaisAntiga || "" },
  { titulo: "Inscrição Mais Recente", valor: (e) => e.dataInscricaoMaisRecente || "" },
  { titulo: "Entrou na Base", valor: (e) => formatarTrimestre(e.entrouNaBaseEm) },
  { titulo: "Telefones", valor: (e) => telefonesComDDI(e.telefones) },
  { titulo: "Email", valor: (e) => e.email || "" },
  { titulo: "Sócios", valor: (e) => sociosParaTexto(e.socios) },
  { titulo: "CNAE Principal", valor: (e) => e.cnaeDescricao || "" },
  { titulo: "Situação Cadastral", valor: (e) => e.situacaoCadastral || "" },
];

// ---------- CSV ----------

function csvCampo(v: string): string {
  // Aspas quando houver separador, aspas ou quebra de linha
  if (/[;"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function gerarCsv(empresas: Empresa[]): Buffer {
  const linhas: string[] = [];
  linhas.push(COLUNAS.map((c) => csvCampo(c.titulo)).join(";"));
  for (const e of empresas) {
    linhas.push(COLUNAS.map((c) => csvCampo(c.valor(e))).join(";"));
  }
  // BOM UTF-8 para o Excel abrir com acentos corretos
  return Buffer.concat([Buffer.from("﻿", "utf8"), Buffer.from(linhas.join("\r\n"), "utf8")]);
}

// ---------- PDF ----------

/** Máximo de linhas no PDF: acima disso vira um documento gigante e inútil. */
export const PDF_MAX_LINHAS = 3000;

const PDF_COLS: { titulo: string; largura: number; valor: (e: Empresa) => string }[] = [
  { titulo: "CNPJ", largura: 95, valor: (e) => formatarCnpj(e.cnpj) },
  { titulo: "Razão Social", largura: 200, valor: (e) => e.razaoSocial },
  { titulo: "UF", largura: 24, valor: (e) => e.uf || "" },
  { titulo: "Valor Total (R$)", largura: 95, valor: (e) => e.valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) },
  { titulo: "Telefones", largura: 150, valor: (e) => telefonesComDDI(e.telefones) },
  { titulo: "Natureza(s)", largura: 150, valor: (e) => e.naturezas },
];

export function gerarPdf(empresas: Empresa[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const esq = doc.page.margins.left;
    const larguraUtil = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.fontSize(14).font("Helvetica-Bold").text("Devedores PGFN", esq, 24);
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#555")
      .text(
        `Gerado em ${new Date().toLocaleString("pt-BR")} · ${empresas.length.toLocaleString("pt-BR")} empresas`,
        esq,
        42
      );
    doc.fillColor("#000");

    let y = 62;
    const alturaLinha = 26;
    const rodape = doc.page.height - doc.page.margins.bottom;

    function cabecalho() {
      doc.rect(esq, y, larguraUtil, 16).fill("#1E3A5F");
      doc.fillColor("#fff").fontSize(7.5).font("Helvetica-Bold");
      let x = esq;
      for (const c of PDF_COLS) {
        doc.text(c.titulo, x + 3, y + 4, { width: c.largura - 6, ellipsis: true });
        x += c.largura;
      }
      doc.fillColor("#000").font("Helvetica");
      y += 16;
    }

    cabecalho();
    doc.fontSize(7);
    let listrada = false;
    for (const e of empresas) {
      if (y + alturaLinha > rodape) {
        doc.addPage();
        y = 30;
        cabecalho();
        doc.fontSize(7);
      }
      if (listrada) doc.rect(esq, y, larguraUtil, alturaLinha).fill("#F2F5F9").fillColor("#000");
      listrada = !listrada;
      let x = esq;
      for (const c of PDF_COLS) {
        doc.fillColor("#000").text(c.valor(e), x + 3, y + 3, {
          width: c.largura - 6,
          height: alturaLinha - 4,
          ellipsis: true,
        });
        x += c.largura;
      }
      doc.moveTo(esq, y + alturaLinha).lineTo(esq + larguraUtil, y + alturaLinha).strokeColor("#DDD").stroke();
      y += alturaLinha;
    }

    doc.end();
  });
}
