import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface FleetStatusChartProps {
    data: Array<{ name: string; value: number; color: string }>;
}

const FleetStatusChart = ({ data }: FleetStatusChartProps) => {
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
                        contentStyle={{
                            borderRadius: '10px',
                            border: '1px solid #d5e4f6',
                            boxShadow: '0 12px 24px rgba(15, 23, 42, 0.15)',
                            background: 'linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)',
                        }}
                    />
                    <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        wrapperStyle={{ color: '#51647d', fontSize: '12px' }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default FleetStatusChart;
