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
    trendLabel?: string;
    color?: string;
}

const StatsCard = ({
    title,
    value,
    icon,
    trend,
    trendLabel = 'from last month',
    color = 'var(--primary)',
}: StatsCardProps) => {
    return (
        <div className="stats-card">
            <div className="stats-icon" style={{ backgroundColor: color }} aria-hidden="true">
                {icon}
            </div>
            <div className="stats-content">
                <h3 className="stats-title">{title}</h3>
                <div className="stats-value">{value}</div>
                {trend && (
                    <div className={`stats-trend ${trend.isPositive ? 'positive' : 'negative'}`}>
                        <span className="stats-trend-arrow">{trend.isPositive ? '+' : '-'}</span>
                        <span>{Math.abs(trend.value)}% {trendLabel}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StatsCard;
