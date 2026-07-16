/**
 * Agendamento da sincronização automática diária.
 * O horário fica em configuracoes (formato "HH:MM", fuso de São Paulo)
 * e pode ser alterado pela tela de Sincronização.
 */
import cron, { type ScheduledTask } from "node-cron";
import { getConfig, setConfig } from "../db";
import { executarSincronizacao, isSincronizando } from "./pgfn-sync";

const TIMEZONE = "America/Sao_Paulo";
let task: ScheduledTask | null = null;

function horarioParaCron(horario: string): string | null {
  const m = horario.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hora = parseInt(m[1], 10);
  const minuto = parseInt(m[2], 10);
  if (hora > 23 || minuto > 59) return null;
  return `${minuto} ${hora} * * *`;
}

async function executarAutomatica(): Promise<void> {
  if (isSincronizando()) {
    console.log("[Cron] Sincronização já em andamento; pulando execução agendada.");
    return;
  }
  try {
    console.log("[Cron] Iniciando sincronização automática diária...");
    await executarSincronizacao("automatica");
    console.log("[Cron] Sincronização automática concluída.");
  } catch (err) {
    console.error("[Cron] Erro na sincronização automática:", err instanceof Error ? err.message : err);
  }
  // Fontes estaduais: verificação leve; só baixa quem publicou arquivo novo
  try {
    const { verificarFontesEstaduais } = await import("./estaduais");
    await verificarFontesEstaduais();
  } catch (err) {
    console.error("[Cron] Erro na verificação estadual:", err instanceof Error ? err.message : err);
  }
}

export function reagendarCron(): void {
  if (task) {
    task.stop();
    task = null;
  }
  const ativo = getConfig("cron_ativo") === "true";
  const horario = getConfig("cron_horario") || "06:00";
  if (!ativo) {
    console.log("[Cron] Sincronização automática desativada.");
    return;
  }
  const expr = horarioParaCron(horario);
  if (!expr) {
    console.error(`[Cron] Horário inválido nas configurações: ${horario}`);
    return;
  }
  task = cron.schedule(expr, executarAutomatica, { timezone: TIMEZONE });
  console.log(`[Cron] Sincronização automática agendada todos os dias às ${horario} (${TIMEZONE}).`);
}

export function atualizarConfigCron(ativo: boolean, horario: string): void {
  if (!horarioParaCron(horario)) {
    throw new Error("Horário inválido. Use o formato HH:MM, por exemplo 06:00.");
  }
  setConfig("cron_ativo", String(ativo));
  setConfig("cron_horario", horario);
  reagendarCron();
}

/** Próxima execução prevista (ISO), ou null se o cron estiver desativado. */
export function proximaExecucao(): string | null {
  if (getConfig("cron_ativo") !== "true") return null;
  const horario = getConfig("cron_horario") || "06:00";
  const m = horario.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  // Calcula o próximo horário HH:MM no fuso de São Paulo
  const agora = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(agora).map((p) => [p.type, p.value]));
  const horaAlvo = parseInt(m[1], 10);
  const minAlvo = parseInt(m[2], 10);
  const jaPassou =
    parseInt(parts.hour, 10) > horaAlvo ||
    (parseInt(parts.hour, 10) === horaAlvo && parseInt(parts.minute, 10) >= minAlvo);

  const data = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00`);
  if (jaPassou) data.setDate(data.getDate() + 1);
  const yyyy = data.getFullYear();
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const dd = String(data.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${String(horaAlvo).padStart(2, "0")}:${String(minAlvo).padStart(2, "0")}:00`;
}
