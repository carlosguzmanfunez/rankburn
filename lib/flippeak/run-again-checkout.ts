export type RunAgainResult = {
  campaignId: string
  previousCampaignId: string
  approvalUrl: string
}

/**
 * Creates a NEW approved commercial run from an exhausted campaign, then
 * starts checkout for the new run. The exhausted record is never revived.
 */
export async function runAgainAndCheckout(
  exhaustedCampaignId: string,
  budgetDollars: number,
): Promise<RunAgainResult> {
  const runResponse = await fetch(
    `/api/campaigns/${exhaustedCampaignId}/run-again`,
    { method: 'POST' },
  )

  const run = await runResponse.json().catch(() => null)

  if (!runResponse.ok || !run?.campaignId) {
    throw new Error(run?.error ?? 'Could not create the new campaign run.')
  }

  const checkoutResponse = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId: run.campaignId,
      amount: budgetDollars,
    }),
  })

  const checkout = await checkoutResponse.json().catch(() => null)

  if (!checkoutResponse.ok || !checkout?.approvalUrl) {
    const error = new Error(
      checkout?.error ??
        'The new run was created, but checkout could not be started.',
    )
    ;(error as Error & { campaignId?: string }).campaignId = run.campaignId
    throw error
  }

  return {
    campaignId: run.campaignId,
    previousCampaignId: run.previousCampaignId,
    approvalUrl: checkout.approvalUrl,
  }
}

/**
 * Retry checkout without creating another run. This prevents duplicate
 * APPROVED zero-budget campaigns after a checkout/network failure.
 */
export async function retryRunAgainCheckout(
  campaignId: string,
  budgetDollars: number,
): Promise<string> {
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId,
      amount: budgetDollars,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.approvalUrl) {
    throw new Error(payload?.error ?? 'Checkout retry failed.')
  }

  return payload.approvalUrl
}
