import { Chain, Protocol } from './enums'
import { CHAIN_CONFIG } from './config/chains'

export const MAX_BIPS = 10_000
export const NUMBER_DISPLAY_LENGTH = 3

export const PROTOCOL_NAME: Record<number, string> = {
  [Protocol.FSP]: 'FSP',
  [Protocol.VALIDATOR]: 'Validator',
}

// server query
export const REFRESH_QUERY_FAST_MS = 10_000
export const REFRESH_QUERY_SLOW_MS = 30_000

// flare fsp contracts
export const wrappedFlrAdr = '0x1D80c49BbBCd1C0911346656B529DF9E5c2F783d'
export const wrappedFlrAbi = [
  'function delegate(address,uint256)',
  'function deposit() payable',
  'function withdraw(uint256)'
]

export const flareFspRewardManagerAdr = '0xC8f55c5aA2C752eE285Bd872855C749f4ee6239B'
export const flareFspRewardManagerAbi = [
  'function claim(address,address,uint24,bool,(bytes32[],(uint24,bytes20,uint120,uint8))[])'
]

export const flareDelegationAdr = '0x1e68DC808A240C096F0261144dc41fd4c883Cfb0'

// songbird fsp contracts
export const wrappedSgbAdr = '0x02f0826ef6aD107Cfc861152B32B52fD11BaB9ED'
export const wrappedSgbAbi = wrappedFlrAbi

export const songbirdFspRewardManagerAdr = '0xE26AD68b17224951b5740F33926Cc438764eB9a7'
export const songbirdFspRewardManagerAbi = flareFspRewardManagerAbi

export const songbirdDelegationAdr = '0x1e68DC808A240C096F0261144dc41fd4c883Cfb0'

// flare validator contract
export const flareValidatorAdr = '0x868822C4A79ee2a18bedfdd5f1EF3b23B190cf1e'

// avalanche validator lockup bounds (seconds)
export const avalancheDelegatorMinLockup = 1209600
export const avalancheDelegatorMaxLockup = 31536000

// style
// Spinner ink. Every consumer is a spinners-react <SpinnerCircular color>,
// which lands on the <svg> as a presentation attribute and resolves var().
export const PAGE_COLOR_CODE = 'var(--heading-color)'


// ---- Per-chain identity re-exports ----
//
// The canonical definitions live in src/config/chains.ts (CHAIN_CONFIG).
// These named aliases are kept so existing call sites can keep importing
// e.g. `FLR_SYMBOL` / `flareWalletConfig` from "~/constants" unchanged.

const flare = CHAIN_CONFIG[Chain.FLARE]
const songbird = CHAIN_CONFIG[Chain.SONGBIRD]
const avalanche = CHAIN_CONFIG[Chain.AVALANCHE]

export const CHAIN_NAME: Record<number, string> = {
  [Chain.FLARE]: flare.name,
  [Chain.SONGBIRD]: songbird.name,
  [Chain.AVALANCHE]: avalanche.name,
}

export const CHAIN_SYMBOL: Record<number, string> = {
  [Chain.FLARE]: flare.symbol,
  [Chain.SONGBIRD]: songbird.symbol,
  [Chain.AVALANCHE]: avalanche.symbol,
}

// tokens
export const FLR_DECIMALS = flare.decimals
export const FLR_SYMBOL = flare.symbol
export const WFLR_SYMBOL = flare.wrappedSymbol
export const SGB_DECIMALS = songbird.decimals
export const SGB_SYMBOL = songbird.symbol
export const WSGB_SYMBOL = songbird.wrappedSymbol
export const AVAX_DECIMALS = avalanche.decimals
export const AVAX_SYMBOL = avalanche.symbol

// chain ids + wallet-add configs
export const flareChainId = flare.chainIdHex
export const flareWalletConfig = flare.walletConfig
export const songbirdChainId = songbird.chainIdHex
export const songbirdWalletConfig = songbird.walletConfig
export const avalancheChainId = avalanche.chainIdHex
export const avalancheWalletConfig = avalanche.walletConfig

// epoch configs
export const flareEpochConfig = flare.epoch
export const songbirdEpochConfig = songbird.epoch

// explorer URL builders
export const flareEvmAddressUrl = flare.explorers.evmAddress
export const flareEvmTransactionUrl = flare.explorers.evmTx
export const flareFspAddressUrl = flare.explorers.fspAddress
export const flareValidatorUrl = flare.explorers.validator
export const flarePChainAddressUrl = flare.explorers.pChainAddress
export const flarePChainTransactionUrl = flare.explorers.pChainTx
export const songbirdEvmAddressUrl = songbird.explorers.evmAddress
export const songbirdEvmTransactionUrl = songbird.explorers.evmTx
export const songbirdFspAddressUrl = songbird.explorers.fspAddress
export const avalancheValidatorUrl = avalanche.explorers.validator
export const avalanchePChainTransactionUrl = avalanche.explorers.pChainTx
export const avalanchePChainAddressUrl = avalanche.explorers.pChainAddress

// brand colours
export const FLARE_COLOR_CODE = flare.color
export const SONGBIRD_COLOR_CODE = songbird.color
export const AVALANCHE_COLOR_CODE = avalanche.color

// videos
export const FLARE_FSP_VIDEO_ID = flare.video.fsp
export const SONGBIRD_FSP_VIDEO_ID = songbird.video.fsp
export const FLARE_VALIDATOR_VIDEO_ID = flare.video.validator
export const AVALANCHE_VALIDATOR_VIDEO_ID = avalanche.video.validator

// bech32 human-readable parts
export const HRP = {
  avalanche: avalanche.hrp,
  songbird: songbird.hrp,
  flare: flare.hrp,
}
