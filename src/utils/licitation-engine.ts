
/**
 * LICITATION ENGINE - SINGLE SOURCE OF TRUTH
 * Centralized business logic for calculations and status management.
 */

export const LICITATION_STATUS = {
  IMPORTED: 'imported',
  PRE_QUOTED: 'pre_quoted',
  QUOTED: 'quoted',
  APPROVED: 'approved',
  DISPUTE: 'dispute',
  WON: 'won',
  LOST: 'lost',
  HOMOLOGATED: 'homologated',
  INVOICED: 'invoiced',
  DELIVERED: 'delivered',
  RECEIVED: 'received',
  CLOSED: 'closed',
} as const;

export type LicitationStatus = typeof LICITATION_STATUS[keyof typeof LICITATION_STATUS];

export interface ItemMetrics {
  estimatedValue: number;
  quotedValue: number;
  disputeValue: number;
  homologatedValue: number;
  invoicedValue: number;
  receivedValue: number;
  quantidade: number;
  profitValue: number;
  profitMarginPct: number;
}

/**
 * Calculates item metrics based on current inputs.
 * This should match the logic in the DB trigger (trg_calculate_item_metrics).
 */
export const calculateItemMetrics = (item: Partial<ItemMetrics>): ItemMetrics => {
  const q = item.quantidade || 0;
  const ev = item.estimatedValue || 0;
  const qv = item.quotedValue || 0;
  const dv = item.disputeValue || 0;
  const hv = item.homologatedValue || 0;
  const iv = item.invoicedValue || 0;
  const rv = item.receivedValue || 0;

  let profitValue = 0;
  let profitMarginPct = 0;

  // Real-time calculation for dispute
  if (dv > 0) {
    profitValue = (dv - qv) * q;
    profitMarginPct = dv > 0 ? ((dv - qv) / dv) * 100 : 0;
  }

  // If homologated, use homologated value for profit calculation
  if (hv > 0) {
    profitValue = (hv - qv) * q;
    profitMarginPct = hv > 0 ? ((hv - qv) / hv) * 100 : 0;
  }

  return {
    estimatedValue: ev,
    quotedValue: qv,
    disputeValue: dv,
    homologatedValue: hv,
    invoicedValue: iv,
    receivedValue: rv,
    quantidade: q,
    profitValue,
    profitMarginPct,
  };
};

/**
 * Standardizes the display value based on current operational phase.
 * Priority: Received > Invoiced > Homologated > Dispute > Quoted > Estimated
 */
export const getEffectiveValue = (item: ItemMetrics): number => {
  if (item.receivedValue > 0) return item.receivedValue;
  if (item.invoicedValue > 0) return item.invoicedValue;
  if (item.homologatedValue > 0) return item.homologatedValue;
  if (item.disputeValue > 0) return item.disputeValue;
  if (item.quotedValue > 0) return item.quotedValue;
  return item.estimatedValue;
};
