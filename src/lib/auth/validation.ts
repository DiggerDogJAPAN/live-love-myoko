export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export function registrationFullName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    return name.length > 0 && name.length <= 80 ? name : null;
}
