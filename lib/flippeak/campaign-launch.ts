/**
 * Campaign launch: create the campaign, then start checkout for it.
 *
 * Two server calls, and the second one can fail on its own (provider down,
 * network drop, user closes the tab). If a retry re-ran the first call it
 * would leave an orphan APPROVED campaign behind for every attempt, so the
 * created campaign id is surfaced on the error and reused by
 * `retryCampaignCheckout()`.
 *
 * Money is never involved here. Checkout only returns an approval URL; budget
 * is credited exclusively by the verified provider webhook.
 */

export type CampaignDraftInput = {
  name: string
  website: string
  category: string
  subtype: string
  burnRateCentsPerHour: number
  budgetDollars: number
}

export type PreflightIssue = {
  field: string
  code: string
  message: string
}

/** Thrown when the server rejects the draft on structural grounds. */
export class CampaignPreflightError extends Error {
  readonly issues: PreflightIssue[]
  constructor(issues: PreflightIssue[]) {
    super('This campaign needs changes before checkout.')
    this.name = 'CampaignPreflightError'
    this.issues = issues
  }
}

/** Carries the created campaign id so a retry does not create a second one. */
export class CheckoutStartError extends Error {
  readonly campaignId: string
  constructor(message: string, campaignId: string) {
    super(message)
    this.name = 'CheckoutStartError'
    this.campaignId = campaignId
  }
}

export type LaunchResult = {
  campaignId: string
  approvalUrl: string
}

async function readJson(response: Response): Promise<any> {
  return response.json().catch(() => null)
}

export async function startCheckoutFor(
  campaignId: string,
  budgetDollars: number,
): Promise<string> {
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaignId, amount: budgetDollars }),
  })

  const payload = await readJson(response)
  if (!response.ok || !payload?.approvalUrl) {
    throw new CheckoutStartError(
      payload?.error ?? 'Checkout could not be started.',
      campaignId,
    )
  }
  return payload.approvalUrl as string
}

export async function launchCampaign(
  draft: CampaignDraftInput,
): Promise<LaunchResult> {
  const created = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: draft.name,
      website: draft.website,
      category: draft.category,
      subtype: draft.subtype,
      burnRateCentsPerHour: draft.burnRateCentsPerHour,
    }),
  })

  const payload = await readJson(created)

  if (created.status === 422 && Array.isArray(payload?.issues)) {
    throw new CampaignPreflightError(payload.issues as PreflightIssue[])
  }

  if (!created.ok || !payload?.campaignId) {
    throw new Error(payload?.error ?? 'The campaign could not be created.')
  }

  const campaignId = payload.campaignId as string
  const approvalUrl = await startCheckoutFor(campaignId, draft.budgetDollars)

  return { campaignId, approvalUrl }
}

/** Retry checkout for an already-created campaign. Creates nothing new. */
export async function retryCampaignCheckout(
  campaignId: string,
  budgetDollars: number,
): Promise<string> {
  return startCheckoutFor(campaignId, budgetDollars)
}
