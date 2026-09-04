/**
 * Browser-side analytics helper.
 *
 * Fire-and-forget: a failed analytics call must never block a click through
 * to an advertiser or surface an error to the visitor. Recording a click does
 * not consume any advertising budget.
 */

type AnalyticsPayload =
  | { type: 'impression'; campaignId: string; surface?: string }
  | { type: 'outbound_click'; campaignId: string }
  | { type: 'visitor'; path: string }

export function trackEvent(payload: AnalyticsPayload): void {
  if (typeof window === 'undefined') return
  try {
    const body = JSON.stringify(payload)
    // sendBeacon survives the page unloading on an outbound navigation.
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/analytics/event', blob)
      return
    }
    void fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Analytics is best-effort and never interrupts the visitor.
  }
}
