// Telegram Mini App link helpers.
//
// The backend already returns `tgPayUrl` on every CreateInvoiceResult
// (and `tgSubscribeUrl` on Plan responses) when `TG_BOT_USERNAME` is
// configured server-side. These helpers are for two callers the
// server response doesn't cover:
//
//  1. SDK consumers who want to build the link from a known id
//     without an extra round-trip (e.g. caching it client-side, or
//     constructing it from an id that arrived through their own
//     channels).
//  2. Self-hosted deployments where the bot lives on a different
//     username or the merchant uses different short names than the
//     API's defaults — the override options let them swap in
//     custom values per call.
//
// Returns a `t.me/<bot>/<short>?startapp=<id>` URL. Defaults match
// the spec at
// docs/superpowers/specs/2026-05-12-tg-miniapp-design.md.

const DEFAULT_BOT_USERNAME = "ButterPayBot";
const DEFAULT_PAY_SHORT_NAME = "pay";
const DEFAULT_SUBSCRIBE_SHORT_NAME = "subscribe";

export interface TgPayUrlOptions {
  /** Bot username without the leading @ (e.g. "ButterPayBot"). */
  botUsername?: string;
  /**
   * Mini App short name as registered in BotFather (e.g. "pay").
   * Defaults to "pay".
   */
  shortName?: string;
}

export interface TgSubscribeUrlOptions {
  botUsername?: string;
  /** Mini App short name for the subscribe app. Defaults to "subscribe". */
  shortName?: string;
}

function compose(
  bot: string,
  shortName: string,
  id: string,
): string {
  return `https://t.me/${bot}/${shortName}?startapp=${encodeURIComponent(id)}`;
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

  return compose(
    options?.botUsername ?? DEFAULT_BOT_USERNAME,
    options?.shortName ?? DEFAULT_PAY_SHORT_NAME,
    id,
  );
}

/**
 * Compose a Telegram Mini App subscribe link for a plan id.
 *
 * Accepts either the `pln_*` DB id or the bytes32 on-chain id — the
 * public GET /v1/plans/:id endpoint handles both.
 *
 * @example
 *   tgSubscribeUrl("pln_abc123");
 *   // → https://t.me/ButterPayBot/subscribe?startapp=pln_abc123
 *
 *   tgSubscribeUrl(plan);
 *   // ← reads plan.tgSubscribeUrl if backend supplied it
 *
 *   tgSubscribeUrl(plan, { shortName: "subscribetest" });
 *   // → override per call
 */
export function tgSubscribeUrl(
  planIdOrPlan: string | { id: string; tgSubscribeUrl?: string },
  options?: TgSubscribeUrlOptions,
): string {
  if (
    typeof planIdOrPlan === "object" &&
    typeof planIdOrPlan.tgSubscribeUrl === "string" &&
    planIdOrPlan.tgSubscribeUrl.length > 0
  ) {
    return planIdOrPlan.tgSubscribeUrl;
  }

  const id =
    typeof planIdOrPlan === "string" ? planIdOrPlan : planIdOrPlan.id;

  return compose(
    options?.botUsername ?? DEFAULT_BOT_USERNAME,
    options?.shortName ?? DEFAULT_SUBSCRIBE_SHORT_NAME,
    id,
  );
}
