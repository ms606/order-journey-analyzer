/**
 * Labels and notes for the WooCommerce tracking fields, shared by the screens and the exports.
 *
 * What the fields mean:
 * - session_entry and session_start_time are the saved entry page and time. They can come from an
 *   earlier visit, because a direct return doesn't replace them.
 * - session_pages counts pages in the latest session only.
 * - session_count counts tracked visits in the same browser, so it is a minimum.
 * - Tracking can't connect different devices, different browsers, or cleared cookies.
 */
export const ENTRY_PAGE_LABEL = 'Last tracked entry page';
export const ENTRY_GROUP_LABEL = 'Last tracked entry page group';
export const ENTRY_PAGE_NOTE =
  'This is the last starting page we can trace. A direct return can keep an earlier page, so it may not be where the final visit began.';

export const PAGES_LABEL = 'Pages in latest session';
export const PAGES_NOTE = "This counts pages in the latest session only. Earlier visits aren't included.";

export const ENTRY_TIME_LABEL = 'Tracked entry time';
export const TIME_SINCE_ENTRY_LABEL = 'Time since tracked entry';

export const TRACKED_VISITS_LABEL = 'Tracked visits';
export const TWO_PLUS_VISITS_LABEL = 'Orders with 2+ tracked visits';
export const MINIMUM_LABEL = 'Minimum';
export const MINIMUM_NOTE =
  "Tracking only sees the same browser. It can't connect different devices, different browsers or cleared cookies, so the real number may be higher.";
