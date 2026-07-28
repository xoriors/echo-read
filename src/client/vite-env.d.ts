/** Vite's `?url` imports return the emitted asset's final URL. */
declare module '*?url' {
  const url: string;
  export default url;
}
