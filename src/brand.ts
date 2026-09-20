import cat from './assets/rill-cat.png.bin';
import wordmark from './assets/rill-wordmark.png.bin';

export const BRAND_NAME = 'Rill';
export const BRAND_VERSION = 'handwritten-cat-8';

function artwork(data: ArrayBuffer, viewBox: string, width: number, height: number, filter: string): string {
  let binary = '';
  for (const byte of new Uint8Array(data)) binary += String.fromCharCode(byte);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewBox.split(' ')[2]}" height="${viewBox.split(' ')[3]}" viewBox="${viewBox}" role="img" aria-label="Rill"><defs><filter id="ink" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">${filter}</filter></defs><image width="${width}" height="${height}" filter="url(#ink)" href="data:image/png;base64,${btoa(binary)}"/></svg>`;
}

// Convert the handwritten black ink to neutral white, using inverse luminance
// as alpha so the paper and letter counters become transparent.
const whiteInk = '<feColorMatrix values="0 0 0 0 .953 0 0 0 0 .953 0 0 0 0 .953 -.2126 -.7152 -.0722 0 1"/><feComponentTransfer><feFuncA type="linear" slope="1.2" intercept="-.1"/></feComponentTransfer>';

// The matched mascot has heavier white strokes; suppress translucent extraction
// residue without changing its opaque black body or facial details.
const catInk = '<feComponentTransfer><feFuncA type="linear" slope="2" intercept="-.8"/></feComponentTransfer>';

// Viewports remove presentation margins while preserving the approved artwork.
export const BRAND_LOGO = artwork(cat, '110 30 1050 1200', 1254, 1254, catInk);
export const BRAND_ICON = artwork(cat, '125 20 875 875', 1254, 1254, catInk);
export const BRAND_WORDMARK = artwork(wordmark, '140 140 1510 605', 1774, 887, whiteInk);
