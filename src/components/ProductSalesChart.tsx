import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
interface ProductSalesChartProps {
    data: any[];
    chartType?: 'bar' | 'pie';
}
// Couleurs pour le graphique circulaire
const COLORS = ['#10b981', '#22c55e', '#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b', '#34d399', '#6366f1', '#f43f5e', '#84cc16'];
export default function ProductSalesChart({ data, chartType = 'bar' }: ProductSalesChartProps) {
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
    useEffect(() => {
        const handleResize = () => {
            setWindowWidth(window.innerWidth);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    const isMobile = windowWidth < 768;
    const isTablet = windowWidth >= 768 && windowWidth < 1024;
    // Utilitaire safer pour formatter les nombres (gère strings numériques aussi)
    const formatNumberSafe = (val: any) => {
        if (typeof val === 'number' && Number.isFinite(val))
            return new Intl.NumberFormat('fr-FR').format(val);
        if (typeof val === 'string' && val.trim() !== '' && !Number.isNaN(Number(val))) {
            const n = Number(val);
            if (Number.isFinite(n))
                return new Intl.NumberFormat('fr-FR').format(n);
        }
        return String(val ?? 'N/A');
    };
    // Formatter pour le tooltip
    const formatTooltip = (value: any, name: string, props: any) => {
        if (name === 'total') {
            const { payload } = props;
            const formattedValue = typeof value === 'number' ? new Intl.NumberFormat('fr-FR').format(value) : 'N/A';
            return [
                `${formattedValue} F\nQuantité : ${payload?.quantity ?? ''}`,
                'Chiffre d\'affaires'
            ];
        }
        if (name === 'quantity') {
            return [`${value}`, 'Quantité'];
        }
        return [value, name];
    };
    // Custom tooltip pour barchart
    const CustomBarTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length)
            return null;
        return (<div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[160px]">
        <p className="font-semibold text-gray-800 mb-2 text-xs truncate">{label}</p>
        {payload.map((p: any, i: number) => (<div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.color }}/>
              {p.name === 'total' ? "CA" : "Qté"}
            </span>
            <span className="font-bold text-xs" style={{ color: p.color }}>
              {p.name === 'total'
                    ? `${typeof p.value === 'number' ? new Intl.NumberFormat('fr-FR').format(p.value) : p.value} F`
                    : p.value}
            </span>
          </div>))}
      </div>);
    };
    // Formatter personnalisé pour les labels du pie chart
    const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
        if (percent < 0.05)
            return null; // N'afficher le label que si > 5%
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
        return (<text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11} fontWeight="bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>);
    };
    // Tooltip pie
    const CustomPieTooltip = ({ active, payload }: any) => {
        if (!active || !payload || !payload.length)
            return null;
        const d = payload[0].payload;
        return (<div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[150px]">
        <p className="font-semibold text-gray-800 mb-1.5 text-xs">{d.name}</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">CA</span>
          <span className="font-bold text-xs text-emerald-600">{formatNumberSafe(d.total)} F</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Qté</span>
          <span className="font-bold text-xs text-blue-600">{d.quantity}</span>
        </div>
      </div>);
    };
    // Légende compacte et responsive pour le pie chart
    const renderCompactLegend = (props: any) => {
        const { payload } = props || {};
        if (!payload || !payload.length)
            return null;
        return (<div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 6 : 8, justifyContent: 'center', paddingTop: isMobile ? 6 : 12 }}>
        {payload.map((entry: any, idx: number) => {
                const d = entry.payload || {};
                const name = d.name || entry.value || '';
                const total = typeof d.total === 'number' ? `${new Intl.NumberFormat('fr-FR').format(d.total)} F` : 'N/A';
                const qty = d.quantity !== undefined ? `Qté : ${d.quantity}` : '';
                const label = `${name}`;
                return (<div key={idx} title={`${name} — ${total}${qty ? ' • ' + qty : ''}`} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 10px',
                        borderRadius: 999,
                        background: '#f9fafb',
                        border: `1.5px solid ${entry.color || '#ddd'}`,
                        maxWidth: isMobile ? 160 : 200,
                        overflow: 'hidden',
                    }}>
              <span style={{ width: 10, height: 10, background: entry.color || '#ccc', display: 'inline-block', borderRadius: '50%', flexShrink: 0 }}/>
              <span style={{ fontSize: isMobile ? 10 : 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            </div>);
            })}
      </div>);
    };
    if (chartType === 'pie') {
        const pieHeight = isMobile ? 350 : isTablet ? 400 : 450;
        const outerRadius = isMobile ? 80 : isTablet ? 100 : 120;
        return (<ResponsiveContainer width="100%" height={pieHeight}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" labelLine={false} label={isMobile ? undefined : renderCustomLabel} outerRadius={outerRadius} fill="#8884d8" dataKey="total">
            {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]}/>))}
          </Pie>
          <Tooltip content={<CustomPieTooltip />}/>
          <Legend content={renderCompactLegend}/>
        </PieChart>
      </ResponsiveContainer>);
    }
    // Hauteur dynamique : augmente avec le nombre de produits pour laisser plus d'espace entre les lignes
    const baseMinHeight = isMobile ? 250 : 300;
    const rowHeight = isMobile ? 48 : 40; // espace vertical par élément
    const computedHeight = Math.max(baseMinHeight, data.length * rowHeight);
    const barHeight = computedHeight;
    const leftMargin = isMobile ? 4 : 8;
    const rightMargin = isMobile ? 4 : 8;
    const maxNameLength = data.reduce((max, item) => Math.max(max, String(item?.name || '').length), 0);
    const estimatedLabelWidth = Math.round(maxNameLength * (isMobile ? 5.2 : 6.4) + 16);
    const yAxisWidth = Math.min(isMobile ? 92 : isTablet ? 110 : 130, Math.max(isMobile ? 52 : 64, estimatedLabelWidth));
    const fontSize = isMobile ? 9 : isTablet ? 10 : 12;
    return (<ResponsiveContainer width="100%" height={barHeight}>
      <BarChart data={data} layout="vertical" margin={{
            top: 5,
            right: rightMargin,
            left: leftMargin,
            bottom: 5
        }} barCategoryGap={isMobile ? '22%' : '14%'} barGap={8}>
        <defs>
          <linearGradient id="grad-total" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.9}/>
            <stop offset="100%" stopColor="#34d399" stopOpacity={1}/>
          </linearGradient>
          <linearGradient id="grad-qty" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.85}/>
            <stop offset="100%" stopColor="#60a5fa" stopOpacity={1}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false}/>
        <XAxis type="number" tick={{ fontSize: fontSize, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(value) => {
            const num = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
            if (!Number.isFinite(num))
                return String(value);
            return isMobile ? `${Math.round(num / 1000)}k` : new Intl.NumberFormat('fr-FR').format(num);
        }} xAxisId="total"/>
        <XAxis type="number" orientation="top" axisLine={false} tickLine={false} tick={{ fontSize: fontSize, fill: '#60a5fa' }} xAxisId="quantity" tickFormatter={(value) => `${value}`} label={{ value: 'Quantité', position: 'insideTopRight', offset: 0, fill: '#60a5fa', fontSize: fontSize + 1 }}/>
        <YAxis dataKey="name" type="category" width={yAxisWidth} tick={{ fontSize: fontSize, fill: '#6b7280' }} axisLine={false} tickLine={false} interval={0} tickFormatter={(value) => {
            if (isMobile && value.length > 10) {
                return value.substring(0, 10) + '…';
            }
            if (isTablet && value.length > 15) {
                return value.substring(0, 15) + '…';
            }
            return value;
        }}/>
        <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }}/>
        <Bar dataKey="total" fill="url(#grad-total)" radius={[0, 5, 5, 0]} name="total" xAxisId="total" barSize={isMobile ? 10 : 18}/>
        <Bar dataKey="quantity" fill="url(#grad-qty)" radius={[0, 5, 5, 0]} name="quantity" xAxisId="quantity" barSize={isMobile ? 8 : 12}/>
        <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: fontSize, marginTop: 10, paddingTop: 8 }} payload={[
            { value: "Chiffre d'affaires", type: 'circle', color: '#10b981' },
            { value: 'Quantité vendue', type: 'circle', color: '#2563eb' }
        ]}/>
      </BarChart>
    </ResponsiveContainer>);
}
