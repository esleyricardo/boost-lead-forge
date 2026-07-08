/**
 * Testes do pipeline de sincronização e utilitários.
 * Roda com: npm test
 * Usa um banco temporário (DATA_DIR isolado) e um CSV no formato oficial da PGFN.
 */
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pgfn-test-"));

async function main() {
  const { db, setConfig } = await import("../db");
  const { normalizarLinha, normalizarData, parseValor, inserirLote, consolidarEmpresas, trimestresCandidatos } =
    await import("../services/pgfn-sync");
  const { trimestreAnteriorDe, marcarEmpresasNovasDoTrimestre } = await import("../services/comparativo");
  const { formatarCnpj, formatarTrimestre, gerarExcel } = await import("../services/excel");
  const { registrar, login } = await import("../auth");
  const { listarEmpresas, buscarEmpresa } = await import("../services/empresas");

  let passed = 0;
  const test = (nome: string, fn: () => void | Promise<void>) =>
    Promise.resolve(fn()).then(() => {
      passed++;
      console.log(`  ✓ ${nome}`);
    });

  console.log("Utilitários:");
  await test("normalizarData converte DD/MM/AAAA", () => {
    assert.equal(normalizarData("15/03/2019"), "2019-03-15");
    assert.equal(normalizarData("2019-03-15"), "2019-03-15");
    assert.equal(normalizarData("inválida"), null);
    assert.equal(normalizarData(undefined), null);
  });

  await test("parseValor entende formato brasileiro e americano", () => {
    assert.equal(parseValor("1.234.567,89"), 1234567.89);
    assert.equal(parseValor("1000.50"), 1000.5);
    assert.equal(parseValor(""), 0);
  });

  await test("formatarCnpj", () => {
    assert.equal(formatarCnpj("00000000000191"), "00.000.000/0001-91");
  });

  await test("trimestresCandidatos gera sequência decrescente", () => {
    const ts = trimestresCandidatos(4, new Date("2026-07-06"));
    assert.deepEqual(ts, [
      "2026_trimestre_03",
      "2026_trimestre_02",
      "2026_trimestre_01",
      "2025_trimestre_04",
    ]);
  });

  console.log("Parser do CSV da PGFN:");
  const linhaBase = {
    CPF_CNPJ: "12.345.678/0001-95",
    TIPO_PESSOA: "Pessoa jurídica",
    TIPO_DEVEDOR: "PRINCIPAL",
    NOME_DEVEDOR: "EMPRESA EXEMPLO LTDA",
    UF_DEVEDOR: "SP",
    UNIDADE_RESPONSAVEL: "SAO PAULO",
    NUMERO_INSCRICAO: "80 6 19 077777-70",
    TIPO_SITUACAO_INSCRICAO: "Em cobrança",
    SITUACAO_INSCRICAO: "ATIVA",
    RECEITA_PRINCIPAL: "SIMPLES NACIONAL",
    DATA_INSCRICAO: "21/05/2019",
    INDICADOR_AJUIZADO: "SIM",
    VALOR_CONSOLIDADO: "150.000,55",
  };

  await test("normalizarLinha extrai CNPJ, data oficial de inscrição e valor", () => {
    const l = normalizarLinha(linhaBase, "Nao_Previdenciario")!;
    assert.equal(l.cnpj, "12345678000195");
    assert.equal(l.dataInscricao, "2019-05-21");
    assert.equal(l.valorConsolidado, 150000.55);
    assert.equal(l.naturezaDivida, "Tributário Simples Nacional");
  });

  await test("normalizarLinha descarta pessoa física e situação não ativa", () => {
    assert.equal(normalizarLinha({ ...linhaBase, CPF_CNPJ: "123.456.789-01" }, "Nao_Previdenciario"), null);
    assert.equal(
      normalizarLinha(
        { ...linhaBase, TIPO_SITUACAO_INSCRICAO: "Benefício fiscal", SITUACAO_INSCRICAO: "SUSPENSA" },
        "Nao_Previdenciario"
      ),
      null
    );
  });

  await test("arquivo Previdenciario mapeia natureza previdenciária", () => {
    const l = normalizarLinha({ ...linhaBase, RECEITA_PRINCIPAL: "CONTRIBUICAO PREVIDENCIARIA" }, "Previdenciario")!;
    assert.equal(l.naturezaDivida, "Tributário Previdenciário");
  });

  console.log("Pipeline de sincronização (upsert + consolidação + detecção de novas):");

  // Sync 1: duas dívidas de duas empresas
  db.prepare("INSERT INTO sincronizacoes (status, disparo) VALUES ('running','manual')").run();
  const sync1 = db.prepare("SELECT MAX(id) AS id FROM sincronizacoes").get() as { id: number };

  const l1 = normalizarLinha(linhaBase, "Nao_Previdenciario")!;
  const l2 = normalizarLinha(
    {
      ...linhaBase,
      CPF_CNPJ: "98.765.432/0001-10",
      NOME_DEVEDOR: "OUTRA EMPRESA SA",
      NUMERO_INSCRICAO: "80 6 19 088888-80",
      DATA_INSCRICAO: "10/01/2015",
      VALOR_CONSOLIDADO: "50.000,00",
      UF_DEVEDOR: "RJ",
      RECEITA_PRINCIPAL: "COFINS",
    },
    "Nao_Previdenciario"
  )!;
  inserirLote([l1, l2], sync1.id);
  consolidarEmpresas(sync1.id);
  db.prepare("UPDATE sincronizacoes SET status='completed', concluida_em=datetime('now') WHERE id=?").run(sync1.id);

  await test("empresas consolidadas com data oficial de inscrição", () => {
    const r = listarEmpresas({ page: 1, pageSize: 10 });
    assert.equal(r.total, 2);
    const emp = r.items.find((e) => e.cnpj === "98765432000110")!;
    assert.equal(emp.dataInscricaoMaisAntiga, "2015-01-10");
    assert.equal(emp.valorTotal, 50000);
    assert.equal(emp.naturezas.includes("Demais Débitos"), true);
  });

  // Sync 2: mesma dívida 1 (valor atualizado), dívida 2 some, empresa nova entra
  db.prepare("INSERT INTO sincronizacoes (status, disparo) VALUES ('running','automatica')").run();
  const sync2 = db.prepare("SELECT MAX(id) AS id FROM sincronizacoes").get() as { id: number };

  const l1b = { ...l1, valorConsolidado: 200000 };
  const l3 = normalizarLinha(
    {
      ...linhaBase,
      CPF_CNPJ: "11.222.333/0001-81",
      NOME_DEVEDOR: "EMPRESA NOVA ME",
      NUMERO_INSCRICAO: "80 6 26 099999-90",
      DATA_INSCRICAO: "02/06/2026",
      VALOR_CONSOLIDADO: "10.000,00",
      UF_DEVEDOR: "MG",
      RECEITA_PRINCIPAL: "IRPJ",
    },
    "Nao_Previdenciario"
  )!;
  inserirLote([l1b, l3], sync2.id);
  consolidarEmpresas(sync2.id);
  db.prepare("UPDATE sincronizacoes SET status='completed', concluida_em=datetime('now') WHERE id=?").run(sync2.id);

  await test("upsert não duplica dívidas e atualiza o valor", () => {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM dividas").get() as { n: number }).n;
    assert.equal(n, 3); // 3 inscrições distintas no total
    const d = db
      .prepare("SELECT valor_consolidado, data_inscricao, primeira_sync_id FROM dividas WHERE numero_inscricao = ?")
      .get(l1.numeroInscricao) as { valor_consolidado: number; data_inscricao: string; primeira_sync_id: number };
    assert.equal(d.valor_consolidado, 200000);
    assert.equal(d.data_inscricao, "2019-05-21");
    assert.equal(d.primeira_sync_id, sync1.id); // preserva quando foi detectada
  });

  await test("empresa que entrou na última sync é marcada como nova", () => {
    const r = listarEmpresas({ page: 1, pageSize: 10, apenasNovas: true });
    assert.equal(r.total, 1);
    assert.equal(r.items[0].cnpj, "11222333000181");
    assert.equal(r.items[0].isNova, true);
  });

  await test("dívida que saiu da base deixa de contar", () => {
    const r = listarEmpresas({ page: 1, pageSize: 10 });
    const sumiu = r.items.find((e) => e.cnpj === "98765432000110");
    assert.equal(sumiu, undefined); // qtd_dividas = 0 → fora da listagem
    const emp = db.prepare("SELECT qtd_dividas FROM empresas WHERE cnpj = ?").get("98765432000110") as {
      qtd_dividas: number;
    };
    assert.equal(emp.qtd_dividas, 0); // histórico preservado
  });

  await test("detalhe da empresa traz dívidas com data de inscrição", () => {
    const det = buscarEmpresa("12345678000195")!;
    assert.equal(det.dividas.length, 1);
    assert.equal(det.dividas[0].dataInscricao, "2019-05-21");
  });

  console.log("Comparativo de trimestres:");
  await test("trimestreAnteriorDe calcula o trimestre anterior (com virada de ano)", () => {
    assert.equal(trimestreAnteriorDe("2026_trimestre_01"), "2025_trimestre_04");
    assert.equal(trimestreAnteriorDe("2026_trimestre_03"), "2026_trimestre_02");
    assert.equal(trimestreAnteriorDe("formato_invalido"), null);
  });

  await test("formatarTrimestre exibe formato legível", () => {
    assert.equal(formatarTrimestre("2026_trimestre_01"), "1º trim/2026");
    assert.equal(formatarTrimestre(null), "");
  });

  await test("comparativo marca só as empresas ausentes no trimestre anterior", () => {
    // Estado atual: ativas = 12345678000195 e 11222333000181
    // Simula o trimestre anterior contendo apenas a empresa antiga
    db.prepare("DELETE FROM cnpjs_trimestre_ref").run();
    db.prepare("INSERT INTO cnpjs_trimestre_ref (cnpj) VALUES (?)").run("12345678000195");
    setConfig("trimestre_atual", "2026_trimestre_02");

    const marcadas = marcarEmpresasNovasDoTrimestre("2026_trimestre_02");
    assert.equal(marcadas, 1);

    const filtradas = listarEmpresas({ entrouUltimoTrimestre: true, page: 1, pageSize: 10 });
    assert.equal(filtradas.total, 1);
    assert.equal(filtradas.items[0].cnpj, "11222333000181");
    assert.equal(filtradas.items[0].entrouNaBaseEm, "2026_trimestre_02");

    // A empresa que já existia no trimestre anterior não pode ser marcada
    const antiga = db
      .prepare("SELECT entrou_na_base_em FROM empresas WHERE cnpj = ?")
      .get("12345678000195") as { entrou_na_base_em: string | null };
    assert.equal(antiga.entrou_na_base_em, null);
  });

  await test("consolidarEmpresas marca trimestre de entrada de empresas novas", () => {
    db.prepare("INSERT INTO sincronizacoes (status, disparo) VALUES ('running','manual')").run();
    const sync3 = db.prepare("SELECT MAX(id) AS id FROM sincronizacoes").get() as { id: number };
    const l4 = normalizarLinha(
      {
        ...linhaBase,
        CPF_CNPJ: "44.555.666/0001-30",
        NOME_DEVEDOR: "RECEM CHEGADA LTDA",
        NUMERO_INSCRICAO: "80 6 26 055555-50",
        VALOR_CONSOLIDADO: "77.000,00",
        RECEITA_PRINCIPAL: "PIS",
      },
      "Nao_Previdenciario"
    )!;
    // Reprocessa as dívidas existentes + a nova (upsert preserva as antigas)
    const existentes = db
      .prepare("SELECT numero_inscricao FROM dividas WHERE ativa = 1")
      .all() as { numero_inscricao: string }[];
    assert.ok(existentes.length > 0);
    const l1c = { ...normalizarLinha(linhaBase, "Nao_Previdenciario")!, valorConsolidado: 200000 };
    const l3b = normalizarLinha(
      {
        ...linhaBase,
        CPF_CNPJ: "11.222.333/0001-81",
        NOME_DEVEDOR: "EMPRESA NOVA ME",
        NUMERO_INSCRICAO: "80 6 26 099999-90",
        DATA_INSCRICAO: "02/06/2026",
        VALOR_CONSOLIDADO: "10.000,00",
        UF_DEVEDOR: "MG",
        RECEITA_PRINCIPAL: "IRPJ",
      },
      "Nao_Previdenciario"
    )!;
    inserirLote([l1c, l3b, l4], sync3.id);
    consolidarEmpresas(sync3.id, "2026_trimestre_02");
    db.prepare("UPDATE sincronizacoes SET status='completed', concluida_em=datetime('now') WHERE id=?").run(sync3.id);

    const nova = db
      .prepare("SELECT entrou_na_base_em FROM empresas WHERE cnpj = ?")
      .get("44555666000130") as { entrou_na_base_em: string | null };
    assert.equal(nova.entrou_na_base_em, "2026_trimestre_02");

    // Empresa pré-existente mantém a marcação anterior (não é sobrescrita)
    const jaExistia = db
      .prepare("SELECT entrou_na_base_em FROM empresas WHERE cnpj = ?")
      .get("12345678000195") as { entrou_na_base_em: string | null };
    assert.equal(jaExistia.entrou_na_base_em, null);
  });

  console.log("Filtros:");
  await test("filtro por UF e natureza", () => {
    assert.equal(listarEmpresas({ uf: "MG", page: 1, pageSize: 10 }).total, 1);
    assert.equal(
      listarEmpresas({ natureza: "Tributário Simples Nacional", page: 1, pageSize: 10 }).total,
      1
    );
    assert.equal(listarEmpresas({ busca: "12345678", page: 1, pageSize: 10 }).total, 1);
    assert.equal(listarEmpresas({ busca: "EMPRESA NOVA", page: 1, pageSize: 10 }).total, 1);
  });

  console.log("Autenticação:");
  await test("primeiro usuário vira admin aprovado; segundo fica pendente", () => {
    const u1 = registrar("Admin", "admin@x.com", "123456");
    assert.equal(u1.role, "admin");
    assert.equal(u1.status, "aprovado");
    const u2 = registrar("Comum", "user@x.com", "123456");
    assert.equal(u2.status, "pendente");
    assert.throws(() => login("user@x.com", "123456"), /aguarda liberação/);
    const { token } = login("admin@x.com", "123456");
    assert.ok(token.length > 20);
  });

  console.log("Excel:");
  await test("gerarExcel produz arquivo xlsx válido", async () => {
    const r = listarEmpresas({ page: 1, pageSize: 10 });
    const buf = await gerarExcel(r.items);
    // Arquivos xlsx são ZIPs: assinatura PK
    assert.equal(buf.subarray(0, 2).toString(), "PK");
    assert.ok(buf.length > 1000);
  });

  console.log(`\n${passed} testes passaram.`);
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
}

main().catch((err) => {
  console.error("\nFALHA NOS TESTES:", err);
  process.exit(1);
});
