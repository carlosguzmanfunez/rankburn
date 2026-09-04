export type ScreeningDecision = 'ALLOW' | 'BLOCK' | 'HOLD'

export type CampaignScreeningInput = {
  campaignId?: string
  name: string
  website: string
  tagline?: string
  description?: string
  category: string
  subtype: string
}

export type CampaignScreeningResult = {
  decision: ScreeningDecision
  reasons: string[]
  provider: 'STRUCTURAL_ONLY' | 'AUTOMATED_POLICY_PROVIDER'
}

/**
 * This is intentionally conservative infrastructure.
 *
 * Structural preflight and automated content-policy screening are separate:
 * structural validation checks required fields/taxonomy/rate/URL;
 * content-policy screening evaluates advertiser text/media before real-money
 * production launch.
 *
 * Until a real automated policy provider is integrated, production must not
 * pretend `STRUCTURAL_ONLY` is sufficient content moderation.
 */
export async function screenCampaignContent(
  input: CampaignScreeningInput,
): Promise<CampaignScreeningResult> {
  const normalized = [
    input.name,
    input.tagline ?? '',
    input.description ?? '',
  ]
    .join(' ')
    .trim()

  if (!normalized) {
    return {
      decision: 'BLOCK',
      reasons: ['campaign-content-empty'],
      provider: 'STRUCTURAL_ONLY',
    }
  }

  return {
    decision: 'HOLD',
    reasons: ['automated-policy-provider-not-configured'],
    provider: 'STRUCTURAL_ONLY',
  }
}
