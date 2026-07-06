import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Banknote,
  Building2,
  CalendarClock,
  FileStack,
  Sparkles,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import type { DashboardMetrics } from "@shared/types";
import { api, formatarDataHora, formatarMoedaCompacta } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function MetricCard({
  titulo,
  valor,
  icone: Icone,
  detalhe,
}: {
  titulo: string;
  valor: string;
  icone: typeof Building2;
  detalhe?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <Icone className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{valor}</div>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { usuario } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardMetrics>("/dashboard"),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const semDados = data.totalEmpresas === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral da base de devedores da Dívida Ativa da União
        </p>
      </div>

      {semDados && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FileStack className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Nenhum dado importado ainda</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Vá até a página de{" "}
              <Link to="/sincronizacao" className="font-medium text-primary hover:underline">
                Sincronização
              </Link>{" "}
              e execute a primeira importação dos dados da PGFN. Depois disso a atualização
              acontece sozinha todos os dias.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          titulo="Empresas devedoras"
          valor={data.totalEmpresas.toLocaleString("pt-BR")}
          icone={Building2}
        />
        <MetricCard
          titulo="Dívidas ativas"
          valor={data.totalDividas.toLocaleString("pt-BR")}
          icone={FileStack}
        />
        <MetricCard
          titulo="Valor total"
          valor={formatarMoedaCompacta(data.valorTotal)}
          icone={Banknote}
        />
        <MetricCard
          titulo="Novas na última sync"
          valor={data.novasEmpresasUltimaSync.toLocaleString("pt-BR")}
          icone={TrendingUp}
          detalhe="empresas que entraram na base"
        />
        <MetricCard
          titulo="Empresas enriquecidas"
          valor={data.empresasEnriquecidas.toLocaleString("pt-BR")}
          icone={Sparkles}
          detalhe="com telefone/email/sócios"
        />
        <MetricCard
          titulo="Última sincronização"
          valor={data.ultimaSincronizacao ? formatarDataHora(data.ultimaSincronizacao) : "—"}
          icone={CalendarClock}
          detalhe={
            data.proximaExecucao
              ? `próxima: ${formatarDataHora(data.proximaExecucao)}`
              : "automática desativada"
          }
        />
        {usuario?.role === "admin" && (
          <MetricCard
            titulo="Usuários pendentes"
            valor={String(data.usuariosPendentes)}
            icone={UserCheck}
            detalhe="aguardando liberação"
          />
        )}
      </div>

      {!semDados && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por natureza da dívida</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.porNatureza.map((n) => (
                <div key={n.natureza} className="flex items-center justify-between text-sm">
                  <span>{n.natureza}</span>
                  <span className="font-medium">
                    {n.qtd.toLocaleString("pt-BR")} dívidas · {formatarMoedaCompacta(n.valor)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top 10 estados (empresas)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.porUf.map((u) => {
                const max = data.porUf[0]?.qtd || 1;
                return (
                  <div key={u.uf} className="flex items-center gap-3 text-sm">
                    <span className="w-8 font-medium">{u.uf}</span>
                    <div className="h-2 flex-1 rounded bg-muted">
                      <div
                        className="h-2 rounded bg-primary"
                        style={{ width: `${(u.qtd / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-muted-foreground">
                      {u.qtd.toLocaleString("pt-BR")}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
