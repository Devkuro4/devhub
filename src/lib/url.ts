export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname && parsed.hostname.includes('.'));
  } catch {
    return false;
  }
}

export function getUrlError(value: string, example = 'https://github.com/username/project'): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return `Include https:// or http:// at the start (e.g., ${example}).`;
  }
  if (!isValidHttpUrl(trimmed)) {
    return `Enter a valid web address (e.g., ${example}).`;
  }
  return '';
}
