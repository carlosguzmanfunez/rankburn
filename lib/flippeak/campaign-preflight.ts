import {
  isFlipPeakCategory,
  isSubtypeForCategory,
  type FlipPeakCategoryId,
} from './taxonomy'

export type CampaignPreflightInput = {
  name: string
  website: string
  category: string
  subtype: string
  burnRateCentsPerHour: number
}

export type CampaignPreflightResult =
  | {
      ok: true
      normalized: {
        name: string
        website: string
        category: FlipPeakCategoryId
        subtype: string
        burnRateCentsPerHour: number
      }
    }
  | {
      ok: false
      issues: Array<{
        field: 'name' | 'website' | 'category' | 'subtype' | 'burnRate'
        code: string
        message: string
      }>
    }

const MIN_BURN_RATE_CENTS_PER_HOUR = 100
const MAX_BURN_RATE_CENTS_PER_HOUR = 100_000
const MAX_NAME_LENGTH = 80

export function validateCampaignPreflight(
  input: CampaignPreflightInput,
): CampaignPreflightResult {
  const issues: Extract<CampaignPreflightResult, { ok: false }>['issues'] = []

  const name = input.name.trim()
  if (!name) {
    issues.push({
      field: 'name',
      code: 'REQUIRED',
      message: 'Campaign name is required.',
    })
  } else if (name.length > MAX_NAME_LENGTH) {
    issues.push({
      field: 'name',
      code: 'TOO_LONG',
      message: `Campaign name must be ${MAX_NAME_LENGTH} characters or fewer.`,
    })
  }

  let website = input.website.trim()
  try {
    // A bare hostname is what people actually type. Rejecting it outright
    // meant the default placeholder ("example.com") could never pass, so the
    // scheme is added before parsing and the result is still validated.
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(website)
      ? website
      : `https://${website}`
    const parsed = new URL(candidate)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    if (!parsed.hostname.includes('.')) throw new Error()
    website = parsed.toString()
  } catch {
    issues.push({
      field: 'website',
      code: 'INVALID_URL',
      message: 'Enter a valid website address, for example example.com.',
    })
  }

  if (!isFlipPeakCategory(input.category)) {
    issues.push({
      field: 'category',
      code: 'INVALID_CATEGORY',
      message: 'Select a valid FlipPeak category.',
    })
  }

  if (
    isFlipPeakCategory(input.category) &&
    !isSubtypeForCategory(input.category, input.subtype)
  ) {
    issues.push({
      field: 'subtype',
      code: 'INVALID_SUBTYPE',
      message: 'Select a subtype that belongs to this category.',
    })
  }

  if (
    !Number.isInteger(input.burnRateCentsPerHour) ||
    input.burnRateCentsPerHour < MIN_BURN_RATE_CENTS_PER_HOUR ||
    input.burnRateCentsPerHour > MAX_BURN_RATE_CENTS_PER_HOUR
  ) {
    issues.push({
      field: 'burnRate',
      code: 'INVALID_BURN_RATE',
      message: 'Burn Rate must be between $1/hour and $1,000/hour.',
    })
  }

  if (issues.length) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    normalized: {
      name,
      website,
      category: input.category as FlipPeakCategoryId,
      subtype: input.subtype,
      burnRateCentsPerHour: input.burnRateCentsPerHour,
    },
  }
}
