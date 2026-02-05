import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface ProductSalesChartProps {
  data: any[];
  chartType?: 'bar' | 'pie';
}

// Couleurs pour le graphique circulaire
const COLORS = ['#f97316', '#22c55e', '#3b82f6', '#ef4444', '#8b5cf6', '#f59e0b', '#10b981', '#6366f1', '#f43f5e', '#84cc16'];

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
    if (typeof val === 'number' && Number.isFinite(val)) return new Intl.NumberFormat('fr-FR').format(val);
    if (typeof val === 'string' && val.trim() !== '' && !Number.isNaN(Number(val))) {
      const n = Number(val);
      if (Number.isFinite(n)) return new Intl.NumberFormat('fr-FR').format(n);
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

  // Formatter personnalisé pour les labels du pie chart
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null; // N'afficher le label que si > 5%
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Légende compacte et responsive pour le pie chart
  const renderCompactLegend = (props: any) => {
    const { payload } = props || {};
    if (!payload || !payload.length) return null;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? 6 : 12, justifyContent: 'center', paddingTop: isMobile ? 6 : 12 }}>
        {payload.map((entry: any, idx: number) => {
          const d = entry.payload || {};
          const name = d.name || entry.value || '';
          const total = typeof d.total === 'number' ? `${new Intl.NumberFormat('fr-FR').format(d.total)} F` : 'N/A';
          const qty = d.quantity !== undefined ? `Qté: ${d.quantity}` : '';
          const label = `${name}${total ? ' (' + total : ''}${qty ? (total ? ', ' + qty : ' (' + qty) : ''}${total || qty ? ')' : ''}`;
          return (
            <div
              key={idx}
              title={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isMobile ? 6 : 8,
                maxWidth: isMobile ? 180 : 220,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                padding: isMobile ? '6px 8px' : '8px 12px',
                borderRadius: 8,
                background: '#ffffff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                border: '1px solid #ddd'
              }}
            >
              <span style={{ width: isMobile ? 12 : 14, height: isMobile ? 12 : 14, background: entry.color || '#ccc', display: 'inline-block', borderRadius: 3 }} />
              <span style={{ fontSize: isMobile ? 10 : 12, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  if (chartType === 'pie') {
    const pieHeight = isMobile ? 350 : isTablet ? 400 : 450;
    const outerRadius = isMobile ? 80 : isTablet ? 100 : 120;
    
    return (
      <ResponsiveContainer width="100%" height={pieHeight}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={isMobile ? undefined : renderCustomLabel}
            outerRadius={outerRadius}
            fill="#8884d8"
            dataKey="total"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            formatter={formatTooltip}
            // Affiche le nom, le montant et la quantité dans le tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload;
                return (
                  <div style={{ background: '#fff', border: '1px solid #eee', padding: 8, fontSize: 12 }}>
                    <div><b>{d.name}</b></div>
                    <div>Chiffre d'affaires : {formatNumberSafe(d.total)} F</div>
                    <div>Quantité : {d.quantity}</div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend content={renderCompactLegend} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // Hauteur dynamique : augmente avec le nombre de produits pour laisser plus d'espace entre les lignes
  const baseMinHeight = isMobile ? 250 : 300;
  const rowHeight = isMobile ? 48 : 40; // espace vertical par élément
  const computedHeight = Math.max(baseMinHeight, data.length * rowHeight);
  const barHeight = computedHeight;
  const leftMargin = 0;
  const rightMargin = 0;
  const yAxisWidth = isMobile ? 70 : isTablet ? 100 : 120;
  const fontSize = isMobile ? 9 : isTablet ? 10 : 12;

  return (
    <ResponsiveContainer width="100%" height={barHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ 
          top: 5, 
          right: rightMargin, 
          left: leftMargin, 
          bottom: 5 
        }}
        barCategoryGap={isMobile ? '22%' : '14%'}
        barGap={8}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          type="number" 
          tick={{ fontSize: fontSize }}
          tickFormatter={(value) => {
            const num = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
            if (!Number.isFinite(num)) return String(value);
            return isMobile ? `${Math.round(num / 1000)}k` : new Intl.NumberFormat('fr-FR').format(num);
          }}
          xAxisId="total"
        />
        <XAxis
          type="number"
          orientation="top"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: fontSize, fill: '#2563eb' }}
          xAxisId="quantity"
          tickFormatter={(value) => `${value}`}
          label={{ value: 'Quantité', position: 'insideTopRight', offset: 0, fill: '#2563eb', fontSize: fontSize+1 }}
        />
        <YAxis 
          dataKey="name" 
          type="category" 
          width={yAxisWidth}
          tick={{ fontSize: fontSize }}
          interval={0}
          tickFormatter={(value) => {
            if (isMobile && value.length > 10) {
              return value.substring(0, 10) + '...';
            }
            if (isTablet && value.length > 15) {
              return value.substring(0, 15) + '...';
            }
            return value;
          }}
        />
        <Tooltip 
          labelStyle={{ fontSize: fontSize }}
          contentStyle={{ fontSize: fontSize }}
          // Tooltip séparé pour chaque barre
          formatter={(value, name) => {
            if (name === 'total') {
              return [`${formatNumberSafe(value)} F`, "Chiffre d\'affaires"];
            }
            if (name === 'quantity') {
              return [value, 'Quantité'];
            }
            return [value, name];
          }}
        />
        <Bar dataKey="total" fill="#f97316" radius={[0, 4, 4, 0]} name="Chiffre d'affaires" xAxisId="total" barSize={isMobile ? 12 : 22} />
        <Bar dataKey="quantity" fill="#2563eb" radius={[0, 4, 4, 0]} name="Quantité vendue" xAxisId="quantity" barSize={isMobile ? 12 : 16} />
        <Legend
          verticalAlign="bottom"
          align="center"
          iconType="rect"
          wrapperStyle={{ fontSize: fontSize, marginTop: 8 }}
          payload={[
            { value: "Chiffre d'affaires", type: 'rect', color: '#f97316' },
            { value: 'Quantité vendue', type: 'rect', color: '#2563eb' }
          ]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
