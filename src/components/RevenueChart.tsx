import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
    { name: 'Jan', revenue: 4000 },
    { name: 'Feb', revenue: 3000 },
    { name: 'Mar', revenue: 5500 },
    { name: 'Apr', revenue: 4500 },
    { name: 'May', revenue: 6000 },
    { name: 'Jun', revenue: 7500 },
];

const RevenueChart = () => {
    return (
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => [`$${value}`, 'Revenue']}
                    />
                    <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default RevenueChart;
