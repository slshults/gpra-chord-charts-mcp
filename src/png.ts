import { Resvg } from '@resvg/resvg-js';
import { createSVGWindow, type SvgDomElement, type SvgDomWindow } from 'svgdom';
import type { Chord } from './types.js';

/**
 * Server-side chord chart images.
 *
 * The grid is SVGuitar with the same settings the website uses, so an image
 * here is the diagram `/find-a-chord-chart` draws — including its five-fret
 * window, which means notes above the fifth fret fall outside the viewBox and
 * are clipped away. `format.ts` names those underneath the text chart.
 *
 * The colours are the one deliberate difference. The app renders white ink on a
 * transparent background because GPRA's own UI is dark; dropped into a chat
 * whose background we don't control, that produces an invisible chart — only
 * the black finger numbers survive. So these use the printed-chord-book
 * convention, black on white, which reads on any background. That's the same
 * adaptation the app makes, for a context where we can't know the backdrop.
 */

/** Rendered width in pixels. The SVG is resolution-independent; this is just
 *  large enough to stay crisp when a chat client scales it down. */
const RENDER_WIDTH = 600;

/** Charts are deterministic per chord, so caching is pure win. 12,708 exist but
 *  only a handful are ever popular; this bounds memory at a few megabytes. */
const CACHE_LIMIT = 256;
const cache = new Map<number, Buffer>();

interface Renderer {
  SVGuitarChord: new (element: unknown) => {
    configure(settings: unknown): { chord(chord: unknown): { draw(): void } };
  };
  window: SvgDomWindow;
}

let renderer: Promise<Renderer> | null = null;

/**
 * svguitar bundles its own copy of svg.js, which reads `globals.document` when
 * the module first evaluates — so `registerWindow()` on a separately installed
 * copy never reaches it, and the globals have to exist *before* the import.
 * Hence the dynamic import rather than a static one. It also keeps the render
 * dependencies unloaded until an image is actually asked for, which matters for
 * anyone running this over stdio.
 */
const load = (): Promise<Renderer> => {
  renderer ??= (async () => {
    const window = createSVGWindow();
    const globals = globalThis as Record<string, unknown>;
    globals.window ??= window;
    globals.document ??= window.document;
    globals.SVGElement ??= window.SVGElement;

    const mod = (await import('svguitar')) as unknown as Pick<Renderer, 'SVGuitarChord'>;
    return { SVGuitarChord: mod.SVGuitarChord, window };
  })();
  return renderer;
};

/** SVGuitar wants one flat finger list, with 0 for open and 'x' for muted —
 *  the same shape `ChordChartEditor` assembles in the app. */
const toSvguitarChord = (chord: Chord) => ({
  fingers: [
    ...chord.fingers.map((f) =>
      f.finger === undefined ? [f.string, f.fret] : [f.string, f.fret, String(f.finger)],
    ),
    ...chord.openStrings.map((s) => [s, 0]),
    ...chord.mutedStrings.map((s) => [s, 'x']),
  ],
  barres: chord.barres.map((b) => ({
    fromString: b.fromString,
    toString: b.toString,
    fret: b.fret,
    ...(b.finger === undefined ? {} : { text: String(b.finger) }),
  })),
});

/** Mirrors `defaultChartConfig` in the app, recoloured for an unknown backdrop. */
const chartConfig = (chord: Chord) => ({
  // Without a title the image is anonymous the moment it leaves the chat —
  // saved, pasted into Slack, or shown next to five others.
  title: chord.name,
  strings: chord.numStrings,
  frets: 5,
  position: 1,
  tuning: [],
  fretSize: 1.2,
  fingerSize: 0.75,
  sidePadding: 0.2,
  fontFamily: 'Arial',
  fingerTextSize: 28,
  // Rectangle style has a fill bug in svguitar 2.5.x; the app uses arc too.
  barreChordStyle: 'arc',
  color: '#000000',
  fingerColor: '#000000',
  strokeColor: '#000000',
  textColor: '#000000',
  fretLabelColor: '#000000',
  barreChordStrokeColor: '#000000',
  fingerTextColor: '#ffffff',
  backgroundColor: '#ffffff',
});

const remember = (id: number, png: Buffer): void => {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(id, png);
};

/**
 * A PNG of the chord chart, or null if rendering fails.
 *
 * Never throws: the image is a bonus on top of the text chart, and losing the
 * whole lookup because a renderer hiccuped would be a bad trade.
 */
export const chordPng = async (chord: Chord): Promise<Buffer | null> => {
  const cached = cache.get(chord.id);
  if (cached) return cached;

  let host: SvgDomElement | null = null;
  try {
    const { SVGuitarChord, window } = await load();
    host = window.document.createElement('div');
    window.document.documentElement.appendChild(host);

    new SVGuitarChord(host).configure(chartConfig(chord)).chord(toSvguitarChord(chord)).draw();

    const png = new Resvg(host.innerHTML, {
      fitTo: { mode: 'width', value: RENDER_WIDTH },
    })
      .render()
      .asPng();

    remember(chord.id, png);
    return png;
  } catch (error) {
    console.error(`Chord image render failed for ${chord.name} (#${chord.id}):`, error);
    return null;
  } finally {
    host?.remove();
  }
};
