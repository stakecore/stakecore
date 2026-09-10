import { describe, it, expect, vi } from 'vitest'
import { Chain } from '~/enums'

// The lockup range is measured from "now", so without a fixed clock its upper
// bound moves every day and no exact assertion is possible.
const FIXED_NOW = 1_700_000_000
vi.mock('~/utils/misc/time', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/misc/time')>()),
  unixnow: () => FIXED_NOW,
}))
import { createValidatorDataAccess, type ValidatorService } from './data'
import type { PChainValidatorInfoDto } from '~/backendApi'

const infoOf = (overrides: Partial<PChainValidatorInfoDto> = {}): PChainValidatorInfoDto => ({
  validatorNodeId: 'NodeID-1',
  validatorTransactionHash: '0xabc',
  featured: true,
  apy: 0.07,
  epochApys: [],
  minimumDelegated: 25,
  validatorFee: 10,
  validatorOwnedStake: 100_000,
  validatorTotalStake: 1_500_000,
  validatorAvailableCapacity: 1_000_000,
  validatorStartTime: 1_700_000_000,
  validatorEndTime: 1_800_000_000,
  totalDelegators: 10,
  totalDelegated: 400_000,
  validatorNetworkShare: 0.01,
  validatorUptime: 99,
  pChainConnected: 95,
  cChainConnected: 95,
  xChainConnected: 95,
  ...overrides,
})

const serviceOf = (info: PChainValidatorInfoDto): ValidatorService => ({
  getDelegatorInfo: () => Promise.reject(new Error('unused')),
  getValidatorPageInfo: () => Promise.resolve({ data: [info] }),
})

describe('createValidatorDataAccess epoch APYs', () => {
  it('threads epochApys from the DTO into graphics', async () => {
    const epochApys = [{ rewardEpoch: 100, apy: 0.05 }, { rewardEpoch: 101, apy: 0.06 }]
    const access = createValidatorDataAccess(Chain.FLARE, serviceOf(infoOf({ epochApys })))
    const [validator] = await access.getPageData()
    expect(validator?.graphics.epochApys).toEqual(epochApys)
  })

  it('defaults epochApys to [] when the backend omits the field', async () => {
    const info = infoOf()
    delete (info as Partial<PChainValidatorInfoDto>).epochApys
    const access = createValidatorDataAccess(Chain.FLARE, serviceOf(info))
    const [validator] = await access.getPageData()
    expect(validator?.graphics.epochApys).toEqual([])
  })
})

// The summary's two bounded fields used to render as one opaque string
// ("25.0 to 93.0"), which left the reader to infer that the numbers were a
// min and a max. They are structured now, so info.tsx can label the bounds;
// see ISummaryValue in ../types.
describe('createValidatorDataAccess summary bounds', () => {
  const RANGE_END = FIXED_NOW + 149 * 86400

  it('reports the delegation bounds as a range with no unit of its own', async () => {
    const access = createValidatorDataAccess(Chain.FLARE, serviceOf(infoOf({
      minimumDelegated: 25,
      validatorAvailableCapacity: 93,
    })))
    const [validator] = await access.getPageData()

    // No `unit`: the summary card's own Asset row names the token two rows
    // above these figures, so repeating it here was the clutter that started
    // this. Lockup below is the contrasting case — nothing else on the card
    // says "days", so that range does carry a unit.
    expect(validator?.summary.delegation).toEqual({ min: '25.0', max: '93.0' })
  })

  it('reports the lockup bounds in days, with the unit on the range not the number', async () => {
    const access = createValidatorDataAccess(Chain.FLARE, serviceOf(infoOf({
      validatorEndTime: RANGE_END,
    })))
    const [validator] = await access.getPageData()

    // `Formatter.days` bakes " days" into its own output, so the max is a bare
    // number here and `unit` carries the word for both bounds.
    expect(validator?.summary.lockup).toEqual({ min: '14', max: '149', unit: 'days' })
  })

  it('collapses to "Unavailable" when the validator has no capacity left', async () => {
    const access = createValidatorDataAccess(Chain.FLARE, serviceOf(infoOf({
      minimumDelegated: 100,
      validatorAvailableCapacity: 10,
    })))
    const [validator] = await access.getPageData()

    expect(validator?.summary.delegation).toBe('Unavailable')
  })

  it('collapses the lockup to "Unavailable" once the term is shorter than the minimum', async () => {
    const access = createValidatorDataAccess(Chain.FLARE, serviceOf(infoOf({
      validatorEndTime: FIXED_NOW + 3 * 86400,
    })))
    const [validator] = await access.getPageData()

    expect(validator?.summary.lockup).toBe('Unavailable')
  })
})
