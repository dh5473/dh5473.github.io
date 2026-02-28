/**
 * Design token system for Donhyeok's Blog
 *
 * Colors are defined as CSS variable references.
 * Actual values are declared in GlobalStyle.tsx under :root and [data-theme='dark'].
 */

// CSS variable references — use these in styled components
export const c = {
  bg:          'var(--bg)',
  bgSubtle:    'var(--bg-subtle)',
  bgMuted:     'var(--bg-muted)',
  text:        'var(--text)',
  textMuted:   'var(--text-muted)',
  primary:     'var(--primary)',
  primaryHov:  'var(--primary-hov)',
  accent:      'var(--accent)',
  border:      'var(--border)',
  borderMuted: 'var(--border-muted)',
  codeBg:      'var(--code-bg)',
} as const

// Responsive breakpoints (max-width, desktop-first to match existing patterns)
export const bp = {
  sm: '@media (max-width: 640px)',
  md: '@media (max-width: 768px)',
  lg: '@media (max-width: 1024px)',
} as const

// Box shadows
export const shadow = {
  sm: '0 1px 4px rgba(0,0,0,0.06)',
  md: '0 4px 16px rgba(0,0,0,0.08)',
  lg: '0 8px 32px rgba(0,0,0,0.12)',
} as const
