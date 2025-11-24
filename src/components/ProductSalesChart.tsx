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

  // Formatter pour le tooltip
  const formatTooltip = (value: any, name: string) => {
    if (name === 'total') {
      return [`${new Intl.NumberFormat('fr-FR').format(value)} F`, 'Chiffre d\'affaires'];
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
          <Tooltip formatter={formatTooltip} />
          <Legend 
            wrapperStyle={{ 
              fontSize: isMobile ? '10px' : '12px',
              paddingTop: '10px'
            }}
            formatter={(value, entry: any) => {
              const productData = data.find(item => item.name === (entry.payload?.name || value));
              const price = productData ? new Intl.NumberFormat('fr-FR').format(productData.total) : '0';
              return (
                <span style={{ color: entry.color }}>
                  {entry.payload?.name || value} ({price} F)
                </span>
              );
            }}
            layout={isMobile ? 'vertical' : 'horizontal'}
            align={isMobile ? 'left' : 'center'}
            verticalAlign={isMobile ? 'middle' : 'bottom'}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const barHeight = isMobile ? 250 : 300;
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
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          type="number" 
          tick={{ fontSize: fontSize }}
          tickFormatter={(value) => isMobile ? `${Math.round(value / 1000)}k` : new Intl.NumberFormat('fr-FR').format(value)}
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
          formatter={formatTooltip}
          labelStyle={{ fontSize: fontSize }}
          contentStyle={{ fontSize: fontSize }}
        />
        <Bar dataKey="total" fill="#f97316" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
