// Telegram Mini App link helper.
//
// The backend already returns `tgPayUrl` on every CreateInvoiceResult
// when TG_BOT_USERNAME is configured server-side (see
// butter-pay/backend/src/services/payment.service.ts). This helper is
// for two callers the server response doesn't cover:
//
//  1. SDK consumers who want to build the link from a known invoice id
//     without an extra round-trip (e.g. caching it client-side, or
//     constructing it from an id that arrived through their own
//     channels).
//  2. Self-hosted deployments where the bot lives on a different
//     username than the API's own TG_BOT_USERNAME — `botUsername` lets
//     them override.
//
// Returns a `t.me/<bot>/<short>?startapp=<id>` URL. Both the short
// name and an `t.me/<bot>?start=<id>` variant fall back to defaults
// matching the spec at
// docs/superpowers/specs/2026-05-12-tg-miniapp-design.md.

const DEFAULT_BOT_USERNAME = "ButterPayBot";
const DEFAULT_SHORT_NAME = "pay";

export interface TgPayUrlOptions {
  /** Bot username without the leading @ (e.g. "ButterPayBot"). */
  botUsername?: string;
  /**
   * Mini App short name as registered in BotFather (e.g. "pay").
   * Defaults to "pay".
   */
  shortName?: string;
}

/**
 * Compose a Telegram Mini App payment link for an invoice id.
 *
 * @example
 *   tgPayUrl("inv_abc123");
 *   // → https://t.me/ButterPayBot/pay?startapp=inv_abc123
 *
 *   tgPayUrl("inv_abc123", { botUsername: "MyShopBot" });
 *   // → https://t.me/MyShopBot/pay?startapp=inv_abc123
 *
 *   // Pass an Invoice — uses its existing tgPayUrl if set, otherwise
 *   // composes one. This is the "use response if available, else
 *   // synthesize" path most callers want.
 *   tgPayUrl(invoice);
 */
export function tgPayUrl(
  invoiceIdOrInvoice: string | { id: string; tgPayUrl?: string },
  options?: TgPayUrlOptions,
): string {
  // Prefer the server-supplied URL when caller passes a full Invoice
  // and the field is set — the server knows the deployment's bot.
  if (
    typeof invoiceIdOrInvoice === "object" &&
    typeof invoiceIdOrInvoice.tgPayUrl === "string" &&
    invoiceIdOrInvoice.tgPayUrl.length > 0
  ) {
    return invoiceIdOrInvoice.tgPayUrl;
  }

  const id =
    typeof invoiceIdOrInvoice === "string"
      ? invoiceIdOrInvoice
      : invoiceIdOrInvoice.id;

  const bot = options?.botUsername ?? DEFAULT_BOT_USERNAME;
  const short = options?.shortName ?? DEFAULT_SHORT_NAME;

  return `https://t.me/${bot}/${short}?startapp=${encodeURIComponent(id)}`;
}
