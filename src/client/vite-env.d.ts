/** Vite's `?url` imports return the emitted asset's final URL. */
declare module '*?url' {
  const url: string;
  export default url;
}

/** Stamped in by `vite.config.ts` at build time. See `buildInfo()` there. */
declare const __BUILD_INFO__: { readonly sha: string; readonly builtAt: string };
