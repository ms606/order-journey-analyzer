/** Exact header names expected in the WooCommerce order export. */
export const COL = {
  orderDate: 'Order Date',
  orderId: 'Order ID',
  status: 'Order Status',
  email: 'Billing Email Address',
  billingCity: 'Billing City',
  billingState: 'Billing State',
  shippingCity: 'Shipping City',
  shippingState: 'Shipping State',
  total: 'Order Total',
  refund: 'Refund Total',
  sourceType: '_wc_order_attribution_source_type',
  referrer: '_wc_order_attribution_referrer',
  utmSource: '_wc_order_attribution_utm_source',
  sessionEntry: '_wc_order_attribution_session_entry',
  sessionStart: '_wc_order_attribution_session_start_time',
  sessionPages: '_wc_order_attribution_session_pages',
  sessionCount: '_wc_order_attribution_session_count',
  userAgent: '_wc_order_attribution_user_agent',
  deviceType: '_wc_order_attribution_device_type',
  utmMedium: '_wc_order_attribution_utm_medium',
  utmContent: '_wc_order_attribution_utm_content',
} as const;

export const REQUIRED_COLUMNS: readonly string[] = [
  COL.orderDate,
  COL.orderId,
  COL.status,
  COL.email,
  COL.billingCity,
  COL.billingState,
  COL.shippingCity,
  COL.shippingState,
  COL.total,
  COL.refund,
  COL.sourceType,
  COL.referrer,
  COL.utmSource,
  COL.sessionEntry,
  COL.sessionStart,
  COL.sessionPages,
  COL.sessionCount,
  COL.userAgent,
  COL.deviceType,
  COL.utmMedium,
  COL.utmContent,
];

/** The attribution columns. Any of these may hold repeated values joined by "|". */
export const ATTRIBUTION_COLUMNS: readonly string[] = [
  COL.sourceType,
  COL.referrer,
  COL.utmSource,
  COL.sessionEntry,
  COL.sessionStart,
  COL.sessionPages,
  COL.sessionCount,
  COL.userAgent,
  COL.deviceType,
  COL.utmMedium,
  COL.utmContent,
];

/** Plain-English names for the attribution columns. */
export const ATTRIBUTION_LABELS: Readonly<Record<string, string>> = {
  [COL.sourceType]: 'Source type',
  [COL.referrer]: 'Referring site',
  [COL.utmSource]: 'Source',
  [COL.sessionEntry]: 'Entry page',
  [COL.sessionStart]: 'Visit start time',
  [COL.sessionPages]: 'Pages viewed',
  [COL.sessionCount]: 'Visit count',
  [COL.userAgent]: 'Browser details',
  [COL.deviceType]: 'Device type',
  [COL.utmMedium]: 'Campaign medium',
  [COL.utmContent]: 'Campaign content',
};

export function missingColumns(headers: readonly string[]): string[] {
  const present = new Set(headers);
  return REQUIRED_COLUMNS.filter((c) => !present.has(c));
}
