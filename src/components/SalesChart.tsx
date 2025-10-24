import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface SalesChartProps {
  data: any[];
  xKey: string;
  yKey: string;
  color?: string;
  chartType?: 'line' | 'bar';
}

export default function SalesChart({ data, xKey, yKey, color = '#4ade80', chartType = 'line' }: SalesChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      {chartType === 'bar' ? (
        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <Tooltip />
          <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      ) : (
        <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xKey} />
          <YAxis />
          <Tooltip />
          {/* Use linear type and a custom dot to make all points clearly visible; disable animation for stability */}
          <Line
            type="linear"
            dataKey={yKey}
            stroke={color}
            strokeWidth={2}
            isAnimationActive={false}
            connectNulls={true}
            dot={(props) => {
              // props.index is provided by Recharts when mapping dots; use it as a stable key.
              const key = (props as any).index ?? `${props.cx}-${props.cy}`;
              // Guard: if coordinates are null/undefined, don't render the circle
              if (props.cx == null || props.cy == null) return null;
              return (
                <circle
                  key={key}
                  cx={props.cx}
                  cy={props.cy}
                  r={3}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={1}
                  style={{ pointerEvents: 'none' }}
                />
              );
            }}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
