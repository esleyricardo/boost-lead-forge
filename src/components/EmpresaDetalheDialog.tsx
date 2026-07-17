import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { Divida, Empresa, Socio } from "@shared/types";
import { api, formatarCnpj, formatarData, formatarDataHora, formatarMoeda } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

function parseSocios(json: string | null): Socio[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Socio[];
  } catch {
    return [];
  }
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-muted-foreground">{rotulo}</p>
      <p className="text-sm">{valor || "—"}</p>
    </div>
  );
}

export default function EmpresaDetalheDialog({
  cnpj,
  onClose,
}: {
  cnpj: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["empresa", cnpj],
    queryFn: () => api.get<{ empresa: Empresa; dividas: Divida[] }>(`/empresas/${cnpj}`),
    enabled: !!cnpj,
  });

  const empresa = data?.empresa;
  const socios = parseSocios(empresa?.socios ?? null);

  return (
    <Dialog open={!!cnpj} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        {isLoading || !empresa ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">{empresa.razaoSocial}</DialogTitle>
              <DialogDescription>
                CNPJ {formatarCnpj(empresa.cnpj)}
                {empresa.isNova && (
                  <Badge className="ml-2 bg-amber-500 hover:bg-amber-500">Nova na base</Badge>
                )}
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[65vh] pr-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Campo rotulo="UF" valor={empresa.uf || ""} />
                <Campo rotulo="Município" valor={empresa.municipio || ""} />
                <Campo rotulo="Qtd. dívidas ativas" valor={String(empresa.qtdDividas)} />
                <Campo rotulo="Valor total" valor={formatarMoeda(empresa.valorTotal)} />
                <Campo
                  rotulo="Inscrição mais antiga"
                  valor={formatarData(empresa.dataInscricaoMaisAntiga)}
                />
                <Campo
                  rotulo="Inscrição mais recente"
                  valor={formatarData(empresa.dataInscricaoMaisRecente)}
                />
                <Campo
                  rotulo="Detectada pelo sistema em"
                  valor={formatarDataHora(empresa.dataPrimeiraDeteccao)}
                />
                <Campo rotulo="Naturezas" valor={empresa.naturezas} />
              </div>

              <Separator className="my-4" />

              <div className="mb-4">
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Contatos (OpenCNPJ)</h3>
                  {empresa.enrichedAt ? (
                    <Badge variant="secondary">
                      enriquecida em {formatarDataHora(empresa.enrichedAt)}
                      {empresa.enrichedByNome ? ` por ${empresa.enrichedByNome}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline">ainda não enriquecida</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <Campo rotulo="Telefones" valor={empresa.telefones || ""} />
                  <Campo rotulo="Email" valor={empresa.email || ""} />
                  <Campo rotulo="Situação cadastral" valor={empresa.situacaoCadastral || ""} />
                  <Campo rotulo="CNAE principal" valor={empresa.cnaeDescricao || ""} />
                  <Campo rotulo="Abertura" valor={formatarData(empresa.dataAberturaEmpresa)} />
                </div>
                {socios.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Sócios</p>
                    <ul className="mt-1 space-y-1">
                      {socios.map((s, i) => (
                        <li key={i} className="text-sm">
                          {s.nome}{" "}
                          <span className="text-muted-foreground">
                            — {s.qualificacao}
                            {s.faixaEtaria ? ` · ${s.faixaEtaria}` : ""}
                            {s.documento ? ` · CPF ${s.documento}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              <h3 className="mb-2 text-sm font-semibold">
                Dívidas ativas ({data!.dividas.length})
              </h3>
              <div className="space-y-2">
                {data!.dividas.map((d) => (
                  <div key={d.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs">{d.numeroInscricao}</span>
                      <span className="font-semibold">{formatarMoeda(d.valorConsolidado)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Inscrita em: <strong>{formatarData(d.dataInscricao)}</strong>
                      </span>
                      <span>{d.naturezaDivida}</span>
                      {d.receitaPrincipal && <span>{d.receitaPrincipal}</span>}
                      {d.situacaoInscricao && <span>{d.situacaoInscricao}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
