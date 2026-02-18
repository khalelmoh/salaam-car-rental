export interface Activity {
    id: string;
    message: string;
    type?: string;
    timestamp: number;
}

const STORAGE_KEY = 'salaam_activity';

export function getActivities(): Activity[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
}

export function addActivity(message: string, type = 'info') {
    const activities = getActivities();
    const act: Activity = {
        id: `ACT-${Math.floor(1000 + Math.random() * 9000)}`,
        message,
        type,
        timestamp: Date.now(),
    };
    activities.unshift(act);
    // keep recent 50
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities.slice(0, 50)));
    window.dispatchEvent(new CustomEvent('activity-updated', { detail: act }));
}

export function dispatchDataUpdate(name: string, payload?: unknown) {
    window.dispatchEvent(new CustomEvent(`${name}-updated`, { detail: payload }));
}
