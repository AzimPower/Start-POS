import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Defs, LinearGradient, Stop, Area, AreaChart } from 'recharts';

interface SalesChartProps {
  data: any[];
  xKey: string;
  yKey: string;
  color?: string;
  chartType?: 'line' | 'bar';
}

const CustomTooltip = ({ active, payload, label, color }: any) => {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0]?.value;
  const formatted = typeof value === 'number'
    ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)
    : value;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-2.5 text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      <p className="font-bold" style={{ color }}>{formatted} <span className="font-normal text-muted-foreground">F</span></p>
    </div>
  );
};

export default function SalesChart({ data, xKey, yKey, color = '#4ade80', chartType = 'line' }: SalesChartProps) {
  const gradientId = `grad-${yKey}`;
  return (
    <ResponsiveContainer width="100%" height={300}>
      {chartType === 'bar' ? (
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={1} />
              <stop offset="100%" stopColor={color} stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => {
              const n = Number(v);
              if (!Number.isFinite(n)) return String(v);
              return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
            }}
            width={40}
          />
          <Tooltip content={(props: any) => <CustomTooltip {...props} color={color} />} cursor={{ fill: `${color}18` }} />
          <Bar dataKey={yKey} fill={`url(#${gradientId})`} radius={[6, 6, 0, 0]} />
        </BarChart>
      ) : (
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => {
              const n = Number(v);
              if (!Number.isFinite(n)) return String(v);
              return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
            }}
            width={40}
          />
          <Tooltip content={(props: any) => <CustomTooltip {...props} color={color} />} />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            connectNulls={true}
            dot={(props) => {
              const key = (props as any).index ?? `${props.cx}-${props.cy}`;
              if (props.cx == null || props.cy == null) return null;
              return (
                <circle
                  key={key}
                  cx={props.cx}
                  cy={props.cy}
                  r={3.5}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={2}
                  style={{ pointerEvents: 'none' }}
                />
              );
            }}
          />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}
