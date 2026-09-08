import { useCallback, useState } from 'react';

import { nextTheme, type Theme } from '../../../../domain/theme';
import { applyTheme, hydrateTheme, persistTheme } from '../themeDom';

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(hydrateTheme);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = nextTheme(current);
      applyTheme(next);
      persistTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
