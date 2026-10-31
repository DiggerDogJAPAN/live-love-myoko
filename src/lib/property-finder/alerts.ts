export const alertAreas = [
    { id: 'myoko', label: 'Myoko' }, { id: 'joetsu', label: 'Joetsu' },
    { id: 'shinano', label: 'Shinano Town / Kurohime' }, { id: 'iizuna', label: 'Iizuna' },
] as const;
export type AlertArea = typeof alertAreas[number]['id'];
export interface AlertPreferences { enabled: boolean; areas: AlertArea[]; deliveryNeedsReview: boolean }
