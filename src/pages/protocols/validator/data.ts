import { Formatter } from "~/utils/misc/formatter"
import { unixnow } from "~/utils/misc/time"
import { Chain } from "~/enums"
import { CHAIN_CONFIG, type ValidatorChain } from "~/config/chains"
import { checkRangeAvailable } from "../utils"
import type { ApiResponseDto_AvalancheDelegatorInfoDto, PChainValidatorInfoDto } from "~/backendApi"
import type { ValidatorData, IDelegation, IGraphics } from "./types"
import type { ISpecs, ISummary } from "../types"


// The two validator services (Flare / Avalanche) expose the same two calls
// under chain-specific method names, so each route adapts them into this
// shape and hands it to createValidatorDataAccess.
export interface ValidatorService {
  getDelegatorInfo(address: string, pchain: string): Promise<ApiResponseDto_AvalancheDelegatorInfoDto>
  // `.data` is optional in the generated client (empty/absent payload), so
  // getPageData defends against it below.
  getValidatorPageInfo(): Promise<{ data?: PChainValidatorInfoDto[] }>
}

// Builds the per-chain data access. The only things that vary between Flare
// and Avalanche are the backend service, the native asset symbol, and the
// P-chain/validator explorer URLs — all derived from CHAIN_CONFIG[chain] —
// so the DTO→UI mapping below is shared verbatim.
// ValidatorChain, not Chain: Songbird runs no validator and so has neither a
// P-chain nor a validator explorer. Passing it here used to typecheck and
// then hand this function two undefined URL builders, which the `!`s hid.
export function createValidatorDataAccess(chain: ValidatorChain, service: ValidatorService) {
  const asset = CHAIN_CONFIG[chain].symbol
  const pChainTransactionUrl = CHAIN_CONFIG[chain].explorers.pChainTx
  const validatorUrl = CHAIN_CONFIG[chain].explorers.validator

  function getSummary(data: PChainValidatorInfoDto): ISummary {
    const minDelegated = Formatter.number(data.minimumDelegated)
    const maxDelegated = Formatter.number(data.validatorAvailableCapacity)
    const leftover = data.validatorEndTime - unixnow()
    // A bare number, not `Formatter.days`, which appends ' days' to its own
    // output — here the unit belongs to the range as a whole rather than to
    // its upper bound, so it rides on `unit` and gets rendered once.
    const maxLockup = Formatter.number(leftover / 86400, 1)
    return {
      asset,
      apy: Formatter.percent(data.apy),
      // No `unit` on this one: the summary card renders an Asset row two rows
      // above these figures, so the token is already stated and repeating it
      // only widened the value. Lockup below is the contrasting case — the
      // card says "days" nowhere else, so that range does carry its unit.
      delegation: checkRangeAvailable(
        data.minimumDelegated,
        data.validatorAvailableCapacity,
        { min: minDelegated, max: maxDelegated },
      ),
      lockup: checkRangeAvailable(14 * 86400, leftover, { min: '14', max: maxLockup, unit: 'days' }),
      expired: leftover <= 0,
    }
  }

  function getSpecs(data: PChainValidatorInfoDto): ISpecs {
    // validator duration — the backend returns 0 (epoch) for start/end time
    // once a validator has expired, so guard against rendering a bogus 1970
    // date. The unavailability banner already surfaces the expired state.
    const validatorStartTime = data.validatorStartTime > 0 ? Formatter.dateHuman(data.validatorStartTime) : 'Unavailable'
    const validatorEndTime = data.validatorEndTime > 0 ? Formatter.dateHuman(data.validatorEndTime) : 'Unavailable'

    return [
      [
        {
          title: 'Validator Node Id',
          value: { url: validatorUrl(data.validatorNodeId), hash: data.validatorNodeId }
        },
        {
          title: 'Validator Transaction',
          value: { url: pChainTransactionUrl(data.validatorTransactionHash), hash: data.validatorTransactionHash }
        }
      ],
      [
        {
          title: 'Delegation Fee',
          value: data.validatorFee + '%',
          tooltip: 'Fee charged to delegators',
        },
        {
          title: 'Validator Owned Stake',
          value: Formatter.number(data.validatorOwnedStake) + ' ' + asset,
          tooltip: 'Amount staked by StakeCore'
        },
        {
          title: 'Validator Start Time',
          value: validatorStartTime,
          tooltip: 'Time when we staked funds to our validator'
        },
        {
          title: 'Validator End Time',
          value: validatorEndTime,
          tooltip: 'Time when the stake to the validator expires'
        }
      ]
    ]
  }

  function getGraphics(data: PChainValidatorInfoDto): IGraphics {
    return {
      stats: {
        delegators: data.totalDelegators,
        networkShare: data.validatorNetworkShare,
        capacity: {
          asset,
          ownedStake: data.validatorOwnedStake,
          delegated: data.totalDelegated,
          available: data.validatorAvailableCapacity,
        },
      },
      meterBar: {
        validatorUptime: { percent: data.validatorUptime },
        validatorConnectedPChain: { percent: data.pChainConnected },
        validatorConnectedCChain: { percent: data.cChainConnected },
        validatorConnectedXChain: { percent: data.xChainConnected },
      },
      countdown: {
        startTimeMs: data.validatorStartTime * 1000,
        endTimeMs: data.validatorEndTime * 1000
      },
      // `?? []` in case the deployed backend predates the epochApys field.
      epochApys: data.epochApys ?? [],
    }
  }

  function getDelegation(data: PChainValidatorInfoDto): IDelegation {
    return { validatorLink: { url: validatorUrl(data.validatorNodeId), hash: data.validatorNodeId } }
  }

  return {
    // Exposed for the local-delegate P-chain lookup (Flare only) and tests.
    getSummary,
    async getDelegatorInfo(address: string, pchain: string): Promise<ApiResponseDto_AvalancheDelegatorInfoDto> {
      return service.getDelegatorInfo(address, pchain)
    },
    async getPageData(): Promise<ValidatorData[]> {
      const resp = await service.getValidatorPageInfo()
      return (resp.data ?? []).map(base => ({
        base,
        summary: getSummary(base),
        specs: getSpecs(base),
        graphics: getGraphics(base),
        delegation: getDelegation(base),
      }))
    },
  }
}

export type ValidatorDataAccess = ReturnType<typeof createValidatorDataAccess>
