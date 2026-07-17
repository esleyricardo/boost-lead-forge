import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type {
  EmpresasFiltro,
  EnriquecimentoStatus,
  PaginatedEmpresas,
} from "@shared/types";
import { NATUREZAS_DIVIDA, UFS } from "@shared/types";
import {
  api,
  downloadArquivo,
  formatarCnpj,
  formatarData,
  formatarMoeda,
  formatarTrimestre,
} from "@/lib/api";
import EmpresaDetalheDialog from "@/components/EmpresaDetalheDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TODAS = "__todas__";

function filtroParaQuery(f: EmpresasFiltro): string {
  const params = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== false) params.set(k, String(v));
  });
  return params.toString();
}

/**
 * Gera as opções "Dívida inscrita a partir do Xº trim/AAAA" para os últimos
 * `n` trimestres já iniciados, do mais recente ao mais antigo. Cada opção tem
 * a data de início do trimestre (AAAA-MM-DD).
 */
function opcoesTrimestreInscricao(n = 6): { valor: string; label: string }[] {
  const hoje = new Date();
  let ano = hoje.getFullYear();
  let tri = Math.floor(hoje.getMonth() / 3) + 1; // 1..4
  const out: { valor: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const mesInicio = String((tri - 1) * 3 + 1).padStart(2, "0");
    out.push({ valor: `${ano}-${mesInicio}-01`, label: `${tri}º trim/${ano}` });
    tri--;
    if (tri === 0) {
      tri = 4;
      ano--;
    }
  }
  return out;
}

const FILTRO_PADRAO: EmpresasFiltro = { page: 1, pageSize: 25, orderBy: "valorTotal", orderDir: "desc" };
const CHAVE_ESTADO = "devedores_estado_ui";

/** Restaura a pesquisa ao voltar para a aba (senão tudo resetava ao navegar). */
function estadoInicial() {
  try {
    const salvo = sessionStorage.getItem(CHAVE_ESTADO);
    if (salvo) {
      const e = JSON.parse(salvo);
      return {
        filtro: { ...FILTRO_PADRAO, ...(e.filtro || {}) } as EmpresasFiltro,
        busca: String(e.busca || ""),
        valorMinTexto: String(e.valorMinTexto || ""),
        valorMaxTexto: String(e.valorMaxTexto || ""),
      };
    }
  } catch {
    /* estado corrompido: usa o padrão */
  }
  return { filtro: FILTRO_PADRAO, busca: "", valorMinTexto: "", valorMaxTexto: "" };
}

export default function Devedores() {
  const queryClient = useQueryClient();
  const inicial = useMemo(estadoInicial, []);
  const [busca, setBusca] = useState(inicial.busca);
  const [valorMinTexto, setValorMinTexto] = useState(inicial.valorMinTexto);
  const [valorMaxTexto, setValorMaxTexto] = useState(inicial.valorMaxTexto);
  const [filtro, setFiltro] = useState<EmpresasFiltro>(inicial.filtro);

  useEffect(() => {
    sessionStorage.setItem(
      CHAVE_ESTADO,
      JSON.stringify({ filtro, busca, valorMinTexto, valorMaxTexto })
    );
  }, [filtro, busca, valorMinTexto, valorMaxTexto]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [detalheCnpj, setDetalheCnpj] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["empresas", filtro],
    queryFn: () => api.get<PaginatedEmpresas>(`/empresas?${filtroParaQuery(filtro)}`),
    placeholderData: keepPreviousData,
  });

  const { data: enrStatus } = useQuery({
    queryKey: ["enriquecimento-status"],
    queryFn: () =>
      api.get<{ status: EnriquecimentoStatus }>("/enriquecimento/status").then((r) => r.status),
    refetchInterval: (q) => (q.state.data?.executando ? 2000 : 15000),
  });

  const { data: trimestresEntrada } = useQuery({
    queryKey: ["trimestres-entrada"],
    queryFn: () =>
      api
        .get<{ trimestres: string[] }>("/empresas-meta/trimestres-entrada")
        .then((r) => r.trimestres),
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function atualizarFiltro(mudancas: Partial<EmpresasFiltro>) {
    setFiltro((f) => ({ ...f, ...mudancas, page: mudancas.page ?? 1 }));
  }

  function pesquisar() {
    atualizarFiltro({
      busca: busca.trim() || undefined,
      valorMin: valorMinTexto ? Number(valorMinTexto) : undefined,
      valorMax: valorMaxTexto ? Number(valorMaxTexto) : undefined,
    });
  }

  function limparFiltros() {
    setBusca("");
    setValorMinTexto("");
    setValorMaxTexto("");
    setFiltro(FILTRO_PADRAO);
  }

  async function enriquecerPesquisa() {
    try {
      const r = await api.post<{ status: EnriquecimentoStatus }>("/enriquecimento/filtro", {
        filtro,
      });
      toast.success(
        `Enriquecimento de ${r.status.total.toLocaleString("pt-BR")} empresa(s) da pesquisa iniciado.`
      );
      queryClient.invalidateQueries({ queryKey: ["enriquecimento-status"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao iniciar enriquecimento.");
    }
  }

  const todosDaPaginaSelecionados = useMemo(
    () => !!data?.items.length && data.items.every((e) => selecionados.has(e.cnpj)),
    [data, selecionados]
  );

  function alternarPagina(marcar: boolean) {
    setSelecionados((sel) => {
      const novo = new Set(sel);
      data?.items.forEach((e) => (marcar ? novo.add(e.cnpj) : novo.delete(e.cnpj)));
      return novo;
    });
  }

  async function enriquecerSelecionadas() {
    try {
      await api.post("/enriquecimento", { cnpjs: [...selecionados] });
      toast.success(`Enriquecimento de ${selecionados.size} empresa(s) iniciado.`);
      setSelecionados(new Set());
      queryClient.invalidateQueries({ queryKey: ["enriquecimento-status"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao iniciar enriquecimento.");
    }
  }

  async function exportarExcel() {
    setExportando(true);
    try {
      await downloadArquivo("/export/excel", {
        filtro,
        cnpjs: selecionados.size > 0 ? [...selecionados] : undefined,
      });
      toast.success(
        selecionados.size > 0
          ? `Excel gerado com as ${selecionados.size} empresas selecionadas.`
          : "Excel gerado com o filtro atual."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao exportar.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Devedores</h1>
          <p className="text-sm text-muted-foreground">
            {isFetching ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando na base...
              </span>
            ) : data ? (
              `${data.total.toLocaleString("pt-BR")}${data.totalAproximado ? "+" : ""} empresas encontradas`
            ) : (
              "Carregando..."
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={enriquecerSelecionadas}
            disabled={selecionados.size === 0 || enrStatus?.executando}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Enriquecer selecionadas ({selecionados.size})
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary" disabled={enrStatus?.executando || !data?.total}>
                <Sparkles className="mr-2 h-4 w-4" />
                Enriquecer toda a pesquisa
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Enriquecer toda a pesquisa?</AlertDialogTitle>
                <AlertDialogDescription>
                  Serão enriquecidas as empresas <strong>ainda não enriquecidas</strong> que casam
                  com os filtros atuais ({data?.total.toLocaleString("pt-BR")} empresas na
                  pesquisa, limite de 20.000 por vez). A consulta ao OpenCNPJ respeita um ritmo
                  seguro: cada 1.000 empresas levam cerca de 7 minutos. O processo roda em segundo
                  plano e você pode acompanhar pela barra de progresso.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={enriquecerPesquisa}>
                  Iniciar enriquecimento
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" onClick={exportarExcel} disabled={exportando}>
            {exportando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar Excel
          </Button>
        </div>
      </div>

      {enrStatus?.executando && (
        <Card>
          <CardContent className="flex items-center gap-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                Enriquecendo dados... {enrStatus.processados}/{enrStatus.total}
                {enrStatus.cnpjAtual && (
                  <span className="text-muted-foreground">
                    {" "}
                    (CNPJ {formatarCnpj(enrStatus.cnpjAtual)})
                  </span>
                )}
              </p>
              <Progress
                value={(enrStatus.processados / Math.max(1, enrStatus.total)) * 100}
                className="mt-1 h-2"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {enrStatus.sucesso} ok · {enrStatus.falhas} falhas
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              pesquisar();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-64 flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Empresa (nome ou CNPJ) — opcional
              </label>
              <Input
                placeholder="Vazio = todas as empresas dos filtros abaixo"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Valor mínimo (R$)</label>
              <Input
                type="number"
                placeholder="Ex: 100000"
                className="w-36"
                value={valorMinTexto}
                onChange={(e) => setValorMinTexto(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Valor máximo (R$)</label>
              <Input
                type="number"
                placeholder="Ex: 5000000"
                className="w-36"
                value={valorMaxTexto}
                onChange={(e) => setValorMaxTexto(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={isFetching}>
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {isFetching ? "Buscando..." : "Pesquisar"}
            </Button>
            <Button type="button" variant="ghost" onClick={limparFiltros}>
              Limpar
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
            <Select
              value={filtro.natureza || TODAS}
              onValueChange={(v) => atualizarFiltro({ natureza: v === TODAS ? undefined : v })}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Natureza da dívida" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as naturezas</SelectItem>
                {NATUREZAS_DIVIDA.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filtro.uf || TODAS}
              onValueChange={(v) => atualizarFiltro({ uf: v === TODAS ? undefined : v })}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todos estados</SelectItem>
                {UFS.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filtro.esfera || TODAS}
              onValueChange={(v) =>
                atualizarFiltro({
                  esfera: v === TODAS ? undefined : (v as "federal" | "estadual"),
                })
              }
            >
              <SelectTrigger
                className="w-44"
                title="Esfera da dívida: federal (PGFN) ou estadual (procuradorias estaduais)"
              >
                <SelectValue placeholder="Esfera" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas as esferas</SelectItem>
                <SelectItem value="federal">Federal (União)</SelectItem>
                <SelectItem value="estadual">Estadual</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filtro.inscricaoDe || TODAS}
              onValueChange={(v) =>
                atualizarFiltro({ inscricaoDe: v === TODAS ? undefined : v })
              }
            >
              <SelectTrigger
                className="w-60"
                title="Mantém só empresas cuja dívida mais recente foi inscrita a partir do trimestre escolhido (data oficial da PGFN). Serve para focar nas mais recentes."
              >
                <SelectValue placeholder="Dívida inscrita a partir de" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Dívida de qualquer período</SelectItem>
                {opcoesTrimestreInscricao().map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>
                    Dívida a partir do {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filtro.enriquecidas || TODAS}
              onValueChange={(v) =>
                atualizarFiltro({
                  enriquecidas: v === TODAS ? undefined : (v as "sim" | "nao"),
                })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Enriquecimento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Enriquecidas ou não</SelectItem>
                <SelectItem value="sim">Só enriquecidas</SelectItem>
                <SelectItem value="nao">Só não enriquecidas</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filtro.trimestreEntrada || TODAS}
              onValueChange={(v) =>
                atualizarFiltro({ trimestreEntrada: v === TODAS ? undefined : v })
              }
            >
              <SelectTrigger
                className="w-52"
                title="Trimestre em que a empresa entrou na base da PGFN (apurado pelo comparativo, na aba Sincronização)"
              >
                <SelectValue placeholder="Entrou na base em" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Entrou em qualquer período</SelectItem>
                {trimestresEntrada?.map((t) => (
                  <SelectItem key={t} value={t}>
                    Entrou no {formatarTrimestre(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={!!filtro.apenasNovas}
                onCheckedChange={(v) => atualizarFiltro({ apenasNovas: v })}
              />
              Só novas
            </label>
            <span className="ml-auto text-xs text-muted-foreground">
              Estes filtros são aplicados na hora, sem precisar clicar em Pesquisar
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className={isFetching ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={todosDaPaginaSelecionados}
                  onCheckedChange={(v) => alternarPagina(v === true)}
                />
              </TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>UF</TableHead>
              <TableHead>Natureza(s)</TableHead>
              <TableHead className="text-right">Dívidas</TableHead>
              <TableHead className="text-right">
                <button
                  className="hover:underline"
                  onClick={() =>
                    atualizarFiltro({
                      orderBy: "valorTotal",
                      orderDir:
                        filtro.orderBy === "valorTotal" && filtro.orderDir === "desc"
                          ? "asc"
                          : "desc",
                    })
                  }
                >
                  Valor total ↕
                </button>
              </TableHead>
              <TableHead>
                <button
                  className="hover:underline"
                  onClick={() =>
                    atualizarFiltro({
                      orderBy: "dataInscricaoMaisRecente",
                      orderDir:
                        filtro.orderBy === "dataInscricaoMaisRecente" && filtro.orderDir === "desc"
                          ? "asc"
                          : "desc",
                    })
                  }
                  title="Data oficial (PGFN) da inscrição mais recente em dívida ativa"
                >
                  Dívida mais recente ↕
                </button>
              </TableHead>
              <TableHead title="Data em que o sistema detectou a empresa na base">
                Detectada em
              </TableHead>
              <TableHead>
                <button
                  className="hover:underline"
                  onClick={() =>
                    atualizarFiltro({
                      orderBy: "entrouNaBaseEm",
                      orderDir:
                        filtro.orderBy === "entrouNaBaseEm" && filtro.orderDir === "desc"
                          ? "asc"
                          : "desc",
                    })
                  }
                  title="Trimestre em que a empresa entrou na base da PGFN (comparativo de trimestres). Vazio = já estava antes do período comparado."
                >
                  Entrou na base ↕
                </button>
              </TableHead>
              <TableHead>Contatos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  Nenhuma empresa encontrada. Ajuste os filtros ou execute uma sincronização.
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((e) => (
              <TableRow
                key={e.cnpj}
                className="cursor-pointer"
                onClick={() => setDetalheCnpj(e.cnpj)}
              >
                <TableCell onClick={(ev) => ev.stopPropagation()}>
                  <Checkbox
                    checked={selecionados.has(e.cnpj)}
                    onCheckedChange={(v) =>
                      setSelecionados((sel) => {
                        const novo = new Set(sel);
                        if (v === true) novo.add(e.cnpj);
                        else novo.delete(e.cnpj);
                        return novo;
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="max-w-72 truncate font-medium">{e.razaoSocial}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatarCnpj(e.cnpj)}
                      </p>
                    </div>
                    {e.isNova && (
                      <Badge className="bg-amber-500 hover:bg-amber-500">Nova</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{e.uf || "—"}</TableCell>
                <TableCell className="max-w-44">
                  <span className="line-clamp-2 text-xs">{e.naturezas}</span>
                </TableCell>
                <TableCell className="text-right">{e.qtdDividas}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatarMoeda(e.valorTotal)}
                </TableCell>
                <TableCell>{formatarData(e.dataInscricaoMaisRecente)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatarData(e.dataPrimeiraDeteccao)}
                </TableCell>
                <TableCell>
                  {e.entrouNaBaseEm ? (
                    <Badge variant="outline" className="border-emerald-600 text-emerald-600">
                      {formatarTrimestre(e.entrouNaBaseEm)}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {e.enrichedAt ? (
                    <Badge variant="secondary">
                      {e.telefones || e.email ? "com contatos" : "sem contatos"}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Página {data?.page || 1} de {totalPaginas.toLocaleString("pt-BR")}
              {data?.totalAproximado ? "+" : ""}
            </p>
            <Select
              value={String(filtro.pageSize || 25)}
              onValueChange={(v) => atualizarFiltro({ pageSize: Number(v), page: 1 })}
            >
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} por página
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={(filtro.page || 1) <= 1}
              onClick={() => atualizarFiltro({ page: (filtro.page || 1) - 1 })}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(filtro.page || 1) >= totalPaginas}
              onClick={() => atualizarFiltro({ page: (filtro.page || 1) + 1 })}
            >
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <EmpresaDetalheDialog cnpj={detalheCnpj} onClose={() => setDetalheCnpj(null)} />
    </div>
  );
}
