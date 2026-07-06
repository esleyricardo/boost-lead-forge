import { useMemo, useState } from "react";
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
} from "@/lib/api";
import EmpresaDetalheDialog from "@/components/EmpresaDetalheDialog";
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

export default function Devedores() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<EmpresasFiltro>({
    page: 1,
    pageSize: 25,
    orderBy: "valorTotal",
    orderDir: "desc",
  });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [detalheCnpj, setDetalheCnpj] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const { data, isLoading } = useQuery({
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

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function atualizarFiltro(mudancas: Partial<EmpresasFiltro>) {
    setFiltro((f) => ({ ...f, ...mudancas, page: mudancas.page ?? 1 }));
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
            {data ? `${data.total.toLocaleString("pt-BR")} empresas encontradas` : "Carregando..."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={enriquecerSelecionadas}
            disabled={selecionados.size === 0 || enrStatus?.executando}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Enriquecer selecionadas ({selecionados.size})
          </Button>
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
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="min-w-56 flex-1">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                atualizarFiltro({ busca });
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Buscar por razão social ou CNPJ..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <Button type="submit" variant="secondary" size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>

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
            <SelectTrigger className="w-24">
              <SelectValue placeholder="UF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>UF</SelectItem>
              {UFS.map((uf) => (
                <SelectItem key={uf} value={uf}>
                  {uf}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            placeholder="Valor mín."
            className="w-32"
            onChange={(e) =>
              atualizarFiltro({ valorMin: e.target.value ? Number(e.target.value) : undefined })
            }
          />
          <Input
            type="number"
            placeholder="Valor máx."
            className="w-32"
            onChange={(e) =>
              atualizarFiltro({ valorMax: e.target.value ? Number(e.target.value) : undefined })
            }
          />

          <Select
            value={filtro.enriquecidas || TODAS}
            onValueChange={(v) =>
              atualizarFiltro({
                enriquecidas: v === TODAS ? undefined : (v as "sim" | "nao"),
              })
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Enriquecimento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Enriquecidas ou não</SelectItem>
              <SelectItem value="sim">Só enriquecidas</SelectItem>
              <SelectItem value="nao">Só não enriquecidas</SelectItem>
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={!!filtro.apenasNovas}
              onCheckedChange={(v) => atualizarFiltro({ apenasNovas: v })}
            />
            Só novas
          </label>
        </CardContent>
      </Card>

      <Card>
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
              <TableHead>Contatos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
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

        <div className="flex items-center justify-between border-t p-3">
          <p className="text-sm text-muted-foreground">
            Página {data?.page || 1} de {totalPaginas}
          </p>
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
