import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts"


const chartMargin = { top: 20, right: 20, bottom: 5, left: 20 }

// Theme tokens, passed straight through: recharts writes these as SVG
// presentation attributes and inline styles, both of which resolve var().
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
      <XAxis dataKey="x" tick={{ fill: INK_DIM, fontSize: 12 }} tickLine={false} axisLine={false} />
      <YAxis hide domain={['auto', 'auto']} />
      <Tooltip
        contentStyle={TOOLTIP}
        labelStyle={{ color: INK_DIM }}
        itemStyle={{ color: INK }}
        formatter={(v: number) => formatY(v)}
      />
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
