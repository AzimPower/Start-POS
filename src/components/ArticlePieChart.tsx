import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
const COLORS = ['#7b97a5', '#a6d96a', '#67b7dc', '#e94f7a', '#ffe066'];
export default function ArticlePieChart({ data }) {
    return (<ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={100} label={false}>
          {data.map((entry, idx) => (<Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]}/>))}
        </Pie>
  <Tooltip formatter={(v: number | string) => `${Math.round(Number(v)).toLocaleString('fr-FR')} FCFA`}/>
      </PieChart>
    </ResponsiveContainer>);
}
