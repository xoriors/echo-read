import React, { createContext, useContext, useMemo, type ReactNode } from 'react';

import { createAppContainer, type AppContainer } from '../../../config/container';

const ContainerContext = createContext<AppContainer | null>(null);

/**
 * Makes the composed hexagon available to the component tree.
 * Components ask for use cases here rather than importing adapters directly.
 */
export function ContainerProvider({
  container,
  children,
}: {
  container?: AppContainer;
  children: ReactNode;
}): React.JSX.Element {
  const value = useMemo(() => container ?? createAppContainer(), [container]);
  return <ContainerContext.Provider value={value}>{children}</ContainerContext.Provider>;
}

export function useContainer(): AppContainer {
  const container = useContext(ContainerContext);
  if (!container) throw new Error('useContainer must be used inside a <ContainerProvider>');
  return container;
}
