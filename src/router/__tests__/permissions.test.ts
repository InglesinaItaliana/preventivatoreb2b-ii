import { describe, it, expect } from 'vitest';
import { isAdminOnlyPath, isForbiddenClientPath } from '../permissions';

describe('pagine riservate ad ADMIN', () => {
  it('il configuratore griglie e le sue sottopagine', () => {
    expect(isAdminOnlyPath('/griglie')).toBe(true);
    expect(isAdminOnlyPath('/griglie/qualcosa')).toBe(true);
  });

  it('nessun altro path, nemmeno uno che comincia uguale', () => {
    for (const p of ['/', '/admin', '/preventivatore', '/dashboard', '/production', '/delivery', '/griglie-xyz', '/sidera']) {
      expect(isAdminOnlyPath(p)).toBe(false);
    }
  });

  it('resta comunque vietato ai clienti', () => {
    expect(isForbiddenClientPath('/griglie')).toBe(true);
  });
});
