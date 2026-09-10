import React from "react"
import SpecsTooltip from "./tooltip"
import { HashLink } from "~/components/ui/links"
import { symbolToChain } from "~/utils/misc/translations"
import type { ISpecs, ISpecValue, ISummaryValue } from "./types"
import './specs.scss'


const InfoComponent = ({ summary, specs }) => {
  const chain = symbolToChain(summary.asset)

  return <>
    <div className="row">
      <div className="col-lg-3">
        <div className='single-project-page-left'>
          <ProjectInfoSummary {...summary} />
        </div>
      </div>
      <div className="col-lg-9">
        <div className='single-project-page-right'>
          <Specs config={specs} />
        </div>
      </div>
    </div>
  </>
}

const ProjectInfoSummary = ({ asset, apy, delegation, lockup }) => {
  return (
    <>
      <ProjectSingleInfo title='Asset' value={asset} />
      <ProjectSingleInfo title='APY' value={apy} />
      <ProjectSingleInfo title='Delegation' value={delegation} />
      <ProjectSingleInfo title='Lockup' value={lockup} />
    </>
  )
}

const Specs = ({ config }: { config: ISpecs }) => {
  return <>
    <div className="specs-container">
      {config.map((cfg, i: number) => {
        const hr = <hr className="specs-table-border mt-20"></hr>
        return (
          <React.Fragment key={i}>
            <SpecsTable config={cfg} />
            {(i + 1 < config.length) && hr}
          </React.Fragment>
        )
      })}
    </div>
  </>
}

const SpecsTable = ({ config }) => {
  return (
    <div className="specs-table-container">
      <table className="specs-table">
        <tbody>
          {config.map(({ title, value, tooltip }, i: number) => {
            return <SpecsRow key={i} title={title} value={value} tooltip={tooltip} />
          })}
        </tbody>
      </table>
    </div>
  )
}

const SpecsValue = ({ value }: { value: ISpecValue }) =>
  typeof value === 'string'
    ? <>{value}</>
    : <HashLink url={value.url} address={value.hash} />

const SpecsRow = ({ title, value, tooltip }: { title: React.ReactNode, value: ISpecValue, tooltip?: string }) => {
  const label = tooltip ? <span><SpecsTooltip text={tooltip} />{title}</span> : title
  return (
    <tr className="specs-table-row">
      <td className="specs-table-data specs-table-data-left">{label}</td>
      <td className="specs-table-data specs-table-data-right link"><SpecsValue value={value} /></td>
    </tr>
  )
}

// One bound of a range: its name, its figure, and — when the range carries a
// unit — that unit in a cell of its own.
//
// The whitespace nodes are real, not just grid gaps: a grid ignores
// whitespace-only children for layout, but textContent keeps them, so the
// accessible name stays "Min 14 days" rather than running the parts together.
const SummaryBound = (
  { name, figure, unit }: { name: string, figure: string, unit?: string },
) => (
  <span className="single-info-bound-group">
    <span className="single-info-bound">{name}</span>
    {' '}
    <span className="single-info-figure">{figure}</span>
    {unit && <>{' '}<span className="single-info-unit">{unit}</span></>}
  </span>
)

// A summary value is plain text or a pair of bounds. The bounds are named
// rather than joined with "to", because "25.0 to 93.0" left the reader to
// work out that they were a min and a max, and they stack one per line rather
// than sharing one — a single line wrapped mid-pair at the real width of this
// column, and stacking also lets the two figures align under each other.
//
// A unit is optional and belongs to the range, so both bounds state it.
// Trailing only the max ("Min 14" over "Max 92 days") read as though the unit
// were part of that one figure — on a stack the rows are separate facts, and
// each carries its own. Delegation sends no unit at all: the Asset row further
// up this same card already names the token. Lockup sends 'days', which
// nothing else on the card states.
const SummaryValue = ({ value }: { value: ISummaryValue }) => {
  if (typeof value === 'string') return <>{value}</>
  // The unit's column is opt-in: with `display: contents` on the groups, every
  // group has to contribute the same number of grid items, or the second bound
  // starts in whichever column the first one ran out in.
  const className = value.unit
    ? 'single-info-range single-info-range--united'
    : 'single-info-range'
  return (
    <span className={className}>
      <SummaryBound name="Min" figure={value.min} unit={value.unit} />
      {' '}
      <SummaryBound name="Max" figure={value.max} unit={value.unit} />
    </span>
  )
}

const ProjectSingleInfo = ({ title, value }: { title: string, value: ISummaryValue }) => {
  return (
    <div className="single-info">
      <p>{title}</p>
      <h3><SummaryValue value={value} /></h3>
    </div>
  )
}

export default InfoComponent