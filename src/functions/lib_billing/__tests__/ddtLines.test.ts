// ============================================================================
// Righe DDT: è la regola che decide COSA VIENE FATTURATO (su CiC la fattura nasce
// dal DDT). Un errore qui non si vede — si scopre a fine mese sulle fatture.
// Casi presi dai difetti reali di giugno 2026 (vedi note di debito/credito).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { buildDdtLines, isDeliveryTariff } from '../ddtLines';
import { round2 } from '../rounding';

const vetro = (p: number, q = 1) => ({
  categoria: 'DUPLEX', descrizioneCompleta: 'DUPLEX 25', codice: 'D211',
  quantita: q, prezzo_unitario: p, base_mm: 800, altezza_mm: 1200,
});
const consegna = (nome: string, p: number) => ({
  categoria: 'EXTRA', descrizioneCompleta: nome, codice: 'L001', quantita: 1, prezzo_unitario: p,
});
const lavorazione = (p: number, q = 1) => ({
  categoria: 'EXTRA', descrizioneCompleta: 'CURVATURE E ADATTAMENTI', codice: '', quantita: q, prezzo_unitario: p,
});
const netto = (ls: any[], scPag: number) =>
  round2(ls.filter((l) => !l.isDescriptive)
    .reduce((a, l) => a + round2(l.qty * l.unitNetPrice * (1 - scPag / 100)), 0));

describe('buildDdtLines — cosa finisce in fattura', () => {
  it('tiene le lavorazioni (il difetto di giugno: venivano buttate)', () => {
    const lines = buildDdtLines([{ elementi: [vetro(100), lavorazione(40, 36)] }], 0);
    expect(lines.find((l) => l.description.includes('CURVATURE'))).toBeTruthy();
    expect(netto(lines, 0)).toBe(1540); // 100 + 1440 → nessun euro perso
  });

  it('addebita UNA sola consegna anche con più ordini, alla tariffa più alta', () => {
    const lines = buildDdtLines([
      { elementi: [vetro(50), consegna('Consegna Diretta V1', 35)] },
      { elementi: [vetro(60), consegna('Consegna Diretta V2', 45)] },
      { elementi: [vetro(70), consegna('Consegna Diretta V1', 35)] },
    ], 0);
    const consegne = lines.filter((l) => isDeliveryTariff(l.description));
    expect(consegne).toHaveLength(1);
    expect(consegne[0].unitNetPrice).toBe(45);  // la più alta, non la prima
    expect(consegne[0].qty).toBe(1);
  });

  // REGOLA COMMERCIALE: il trasporto non si sconta mai per l'ordine — accetta solo lo
  // sconto di pagamento. Se prendesse lo sconto d'ordine, un cumulativo che mescola un
  // ordine molto scontato con uno a prezzo pieno incasserebbe MENO della consegna scartata.
  it('la consegna resta a tariffa PIENA anche se il suo ordine è scontato', () => {
    const lines = buildDdtLines([
      { elementi: [vetro(60), consegna('Consegna Diretta V2', 45)], scontoPercentuale: 10 },
    ], 0);
    const c = lines.find((l) => isDeliveryTariff(l.description))!;
    expect(c.unitNetPrice).toBe(45);   // NON 40,50
  });

  it('cumulativo con sconti misti: non si addebita meno della consegna scartata', () => {
    const lines = buildDdtLines([
      { elementi: [vetro(10), consegna('Consegna Diretta V4', 80)], scontoPercentuale: 40 },
      { elementi: [vetro(10), consegna('Consegna Diretta V2', 60)], scontoPercentuale: 0 },
    ], 0);
    const c = lines.find((l) => isDeliveryTariff(l.description))!;
    expect(c.unitNetPrice).toBe(80);   // vince la tariffa più alta, e la incassiamo intera
    expect(c.unitNetPrice).toBeGreaterThanOrEqual(60);
  });

  it('la merce resta scontata anche quando la consegna non lo è', () => {
    const lines = buildDdtLines([
      { elementi: [vetro(100), lavorazione(50), consegna('Consegna Diretta V1', 35)], scontoPercentuale: 10 },
    ], 0);
    const prezzi = lines.filter((l) => !l.isDescriptive).map((l) => l.unitNetPrice);
    expect(prezzi).toEqual([90, 45, 35]);   // merce −10%, lavorazione −10%, consegna piena
  });

  it('sconto ordine dentro il prezzo, sconto pagamento sul campo sconto (cascata)', () => {
    const lines = buildDdtLines([{ elementi: [vetro(56, 4)], scontoPercentuale: 5 }], 3);
    const riga = lines.find((l) => !l.isDescriptive)!;
    expect(riga.unitNetPrice).toBeCloseTo(53.2, 10);   // 56 − 5%
    expect(riga.discountPercentage).toBe(3);           // il pagamento resta sul campo
    expect(netto(lines, 3)).toBe(206.42);              // 4 × 56 × 0,95 × 0,97
  });

  it('dichiara lo sconto in una riga descrittiva (i prezzi unitari sono già netti)', () => {
    const lines = buildDdtLines([{ elementi: [vetro(100)], scontoPercentuale: 5, cic_order_number: 55, commessa: 'CALIFORNIA' }], 0);
    const testa = lines[0];
    expect(testa.isDescriptive).toBe(true);
    expect(testa.description).toBe('Ordine 55 - CALIFORNIA - prezzi già scontati del 5% come da accordi');
  });

  it('ordine singolo senza sconto: nessuna riga descrittiva (comportamento storico)', () => {
    const lines = buildDdtLines([{ elementi: [vetro(100)] }], 0);
    expect(lines.filter((l) => l.isDescriptive)).toHaveLength(0);
  });

  it('DDT cumulativo: una testata per ordine, per risalire agli ordini dal DDT', () => {
    const lines = buildDdtLines([
      { elementi: [vetro(10)], cic_order_number: 1, commessa: 'A' },
      { elementi: [vetro(20)], cic_order_number: 2, commessa: 'B' },
    ], 0);
    expect(lines.filter((l) => l.isDescriptive).map((l) => l.description))
      .toEqual(['Ordine 1 - A', 'Ordine 2 - B']);
  });

  it('sconti diversi fra ordini dello stesso DDT: ogni riga col suo', () => {
    const lines = buildDdtLines([
      { elementi: [vetro(100)], scontoPercentuale: 50 },   // NURITH
      { elementi: [vetro(100)], scontoPercentuale: 0 },
    ], 0);
    const prezzi = lines.filter((l) => !l.isDescriptive).map((l) => l.unitNetPrice);
    expect(prezzi).toEqual([50, 100]);
  });

  it('nessuna merce da spedire → nessuna riga (la consegna da sola non è un trasporto)', () => {
    expect(buildDdtLines([{ elementi: [consegna('Consegna Diretta V1', 35)] }], 0)).toEqual([]);
    expect(buildDdtLines([{ elementi: [] }], 0)).toEqual([]);
    expect(buildDdtLines([], 0)).toEqual([]);
  });

  it('regge gli artefatti float dei prezzi POPS (8.399999999999999)', () => {
    const lines = buildDdtLines([{ elementi: [vetro(8.399999999999999, 2)], scontoPercentuale: 5 }], 3);
    const riga = lines.find((l) => !l.isDescriptive)!;
    expect(Number.isFinite(riga.unitNetPrice)).toBe(true);
    expect(netto(lines, 3)).toBe(15.48);  // 2 × 8,40 × 0,95 × 0,97
  });

  it('riconosce le tariffe a prescindere da maiuscole/spazi (i preventivi vecchi urlano)', () => {
    expect(isDeliveryTariff('CONSEGNA DIRETTA V1')).toBe(true);
    expect(isDeliveryTariff('  Spedizione ')).toBe(true);
    expect(isDeliveryTariff('Ritiro in sede')).toBe(true);
    expect(isDeliveryTariff('CURVATURE E ADATTAMENTI')).toBe(false);
    expect(isDeliveryTariff('')).toBe(false);
  });

  it('cliente senza sconto di pagamento: campo sconto a zero, non undefined', () => {
    const lines = buildDdtLines([{ elementi: [vetro(100)] }], 0);
    expect(lines[0].discountPercentage).toBe(0);
  });

  it('nessuna consegna nell\'ordine (ritiro non addebitato): nessuna riga inventata', () => {
    const lines = buildDdtLines([{ elementi: [vetro(100), lavorazione(25)] }], 0);
    expect(lines.filter((l) => isDeliveryTariff(l.description))).toHaveLength(0);
    expect(lines).toHaveLength(2);
  });

  it('corriere: la riga diventa "Spedizione" (nome + prodotto) ma tiene il prezzo pattuito', () => {
    const lines = buildDdtLines(
      [{ elementi: [vetro(100), consegna('Consegna Diretta V2', 45)] }], 0, 'COURIER',
    );
    const c = lines.at(-1)!;
    expect(c.description).toBe('Spedizione');
    expect(c.code).toBe('L004');       // prodotto a catalogo della spedizione
    expect(c.unitNetPrice).toBe(45);   // il prezzo resta quello accettato dal cliente
  });

  it('corriere su una riga già "Spedizione": nulla da rinominare', () => {
    const lines = buildDdtLines([{ elementi: [vetro(100), consegna('Spedizione', 25)] }], 0, 'COURIER');
    const c = lines.at(-1)!;
    expect(c.description).toBe('Spedizione');
    expect(c.unitNetPrice).toBe(25);
  });

  it('mezzi interni: la consegna diretta NON viene rinominata', () => {
    const lines = buildDdtLines(
      [{ elementi: [vetro(100), consegna('Consegna Diretta V2', 45)] }], 0, 'INTERNAL',
    );
    expect(lines.at(-1)!.description).toBe('Consegna Diretta V2');
  });

  it('corriere + sconto ordine: rinomina sì, sconto d\'ordine no', () => {
    const lines = buildDdtLines(
      [{ elementi: [vetro(100), consegna('Consegna Diretta V5', 40)], scontoPercentuale: 10 }], 3, 'COURIER',
    );
    const c = lines.at(-1)!;
    expect(c.description).toBe('Spedizione');
    expect(c.unitNetPrice).toBe(40);           // tariffa piena: il trasporto non si sconta
    expect(c.discountPercentage).toBe(3);      // solo lo sconto di pagamento
  });

  it('caso reale VETRODOMUS/CALIFORNIA: merce + consegna, sconto 0, pagamento 3%', () => {
    const lines = buildDdtLines([{
      elementi: [consegna('CONSEGNA DIRETTA V1', 35), vetro(18, 3), vetro(24)],
      cic_order_number: 140, commessa: 'CALIFORNIA',
    }], 3);
    // la consegna finisce IN FONDO (dopo la merce) ed è una sola
    expect(lines.at(-1)!.description).toBe('CONSEGNA DIRETTA V1');
    expect(netto(lines, 3)).toBe(round2((54 + 24 + 35) * 0.97));
  });
});
