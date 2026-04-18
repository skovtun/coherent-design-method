const COLOR_MAP: Record<string, { light: string; dark: string }> = {
  zinc: { light: '#18181b', dark: '#fafafa' },
  emerald: { light: '#059669', dark: '#34d399' },
  indigo: { light: '#4f46e5', dark: '#818cf8' },
  rose: { light: '#e11d48', dark: '#fb7185' },
  amber: { light: '#d97706', dark: '#fbbf24' },
  teal: { light: '#0d9488', dark: '#2dd4bf' },
  violet: { light: '#7c3aed', dark: '#a78bfa' },
  slate: { light: '#475569', dark: '#cbd5e1' },
}

export function resolveColorPreset(hint: string): { light: string; dark: string } | null {
  if (!hint || hint === 'blue') return null
  return COLOR_MAP[hint.toLowerCase()] ?? null
}
