import { useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { EmpresasFiltro, PaginatedEmpresas } from "@shared/types";
import { UFS } from "@shared/types";
import { telefonesComDDI } from "@shared/format";
import {
  api,
  downloadArquivo,
  formatarCnpj,
  formatarDataHora,
  formatarMoeda,
} from "@/lib/api";
import EmpresaDetalheDialog from "@/components/EmpresaDetalheDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export default function Enriquecidas() {
  const [buscaTexto, setBuscaTexto] = useState("");
  const [filtro, setFiltro] = useState<EmpresasFiltro>({
    enriquecidas: "sim",
    orderBy: "enrichedAt",
    orderDir: "desc",
    page: 1,
    pageSize: 25,
  });
  const [detalheCnpj, setDetalheCnpj] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["enriquecidas", filtro],
    queryFn: () => api.get<PaginatedEmpresas>(`/empresas?${filtroParaQuery(filtro)}`),
    placeholderData: keepPreviousData,
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function atualizarFiltro(mudancas: Partial<EmpresasFiltro>) {
    setFiltro((f) => ({ ...f, ...mudancas, page: mudancas.page ?? 1 }));
  }

  function pesquisar(e: FormEvent) {
    e.preventDefault();
    atualizarFiltro({ busca: buscaTexto.trim() || undefined });
  }

  async function exportar(formato: "excel" | "csv" | "pdf") {
    setExportando(true);
    try {
      await downloadArquivo(`/export/${formato}`, { filtro });
      toast.success(
        formato === "pdf"
          ? "PDF gerado (filtro atual). PDF é limitado às primeiras 3.000 empresas."
          : `${formato.toUpperCase()} gerado (filtro atual).`
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
          <h1 className="text-2xl font-bold">Empresas enriquecidas</h1>
          <p className="text-sm text-muted-foreground">
            {isFetching ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
              </span>
            ) : data ? (
              `${data.total.toLocaleString("pt-BR")} empresas com contatos buscados no OpenCNPJ`
            ) : (
              "Carregando..."
            )}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={exportando || !data?.total}>
              {exportando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Exportar (filtro atual)
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportar("excel")}>Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportar("csv")}>CSV (.csv)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportar("pdf")}>PDF (.pdf)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={pesquisar} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Empresa (nome ou CNPJ) — opcional
              </label>
              <Input
                placeholder="Vazio = todas as enriquecidas"
                value={buscaTexto}
                onChange={(e) => setBuscaTexto(e.target.value)}
              />
            </div>
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
            <Button type="submit" disabled={isFetching}>
              <Search className="mr-2 h-4 w-4" />
              Pesquisar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className={isFetching ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
        {!isLoading && data?.items.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhuma empresa enriquecida encontrada</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Na página de Devedores, selecione as empresas desejadas e clique em
              “Enriquecer selecionadas” (ou “Enriquecer toda a pesquisa”) para buscar telefone,
              email e sócios.
            </p>
          </CardContent>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Telefones</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Município/UF</TableHead>
                  <TableHead className="text-right">Valor devido</TableHead>
                  <TableHead>Enriquecida em</TableHead>
                  <TableHead>Por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                )}
                {data?.items.map((e) => (
                  <TableRow
                    key={e.cnpj}
                    className="cursor-pointer"
                    onClick={() => setDetalheCnpj(e.cnpj)}
                  >
                    <TableCell>
                      <p className="max-w-64 truncate font-medium">{e.razaoSocial}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatarCnpj(e.cnpj)}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.telefones ? (
                        telefonesComDDI(e.telefones)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-52 truncate text-sm">
                      {e.email || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.municipio ? `${e.municipio}/${e.uf || ""}` : e.uf || "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatarMoeda(e.valorTotal)}
                    </TableCell>
                    <TableCell className="text-sm">{formatarDataHora(e.enrichedAt)}</TableCell>
                    <TableCell>
                      {e.enrichedByNome ? (
                        <Badge variant="secondary">{e.enrichedByNome}</Badge>
                      ) : (
                        "—"
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
          </>
        )}
      </Card>

      <EmpresaDetalheDialog cnpj={detalheCnpj} onClose={() => setDetalheCnpj(null)} />
    </div>
  );
}
