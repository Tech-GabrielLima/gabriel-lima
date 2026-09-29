// The house vocabulary (ROTEIRO §0.4.8): the only words visitors can pass
// each other. The server validates against the same list (cinema/src/vocab.rs).

export const WORDS = [
  'olá',
  'oi',
  'obrigado',
  'boa sorte',
  'psiu',
  'tente',
  'siga',
  'a luz',
  'o projetor',
  'a cabine',
  'o bueiro',
  'a lua',
  'o beco',
  'o cofre',
  'o farol',
  'a chuva',
  'os créditos',
  'ao contrário',
  'segure',
  'espere',
  'não clique',
  'clique',
  'quem liga o projetor?',
  '48',
  'está perto',
  'continue',
  'volte',
  'no escuro',
  'devagar',
  'rápido',
  'hello',
  'hi',
  'thanks',
  'good luck',
  'shh',
  'try',
  'follow',
  'the light',
  'the projector',
  'the booth',
  'the manhole',
  'the moon',
  'the alley',
  'the vault',
  'the lighthouse',
  'the rain',
  'the credits',
  'backwards',
  'hold',
  'wait',
  'don\'t click',
  'click',
  'who turns the projector on?',
  'it\'s close',
  'keep going',
  'go back',
  'in the dark',
  'slowly',
  'quickly',
]

/** The server's list holds the Portuguese words first, then the English ones. */
export const WORDS_PT = WORDS.slice(0, WORDS.indexOf('hello'))
export const WORDS_EN = WORDS.slice(WORDS.indexOf('hello'))

export const inVocab = (w: string) => WORDS.includes(w)

/** Splits a typed line into vocabulary items, longest match first ("boa sorte", "a luz"…). → null if something isn't in it. */
export function parseWords(line: string): string[] | null {
  const out: string[] = []
  let rest = line.trim().toLowerCase()
  const sorted = [...WORDS].sort((a, b) => b.length - a.length)
  while (rest) {
    const w = sorted.find((x) => rest === x || rest.startsWith(x + ' '))
    if (!w) return null
    out.push(w)
    rest = rest.slice(w.length).trim()
  }
  return out.length ? out : null
}
