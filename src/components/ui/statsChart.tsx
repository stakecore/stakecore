import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts"
import './statsChart.scss'


const chartMargin = { top: 20, right: 20, bottom: 5, left: 20 }

// Theme tokens. The tooltip styles below are inline styles, where var()
// resolves fine everywhere. The curve stroke and axis tick fill are
// presentation *attributes* instead — a failed var() resolution there is a
// hard failure (stroke -> none, fill -> black: invisible lines on a black
// page), and only Chromium is installed here to check that it doesn't fail
// — so those two are left to statsChart.scss's stylesheet rules, which
// resolve var() the same in every browser. The dot colours stay as props
// (INK / INK_DIM / GROUND below): recharts portals Dots into a sibling
// zIndex layer outside the line's own <g>, so no stylesheet selector can
// reach them (see statsChart.scss's header comment for the full story).
const INK = 'var(--heading-color)'
const INK_DIM = 'var(--text-dim)'
const GROUND = 'var(--body-background)'
const TOOLTIP = { background: 'var(--surface-menu)', border: '1px solid var(--border)', borderRadius: 8 }

// Generic reward-epoch line chart shared by the FSP and validator statistics
// sections. Each `data` row is `{ x: <epoch>, [seriesName]: value }` with one
// entry in `keys` per series to draw. This module pulls in recharts (+d3),
// which is heavy — keep importers behind a lazy() boundary.
const StatsChart = ({ data, keys, formatY, height = 200 }: {
  data: Record<string, number>[],
  keys: string[],
  formatY: (v: number) => string,
  height?: number
}) => (
  <ResponsiveContainer width="100%" height={height}>
    <LineChart
      data={data}
      margin={chartMargin}
      // recharts' accessibility layer makes the SVG surface focusable
      // (tabindex=0, role="application") and arrow-key navigable — the tooltip
      // follows the keyboard, so the numbers really are reachable without a
      // pointer. It ships no name for it though, so focus landed on an
      // interactive region that announced nothing (WCAG 4.1.2). The series
      // names are the identifying part; the <h3> above each chart is not
      // programmatically associated with it.
      aria-label={`Line chart of ${keys.join(' and ')}. Interactive: use arrow keys to move through data points.`}
    >
      {/* fill left to statsChart.scss's .recharts-cartesian-axis-tick-value
          rule — a stylesheet rule beats a presentation attribute, so setting
          it here would be dead weight at best. */}
      <XAxis dataKey="x" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
      <YAxis hide domain={['auto', 'auto']} />
      <Tooltip
        contentStyle={TOOLTIP}
        labelStyle={{ color: INK_DIM }}
        itemStyle={{ color: INK }}
        formatter={(v: number) => formatY(v)}
      />
      {/* stroke is belt-and-braces here: statsChart.scss's
          .recharts-line-curve rules win wherever CSS can reach the curve, so
          this attribute is the fallback for a browser where it can't. dot's
          fill/stroke has no CSS equivalent at all — recharts portals dots
          into a sibling zIndex layer outside the line's own <g>, so they are
          not reachable by a descendant selector on .recharts-line (see
          statsChart.scss). activeDot inherits its fill from this stroke too
          (recharts' ActivePoints), so leaving it off here would recolour the
          hover/keyboard dot along with the resting ones. */}
      {keys.map((key, i) => (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          stroke={i === 0 ? INK : INK_DIM}
          strokeWidth={2}
          dot={{ fill: GROUND, stroke: i === 0 ? INK : INK_DIM, strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6 }}
          name={key}
        />
      ))}
    </LineChart>
  </ResponsiveContainer>
)

export default StatsChart
