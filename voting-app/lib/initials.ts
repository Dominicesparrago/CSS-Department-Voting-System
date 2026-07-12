export function initials(name: string, fallback = 'CS'): string {
  const value = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return value || fallback;
}
