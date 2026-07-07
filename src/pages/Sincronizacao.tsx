import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type { Sincronizacao as Sync, SyncConfig } from "@shared/types";
import { api, formatarDataHora } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StatusBadge({ s }: { s: Sync }) {
  if (s.status === "running")
    return (
      <Badge className="bg-blue-600 hover:bg-blue-600">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Em andamento
      </Badge>
    );
  if (s.status === "completed")
    return (
      <Badge className="bg-green-600 hover:bg-green-600">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Concluída
      </Badge>
    );
  return (
    <Badge variant="destructive">
      <AlertCircle className="mr-1 h-3 w-3" /> Erro
    </Badge>
  );
}

export default function Sincronizacao() {
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const [horarioEdicao, setHorarioEdicao] = useState<string | null>(null);

  const { data: config } = useQuery({
    queryKey: ["sync-config"],
    queryFn: () => api.get<SyncConfig>("/sync/config"),
    refetchInterval: 10_000,
  });

  const { data: historico } = useQuery({
    queryKey: ["sync-historico"],
    queryFn: () =>
      api.get<{ sincronizacoes: Sync[] }>("/sync/historico").then((r) => r.sincronizacoes),
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === "running") ? 3000 : 15_000),
  });

  const emAndamento = config?.executando || historico?.some((s) => s.status === "running");

  const executar = useMutation({
    mutationFn: (forcar: boolean) => api.post("/sync/executar", { forcar }),
    onSuccess: () => {
      toast.success("Sincronização iniciada. Acompanhe o progresso abaixo.");
      queryClient.invalidateQueries({ queryKey: ["sync-historico"] });
      queryClient.invalidateQueries({ queryKey: ["sync-config"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Falha ao iniciar sincronização."),
  });

  const salvarConfig = useMutation({
    mutationFn: (payload: { cronAtivo: boolean; cronHorario: string }) =>
      api.put("/sync/config", payload),
    onSuccess: () => {
      toast.success("Configuração salva.");
      setHorarioEdicao(null);
      queryClient.invalidateQueries({ queryKey: ["sync-config"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao salvar."),
  });

  const isAdmin = usuario?.role === "admin";
  const syncAtual = historico?.find((s) => s.status === "running");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sincronização</h1>
        <p className="text-sm text-muted-foreground">
          Importação automática diária dos Dados Abertos da PGFN
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> Atualização automática diária
            </CardTitle>
            <CardDescription>
              O sistema baixa a base da PGFN todos os dias no horário definido e marca as
              empresas e dívidas que entraram na base, guardando a data oficial de inscrição e a
              data de detecção.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="cron-ativo">Sincronizar automaticamente</Label>
              <Switch
                id="cron-ativo"
                checked={config?.cronAtivo ?? false}
                disabled={!isAdmin || salvarConfig.isPending}
                onCheckedChange={(v) =>
                  salvarConfig.mutate({
                    cronAtivo: v,
                    cronHorario: config?.cronHorario || "06:00",
                  })
                }
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="horario">Horário (Brasília)</Label>
                <Input
                  id="horario"
                  type="time"
                  disabled={!isAdmin}
                  value={horarioEdicao ?? config?.cronHorario ?? "06:00"}
                  onChange={(e) => setHorarioEdicao(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                disabled={!isAdmin || horarioEdicao == null || salvarConfig.isPending}
                onClick={() =>
                  salvarConfig.mutate({
                    cronAtivo: config?.cronAtivo ?? true,
                    cronHorario: horarioEdicao!,
                  })
                }
              >
                Salvar horário
              </Button>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm">
              <p>
                Última sincronização:{" "}
                <strong>{formatarDataHora(config?.ultimaSincronizacao) || "nunca"}</strong>
              </p>
              <p>
                Próxima execução automática:{" "}
                <strong>
                  {config?.proximaExecucao ? formatarDataHora(config.proximaExecucao) : "desativada"}
                </strong>
              </p>
            </div>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                Apenas administradores alteram o agendamento.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4" /> Sincronizar agora
            </CardTitle>
            <CardDescription>
              O sistema primeiro confere se a PGFN publicou algo novo. Só baixa a base (que é
              grande) quando há um trimestre novo — se nada mudou, encerra em segundos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => executar.mutate(false)}
              disabled={emAndamento || executar.isPending}
              className="w-full"
            >
              {emAndamento ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sincronização em andamento...
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" /> Verificar e sincronizar
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => executar.mutate(true)}
              disabled={emAndamento || executar.isPending}
              title="Baixa e reprocessa a base inteira mesmo que nada tenha mudado (demora horas)"
            >
              Forçar reprocessamento completo
            </Button>
            {syncAtual?.progresso && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                <p className="font-medium">Progresso:</p>
                <p className="text-muted-foreground">{syncAtual.progresso}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de sincronizações</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Disparo</TableHead>
              <TableHead>Trimestre</TableHead>
              <TableHead className="text-right">Empresas</TableHead>
              <TableHead className="text-right">Dívidas</TableHead>
              <TableHead className="text-right">Novas empresas</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historico?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Nenhuma sincronização executada ainda.
                </TableCell>
              </TableRow>
            )}
            {historico?.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <StatusBadge s={s} />
                  {s.status === "error" && s.errorMessage && (
                    <p className="mt-1 max-w-64 text-xs text-destructive">{s.errorMessage}</p>
                  )}
                </TableCell>
                <TableCell className="text-sm capitalize">{s.disparo}</TableCell>
                <TableCell className="text-sm">{s.trimestreReferencia || "—"}</TableCell>
                <TableCell className="text-right text-sm">
                  {s.totalEmpresas.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {s.totalDividas.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {s.novasEmpresas.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell className="text-sm">{formatarDataHora(s.iniciadaEm)}</TableCell>
                <TableCell className="text-sm">{formatarDataHora(s.concluidaEm)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
