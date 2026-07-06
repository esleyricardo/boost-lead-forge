import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { PaginatedEmpresas } from "@shared/types";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Enriquecidas() {
  const [page, setPage] = useState(1);
  const [detalheCnpj, setDetalheCnpj] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["enriquecidas", page],
    queryFn: () => api.get<PaginatedEmpresas>(`/enriquecidas?page=${page}&pageSize=25`),
    placeholderData: keepPreviousData,
  });

  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  async function exportar() {
    setExportando(true);
    try {
      await downloadArquivo("/export/excel", { filtro: { enriquecidas: "sim" } });
      toast.success("Excel das empresas enriquecidas gerado.");
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
            Histórico das empresas cujos contatos já foram buscados no OpenCNPJ
            {data ? ` — ${data.total.toLocaleString("pt-BR")} no total` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={exportar} disabled={exportando || !data?.total}>
          {exportando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Exportar Excel
        </Button>
      </div>

      <Card>
        {!isLoading && data?.items.length === 0 ? (
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhuma empresa enriquecida ainda</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Na página de Devedores, selecione as empresas desejadas e clique em
              “Enriquecer selecionadas” para buscar telefone, email e sócios.
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
                      {e.telefones || <span className="text-muted-foreground">—</span>}
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
            <div className="flex items-center justify-between border-t p-3">
              <p className="text-sm text-muted-foreground">
                Página {data?.page || 1} de {totalPaginas}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPaginas}
                  onClick={() => setPage((p) => p + 1)}
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
