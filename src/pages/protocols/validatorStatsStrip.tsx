import MetaPill from "~/components/ui/metaPill"
import { Formatter } from "~/utils/misc/formatter"
import './validatorStatsStrip.scss'


type Stats = {
  delegators: number
  networkShare: number   // 0..1
  capacity: {
    asset: string
    ownedStake: number
    delegated: number
    available: number
  }
}

// Top of the validator statistics card. Three MetaPills for the
// headline stats (Delegators, Network Share, Capacity), then a stacked
// accent-coloured bar breaking the cap into Self / Delegated /
// Available, then a row of MetaPill legend entries. `accentColor` is
// the same value passed to <EpochProgress> on this card so the two
// progress visualisations share a colour family.
const ValidatorStatsStrip = ({ stats, accentColor = 'var(--heading-color)' }: {
  stats: Stats
  accentColor?: string
}) => {
  const { ownedStake, delegated, available, asset } = stats.capacity
  const cap = ownedStake + delegated + available
  // Guard against the new-validator edge case where everything is 0.
  const pct = (n: number) => (cap > 0 ? n / cap : 0)
  const ownedPct = pct(ownedStake)
  const delegatedPct = pct(delegated)

  // Pump the accent into a CSS custom property so the bar segments and
  // the matching legend dots share one source of truth — no per-element
  // inline style soup, no duplicated colour strings.
  const styleVars = { '--validator-bar-accent': accentColor } as React.CSSProperties

  return (
    <div className="validator-stats-strip" style={styleVars}>
      <div className="validator-stats-row">
        <MetaPill label="Capacity" value={`${Formatter.number(cap)} ${asset}`} />
        <MetaPill label="Delegators" value={Formatter.count(stats.delegators)} />
        <MetaPill label="Network Share" value={Formatter.percent(stats.networkShare)} />
      </div>
      <div className="validator-capacity-bar" aria-hidden>
        <div className="validator-capacity-segment self" style={{ width: `${ownedPct * 100}%` }} />
        <div className="validator-capacity-segment delegated" style={{ width: `${delegatedPct * 100}%` }} />
      </div>
      <div className="validator-stats-row">
        <MetaPill
          label="Self"
          value={`${Formatter.number(ownedStake)} ${asset}`}
          leading={<span className="validator-capacity-dot self" />}
        />
        <MetaPill
          label="Delegated"
          value={`${Formatter.number(delegated)} ${asset}`}
          leading={<span className="validator-capacity-dot delegated" />}
        />
        <MetaPill
          label="Free"
          value={`${Formatter.number(available)} ${asset}`}
          leading={<span className="validator-capacity-dot available" />}
        />
      </div>
    </div>
  )
}

export default ValidatorStatsStrip
