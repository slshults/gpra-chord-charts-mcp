/**
 * Minimal typings for `svgdom`, which ships none.
 *
 * Only the handful of members the renderer touches are declared — the point is
 * to keep `png.ts` honest without pulling the whole DOM lib into a project that
 * otherwise runs nowhere near a browser.
 */
declare module 'svgdom' {
  export interface SvgDomElement {
    innerHTML: string;
    appendChild(child: SvgDomElement): void;
    remove(): void;
  }

  export interface SvgDomDocument {
    documentElement: SvgDomElement;
    createElement(tagName: string): SvgDomElement;
  }

  export interface SvgDomWindow {
    document: SvgDomDocument;
    SVGElement: unknown;
  }

  export function createSVGWindow(): SvgDomWindow;
}
