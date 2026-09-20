# Rill artwork

These are the elegant handwritten wordmark and the selected cat with heavier white strokes, preserved as PNGs.
The `.bin` suffix uses Wrangler's built-in binary module support so existing installations
can bundle the artwork without changing their saved Wrangler configuration.
`src/brand.ts` frames the artwork for the wordmark, mascot, and favicon, and removes
the wordmark’s paper background using inverse luminance as alpha. The delivered SVGs have
transparent backgrounds and use matching neutral white ink.
