import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock unixnow so the lockup math is deterministic. Pretend "now" is a
// round timestamp so the leftover-seconds calculation is easy to reason
// about across test cases.
const NOW = 1_700_000_000 // unix seconds, arbitrary fixed point
vi.mock('~/utils/misc/time', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/misc/time')>()
  return { ...actual, unixnow: () => NOW }
})

import { FlareValidatorDataAccess } from './data'
import type { PChainValidatorInfoDto } from '~/backendApi'

const infoOf = (overrides: Partial<PChainValidatorInfoDto> = {}): PChainValidatorInfoDto => ({
  apy: 0.07,
  minimumDelegated: 25,
  validatorAvailableCapacity: 1_000_000,
  validatorEndTime: NOW + 90 * 86_400, // 90 days of lockup available
  ...overrides,
} as PChainValidatorInfoDto)

beforeEach(() => {
  vi.clearAllMocks()
})

// --- getSummary --------------------------------------------------------

describe('FlareValidatorDataAccess.getSummary', () => {
  it("uses 'FLR' as the asset symbol", () => {
    expect(FlareValidatorDataAccess.getSummary(infoOf()).asset).toBe('FLR')
  })

  it('formats the APY through Formatter.percent', () => {
    expect(FlareValidatorDataAccess.getSummary(infoOf({ apy: 0.075 })).apy).toBe('7.50%')
  })

  it('renders the delegation range when min <= capacity', () => {
    const out = FlareValidatorDataAccess.getSummary(infoOf({
      minimumDelegated: 25,
      validatorAvailableCapacity: 1_000_000,
    }))
    // Unitless: the summary card's Asset row states the token, which the
    // test above pins as 'FLR'.
    expect(out.delegation).toEqual({ min: '25.0', max: '1.00M' })
  })

  it('reports delegation as "Unavailable" when the capacity is exhausted (min > available)', () => {
    const out = FlareValidatorDataAccess.getSummary(infoOf({
      minimumDelegated: 1_000_000,
      validatorAvailableCapacity: 100,
    }))
    expect(out.delegation).toBe('Unavailable')
  })

  it('renders the lockup range when leftover >= 14 days', () => {
    // 90 days of lockup available — leftover is well above the 14d floor.
    const out = FlareValidatorDataAccess.getSummary(infoOf({
      validatorEndTime: NOW + 90 * 86_400,
    }))
    expect(out.lockup).toEqual({ min: '14', max: '90', unit: 'days' })
  })

  it('reports lockup as "Unavailable" when leftover is below 14 days', () => {
    const out = FlareValidatorDataAccess.getSummary(infoOf({
      validatorEndTime: NOW + 7 * 86_400, // only a week left
    }))
    expect(out.lockup).toBe('Unavailable')
  })

  it('flags expired=true when the validator end time has passed', () => {
    const out = FlareValidatorDataAccess.getSummary(infoOf({
      validatorEndTime: NOW - 1, // ended one second ago
    }))
    expect(out.expired).toBe(true)
  })

  it('flags expired=false while the validator is still active', () => {
    const out = FlareValidatorDataAccess.getSummary(infoOf({
      validatorEndTime: NOW + 90 * 86_400,
    }))
    expect(out.expired).toBe(false)
  })
})
