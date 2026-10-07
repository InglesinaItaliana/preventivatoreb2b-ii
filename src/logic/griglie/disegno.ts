// src/logic/griglie/disegno.ts
//
// La forma dei pezzi sul disegno, condivisa da anteprima e PDF: così il foglio
// che va in officina mostra esattamente quello che si vede a video.
// Modulo PURO, in millimetri.

import type { Punto } from './diagonale';
import type { SegmentoBarra } from './progetto';

/**
 * Una barra è un segmento ingrossato alla sua larghezza (18 mm, o 26 per
 * l'inglesina PREMIUM): il poligono dei suoi spigoli. Vale identico per le
 * ortogonali e per le diagonali.
 *
 * Con lo smusso (PREMIUM) ogni testa perde i due spigoli a 45°: la punta che
 * sormonta si restringe, come nel pezzo fresato.
 */
export function poligonoBarra(b: SegmentoBarra, larghezza: number): Punto[] {
  const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;   // lungo la barra
  const nx = -uy, ny = ux;              // di traverso
  const w = larghezza / 2;
  const c = Math.min(b.smusso ?? 0, w, len / 2);
  const p = (x: number, y: number, lungo: number, traverso: number): Punto =>
    ({ x: x + ux * lungo + nx * traverso, y: y + uy * lungo + ny * traverso });

  if (c <= 0) {
    return [p(b.x1, b.y1, 0, w), p(b.x2, b.y2, 0, w), p(b.x2, b.y2, 0, -w), p(b.x1, b.y1, 0, -w)];
  }
  return [
    p(b.x1, b.y1, 0, w - c), p(b.x1, b.y1, c, w),
    p(b.x2, b.y2, -c, w), p(b.x2, b.y2, 0, w - c),
    p(b.x2, b.y2, 0, -(w - c)), p(b.x2, b.y2, -c, -w),
    p(b.x1, b.y1, c, -w), p(b.x1, b.y1, 0, -(w - c)),
  ];
}
