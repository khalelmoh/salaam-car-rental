import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const data = [
    { name: 'Available', value: 24, color: '#10b981' }, // Emerald 500
    { name: 'Rented', value: 18, color: '#f59e0b' },    // Amber 500
    { name: 'Maintenance', value: 5, color: '#ef4444' }, // Red 500
];

const FleetStatusChart = () => {
    return (
        <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default FleetStatusChart;
