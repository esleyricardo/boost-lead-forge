/**
 * Formatadores compartilhados entre servidor e frontend.
 */

/**
 * Garante o código de país (+55) em cada telefone de uma string do tipo
 * "(11) 33334444, (11) 98888-7777". Idempotente: números que já começam com
 * 55/+55 não são alterados. Usado na exibição e em todas as exportações.
 */
export function telefonesComDDI(telefones: string | null | undefined): string {
  if (!telefones) return "";
  return telefones
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (/^\+?55\b/.test(t) ? t : `+55 ${t}`))
    .join(", ");
}
