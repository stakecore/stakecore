import { describe, it, expect, vi, beforeEach } from 'vitest'

const NOW = 1_700_000_000
vi.mock('~/utils/misc/time', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/misc/time')>()
  return { ...actual, unixnow: () => NOW }
})

import { AvalancheValidatorDataAccess } from './data'
import type { PChainValidatorInfoDto } from '~/backendApi'

const infoOf = (overrides: Partial<PChainValidatorInfoDto> = {}): PChainValidatorInfoDto => ({
  apy: 0.06,
  minimumDelegated: 25,
  validatorAvailableCapacity: 1_000_000,
  validatorEndTime: NOW + 90 * 86_400,
  ...overrides,
} as PChainValidatorInfoDto)

beforeEach(() => {
  vi.clearAllMocks()
})

// The Avalanche getSummary shares its body with FlareValidator — the only
// difference that's user-visible is the asset symbol. Cover that here +
// one delegation / lockup happy-path so a future divergence between the
// two implementations is caught.

describe('AvalancheValidatorDataAccess.getSummary', () => {
  it("uses 'AVAX' as the asset symbol (the per-network distinction)", () => {
    expect(AvalancheValidatorDataAccess.getSummary(infoOf()).asset).toBe('AVAX')
  })

  it('still renders the delegation range when capacity is healthy', () => {
    const out = AvalancheValidatorDataAccess.getSummary(infoOf({
      minimumDelegated: 25,
      validatorAvailableCapacity: 1_000_000,
    }))
    // Unitless: the card's Asset row carries the token, so the per-network
    // distinction is pinned by the 'AVAX' assertion above rather than here.
    expect(out.delegation).toEqual({ min: '25.0', max: '1.00M' })
  })

  it('still reports "Unavailable" lockup when leftover < 14 days', () => {
    const out = AvalancheValidatorDataAccess.getSummary(infoOf({
      validatorEndTime: NOW + 3 * 86_400,
    }))
    expect(out.lockup).toBe('Unavailable')
  })
})
