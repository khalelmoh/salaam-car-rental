import type { ReactNode } from 'react';
import './StatsCard.css';

interface StatsCardProps {
    title: string;
    value: string | number;
    icon: ReactNode;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    color?: string;
}

const StatsCard = ({ title, value, icon, trend, color = 'var(--primary)' }: StatsCardProps) => {
    return (
        <div className="stats-card">
            <div className="stats-icon" style={{ backgroundColor: color }}>
                {icon}
            </div>
            <div className="stats-content">
                <h3 className="stats-title">{title}</h3>
                <div className="stats-value">{value}</div>
                {trend && (
                    <div className={`stats-trend ${trend.isPositive ? 'positive' : 'negative'}`}>
                        {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}% from last month
                    </div>
                )}
            </div>
        </div>
    );
};

export default StatsCard;
