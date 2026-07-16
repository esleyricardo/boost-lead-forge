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
  const { db, setConfig, getConfig: getConfigTest, resetarDadosPGFN } = await import("../db");
  const {
    normalizarLinha,
    normalizarData,
    parseValor,
    inserirLote,
    consolidarEmpresas,
    trimestresCandidatos,
    recuperarSincronizacoesOrfas,
  } = await import("../services/pgfn-sync");
  const { trimestreAnteriorDe, aplicarPasseComparativo, resetarEntradas } = await import(
    "../services/comparativo"
  );
  const { formatarCnpj, formatarTrimestre, gerarExcel } = await import("../services/excel");
  const { registrar, login, alterarPropriaSenha, redefinirSenha } = await import("../auth");
  const { listarEmpresas, buscarEmpresa, listarTrimestresEntrada } = await import(
    "../services/empresas"
  );

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

  await test("recuperarSincronizacoesOrfas marca sync 'running' interrompida como erro", () => {
    db.prepare("INSERT INTO sincronizacoes (status, disparo) VALUES ('running','manual')").run();
    const orfa = db.prepare("SELECT MAX(id) AS id FROM sincronizacoes").get() as { id: number };
    const marcadas = recuperarSincronizacoesOrfas();
    assert.equal(marcadas, 1);
    const row = db
      .prepare("SELECT status, error_message, concluida_em FROM sincronizacoes WHERE id = ?")
      .get(orfa.id) as { status: string; error_message: string | null; concluida_em: string | null };
    assert.equal(row.status, "error");
    assert.ok(row.error_message && row.error_message.includes("reiniciou"));
    assert.ok(row.concluida_em);
    // Idempotente: sem nenhuma 'running', não altera nada
    assert.equal(recuperarSincronizacoesOrfas(), 0);
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

  await test("comparativo em passes classifica o trimestre de entrada de cada empresa", () => {
    // Estado atual (2026_trimestre_02): ativas = 12345678000195 e 11222333000181.
    // Cenário: a antiga (123...) já existia nos dois trimestres anteriores;
    // a nova (112...) só apareceu agora — ausente em ambos.
    setConfig("trimestre_atual", "2026_trimestre_02");
    resetarEntradas();

    // Passe 1: ref = trimestre anterior (2026_trimestre_01) contém só a antiga
    db.prepare("DELETE FROM cnpjs_trimestre_ref").run();
    db.prepare("INSERT INTO cnpjs_trimestre_ref (cnpj) VALUES (?)").run("12345678000195");
    assert.equal(aplicarPasseComparativo("2026_trimestre_02"), 1);

    // Passe 2: ref = dois trimestres atrás (2025_trimestre_04) também só tem a antiga.
    // Ninguém mais sem classificação está ausente — nenhum novo marcado.
    assert.equal(aplicarPasseComparativo("2026_trimestre_01"), 0);

    const filtradas = listarEmpresas({
      trimestreEntrada: "2026_trimestre_02",
      page: 1,
      pageSize: 10,
    });
    assert.equal(filtradas.total, 1);
    assert.equal(filtradas.items[0].cnpj, "11222333000181");
    assert.equal(filtradas.items[0].entrouNaBaseEm, "2026_trimestre_02");

    // A empresa presente nos trimestres anteriores fica sem marcação (antiga)
    const antiga = db
      .prepare("SELECT entrou_na_base_em FROM empresas WHERE cnpj = ?")
      .get("12345678000195") as { entrou_na_base_em: string | null };
    assert.equal(antiga.entrou_na_base_em, null);
  });

  await test("comparativo identifica entrada no trimestre intermediário", () => {
    resetarEntradas();
    // Passe 1: no trimestre anterior (2026_trimestre_01) AMBAS já existiam
    db.prepare("DELETE FROM cnpjs_trimestre_ref").run();
    db.prepare("INSERT INTO cnpjs_trimestre_ref (cnpj) VALUES (?)").run("12345678000195");
    db.prepare("INSERT INTO cnpjs_trimestre_ref (cnpj) VALUES (?)").run("11222333000181");
    assert.equal(aplicarPasseComparativo("2026_trimestre_02"), 0);

    // Passe 2: dois trimestres atrás só existia a antiga → a outra entrou no intermediário
    db.prepare("DELETE FROM cnpjs_trimestre_ref").run();
    db.prepare("INSERT INTO cnpjs_trimestre_ref (cnpj) VALUES (?)").run("12345678000195");
    assert.equal(aplicarPasseComparativo("2026_trimestre_01"), 1);

    const meio = db
      .prepare("SELECT entrou_na_base_em FROM empresas WHERE cnpj = ?")
      .get("11222333000181") as { entrou_na_base_em: string | null };
    assert.equal(meio.entrou_na_base_em, "2026_trimestre_01");

    // Restaura o cenário do teste anterior para os testes seguintes
    resetarEntradas();
    db.prepare("DELETE FROM cnpjs_trimestre_ref").run();
    db.prepare("INSERT INTO cnpjs_trimestre_ref (cnpj) VALUES (?)").run("12345678000195");
    aplicarPasseComparativo("2026_trimestre_02");
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

  await test("listarTrimestresEntrada retorna os trimestres distintos para o filtro", () => {
    assert.deepEqual(listarTrimestresEntrada(), ["2026_trimestre_02"]);
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

  await test("busca por nome ignora acentos e maiúsculas", () => {
    // Na base os nomes vêm sem acento (ex: "EMPRESA EXEMPLO LTDA")
    assert.equal(listarEmpresas({ busca: "exémplo", page: 1, pageSize: 10 }).total, 1);
    assert.equal(listarEmpresas({ busca: "êmpresa nôva", page: 1, pageSize: 10 }).total, 1);
    assert.equal(listarEmpresas({ busca: "exemplo", page: 1, pageSize: 10 }).total, 1);
  });

  await test("filtro por recência da dívida (inscricaoDe) mantém só as recentes", () => {
    // Empresas ativas têm dívida mais recente em 2019 (EXEMPLO, RECEM CHEGADA)
    // e 2026-06-02 (EMPRESA NOVA)
    const todas = listarEmpresas({ page: 1, pageSize: 10 }).total;
    assert.ok(todas >= 2);
    const recentes = listarEmpresas({ inscricaoDe: "2026-01-01", page: 1, pageSize: 10 });
    assert.equal(recentes.total, 1);
    assert.equal(recentes.items[0].cnpj, "11222333000181");
    // Faixa fechada também funciona
    assert.equal(
      listarEmpresas({ inscricaoDe: "2019-01-01", inscricaoAte: "2019-12-31", page: 1, pageSize: 10 })
        .total,
      todas - 1
    );
  });

  console.log("Dívidas estaduais:");
  const { mapearLinhaEstadual, detectarFormatoCsv } = await import("../services/estaduais");

  await test("mapearLinhaEstadual entende variações de colunas dos estados", () => {
    const l = mapearLinhaEstadual(
      {
        "CPF/CNPJ": "12.345.678/0001-95",
        "NOME DEVEDOR": "EMPRESA EXEMPLO LTDA",
        "VALOR TOTAL": "1.234,56",
        "DATA INSCRIÇÃO": "05/03/2021",
        "NUM CDA": "GO-CDA-777",
        "TIPO DÍVIDA": "ICMS",
      },
      { id: "PGE-GO", uf: "GO" }
    )!;
    assert.equal(l.cnpj, "12345678000195");
    assert.equal(l.valorConsolidado, 1234.56);
    assert.equal(l.dataInscricao, "2021-03-05");
    assert.equal(l.numeroInscricao, "PGE-GO:GO-CDA-777");
    assert.equal(l.naturezaDivida, "Dívida Ativa Estadual (GO)");
    assert.equal(l.receitaPrincipal, "ICMS");

    // Sem CDA: vira linha agregada por devedor (chave estável fonte:cnpj)
    const agregada = mapearLinhaEstadual(
      { CNPJ: "98765432000110", RAZAO_SOCIAL: "OUTRA SA", SALDO_DEVEDOR: "500,00" },
      { id: "PGE-RS", uf: "RS" }
    )!;
    assert.equal(agregada.numeroInscricao, "PGE-RS:98765432000110");

    // Pessoa física (CPF) fica fora nesta etapa
    assert.equal(
      mapearLinhaEstadual({ "CPF/CNPJ": "123.456.789-01", NOME: "PESSOA" }, { id: "PGE-GO", uf: "GO" }),
      null
    );
  });

  await test("detectarFormatoCsv identifica separador e codificação", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csv-fmt-"));
    const arq = path.join(dir, "t.csv");
    fs.writeFileSync(arq, Buffer.from("CNPJ;NOME;VALOR\n1;INSCRI\xc7\xc3O;2\n", "latin1"));
    const fmt = detectarFormatoCsv(arq);
    assert.equal(fmt.delimiter, ";");
    assert.equal(fmt.encoding, "latin1");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test("sincronização estadual não desativa dívidas federais (escopo por origem)", () => {
    // Sync estadual A: dívida da empresa federal existente + empresa nova de GO
    db.prepare("INSERT INTO sincronizacoes (status, disparo, fonte) VALUES ('running','manual','PGE-GO')").run();
    const syncGo = db.prepare("SELECT MAX(id) AS id FROM sincronizacoes").get() as { id: number };
    const est1 = mapearLinhaEstadual(
      {
        "CPF/CNPJ": "12.345.678/0001-95",
        NOME: "EMPRESA EXEMPLO LTDA",
        VALOR: "50.000,00",
        DT_INSCRICAO: "10/05/2020",
        CDA: "GO-1",
      },
      { id: "PGE-GO", uf: "GO" }
    )!;
    const est2 = mapearLinhaEstadual(
      { CNPJ: "55.666.777/0001-55", NOME: "GOIANA COMERCIO LTDA", VALOR: "80.000,00", CDA: "GO-2" },
      { id: "PGE-GO", uf: "GO" }
    )!;
    inserirLote([est1, est2], syncGo.id, "PGE-GO", "estadual");
    consolidarEmpresas(syncGo.id, null, "PGE-GO");
    db.prepare("UPDATE sincronizacoes SET status='completed', concluida_em=datetime('now') WHERE id=?").run(syncGo.id);

    // Dívidas federais continuam ativas
    const federaisAtivas = (
      db.prepare("SELECT COUNT(*) AS n FROM dividas WHERE origem='PGFN' AND ativa=1").get() as { n: number }
    ).n;
    assert.ok(federaisAtivas >= 3);

    // Empresa com dívida nas duas esferas
    const emp = db
      .prepare("SELECT esferas, valor_total, qtd_dividas FROM empresas WHERE cnpj='12345678000195'")
      .get() as { esferas: string; valor_total: number; qtd_dividas: number };
    assert.ok(emp.esferas.includes("federal") && emp.esferas.includes("estadual"));
    assert.equal(emp.qtd_dividas, 2);
    assert.equal(emp.valor_total, 250000);

    // Empresa só estadual
    const goiana = db.prepare("SELECT esferas FROM empresas WHERE cnpj='55666777000155'").get() as {
      esferas: string;
    };
    assert.equal(goiana.esferas, "estadual");

    // Filtro por esfera
    assert.equal(listarEmpresas({ esfera: "estadual", page: 1, pageSize: 10 }).total, 2);
    assert.ok(listarEmpresas({ esfera: "federal", page: 1, pageSize: 10 }).total >= 3);

    // Sync estadual B: a empresa federal saiu da base de GO
    db.prepare("INSERT INTO sincronizacoes (status, disparo, fonte) VALUES ('running','manual','PGE-GO')").run();
    const syncGo2 = db.prepare("SELECT MAX(id) AS id FROM sincronizacoes").get() as { id: number };
    inserirLote([est2], syncGo2.id, "PGE-GO", "estadual");
    consolidarEmpresas(syncGo2.id, null, "PGE-GO");
    db.prepare("UPDATE sincronizacoes SET status='completed', concluida_em=datetime('now') WHERE id=?").run(syncGo2.id);

    const empDepois = db
      .prepare("SELECT esferas, valor_total FROM empresas WHERE cnpj='12345678000195'")
      .get() as { esferas: string; valor_total: number };
    assert.equal(empDepois.esferas, "federal"); // dívida estadual saiu
    assert.equal(empDepois.valor_total, 200000); // só a federal
    const federaisDepois = (
      db.prepare("SELECT COUNT(*) AS n FROM dividas WHERE origem='PGFN' AND ativa=1").get() as { n: number }
    ).n;
    assert.equal(federaisDepois, federaisAtivas); // federais intocadas
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

  await test("usuário troca a própria senha confirmando a atual", () => {
    const admin = login("admin@x.com", "123456").usuario;
    assert.throws(() => alterarPropriaSenha(admin.id, "errada", "nova-senha"), /Senha atual incorreta/);
    assert.throws(() => alterarPropriaSenha(admin.id, "123456", "curta"), /6 caracteres/);
    alterarPropriaSenha(admin.id, "123456", "nova-senha");
    assert.throws(() => login("admin@x.com", "123456"), /incorretos/);
    assert.ok(login("admin@x.com", "nova-senha").token);
  });

  await test("admin redefine a senha de um usuário (recuperação)", () => {
    const user = db.prepare("SELECT id FROM usuarios WHERE email = 'user@x.com'").get() as {
      id: number;
    };
    assert.throws(() => redefinirSenha(user.id, "curta"), /6 caracteres/);
    assert.throws(() => redefinirSenha(99999, "senha-valida"), /não encontrado/);
    redefinirSenha(user.id, "senha-temporaria");
    // status pendente continua bloqueando o login, mas a senha nova é aceita
    assert.throws(() => login("user@x.com", "senha-temporaria"), /aguarda liberação/);
    db.prepare("UPDATE usuarios SET status = 'aprovado' WHERE id = ?").run(user.id);
    assert.ok(login("user@x.com", "senha-temporaria").token);
  });

  console.log("Excel:");
  await test("gerarExcel produz arquivo xlsx válido", async () => {
    const r = listarEmpresas({ page: 1, pageSize: 10 });
    const buf = await gerarExcel(r.items);
    // Arquivos xlsx são ZIPs: assinatura PK
    assert.equal(buf.subarray(0, 2).toString(), "PK");
    assert.ok(buf.length > 1000);
  });

  console.log("Reset da base:");
  await test("resetarDadosPGFN zera dados de sincronização e mantém usuários", () => {
    // Pré-condição: há dados carregados pelos testes anteriores
    assert.ok((db.prepare("SELECT COUNT(*) AS n FROM empresas").get() as { n: number }).n > 0);
    const usuariosAntes = (db.prepare("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number }).n;
    assert.ok(usuariosAntes > 0);
    setConfig("ultima_sincronizacao", "2026-01-01T00:00:00Z");

    resetarDadosPGFN();

    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM dividas").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM empresas").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sincronizacoes").get() as { n: number }).n, 0);
    // Usuários preservados
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS n FROM usuarios").get() as { n: number }).n,
      usuariosAntes
    );
    // Config de sync limpa; agendamento preservado
    assert.equal(getConfigTest("ultima_sincronizacao"), null);
    assert.equal(getConfigTest("cron_horario"), "06:00");
    assert.equal(listarEmpresas({ page: 1, pageSize: 10 }).total, 0);
  });

  console.log(`\n${passed} testes passaram.`);
  fs.rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
}

main().catch((err) => {
  console.error("\nFALHA NOS TESTES:", err);
  process.exit(1);
});
