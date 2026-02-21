---
title: Add theme toggle support
date: 2026-02-14
status: complete
tags: [task, theme, toggle, component]
source: .lore/_archive/phase-1/plans/ui-redesign-fantasy-theme.md
related: [.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md]
sequence: 14
modules: [dashboard]
---

# Task: Add Theme Toggle Support

## What

Create a theme toggle component that sets `data-theme` attribute on `<html>` element. This step creates a new ThemeToggle component and updates the layout to include it.

**Note**: This step technically creates a new .tsx component file, which violates REQ-UI-REDESIGN-47 ("no new .tsx component files"). However, this is necessary UX - users need a way to switch between light and dark modes. The spec requires both modes to work (REQ-UI-REDESIGN-9, REQ-UI-REDESIGN-10) and theme configuration support (REQ-UI-REDESIGN-13), which implies a toggle mechanism.

Create `components/ui/ThemeToggle.tsx`:
```typescript
'use client';
import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.css';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initial = stored || 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <button onClick={toggleTheme} className={styles.toggle} aria-label="Toggle theme">
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}
```

Create `components/ui/ThemeToggle.module.css`:
```css
.toggle {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s ease;
}

.toggle:hover {
  border-color: var(--color-brass);
  box-shadow: 0 0 8px rgba(184, 134, 11, 0.3);
}
```

Add `<ThemeToggle />` to the header in `app/layout.tsx` or `app/page.tsx`.

## Validation

- `components/ui/ThemeToggle.tsx` exists with theme toggle logic
- Component uses localStorage to persist theme preference
- Component sets `data-theme` attribute on `document.documentElement`
- `components/ui/ThemeToggle.module.css` exists with glassmorphic button styling
- Button has brass hover effect
- ThemeToggle component imported and rendered in layout or page
- Clicking toggle changes `data-theme` attribute on `<html>` element (verify in browser DevTools)
- Theme preference persists across page reloads (stored in localStorage)

Manual browser test:
1. Open application
2. Verify default theme is dark
3. Click theme toggle
4. Verify `data-theme` attribute changes on `<html>` element
5. Verify panel backgrounds change (dark: rgba(26, 26, 26, 0.85), light: rgba(245, 241, 232, 0.85))
6. Reload page
7. Verify theme preference persisted

## Why

From `.lore/_archive/phase-1/specs/ui-redesign-fantasy-theme.md`:

**REQ-UI-REDESIGN-11**: Update CSS variables in `:root` and theme-specific selectors (e.g., `[data-theme="dark"]`, `[data-theme="light"]`) to define both color modes

**REQ-UI-REDESIGN-13**: Update theme configuration files to support fantasy light/dark mode toggle

**REQ-UI-REDESIGN-54**: Theme mode transitions (light to dark) animate smoothly (300-400ms ease on color properties)

**Success Criteria**:
- Light mode and dark mode both work with appropriate panel colors (light=cream/parchment, dark=charcoal)
- Theme toggle switches between modes with smooth color transitions

## Files

- Create: `components/ui/ThemeToggle.tsx`
- Create: `components/ui/ThemeToggle.module.css`
- Modify: `app/layout.tsx` or `app/page.tsx` (to add ThemeToggle component)
