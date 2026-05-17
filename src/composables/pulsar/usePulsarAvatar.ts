// Palette coordinata con il brand PULSAR (#3A8C80).
// Tonalità teal/verde con qualche variazione per dare riconoscibilità tra
// utenti senza rompere l'armonia visiva del modulo.
const PULSAR_PALETTE = [
  '#3A8C80', // teal primario
  '#2E7268', // teal profondo
  '#4DA092', // teal medio
  '#5BAEA1', // mint
  '#88B8AE', // pallido
  '#6A9D90', // sage
  '#265E56', // foresta
  '#7FBFB1', // chiaro
] as const

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function pulsarAvatarColor(seed: string): string {
  if (!seed) return PULSAR_PALETTE[0]
  return PULSAR_PALETTE[hashCode(seed) % PULSAR_PALETTE.length]
}
