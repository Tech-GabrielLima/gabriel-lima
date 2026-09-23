import type { Lang } from '../film/store'

// How to reach Gabriel (ROTEIRO, Cena 06). No backend: messages leave through
// the visitor's own mail client or WhatsApp.

export const CONTACT = {
  email: 'port.gabriel.lima@gmail.com',
  whatsapp: '5581996199997',
  whatsappLabel: '+55 81 99619-9997',
  github: 'https://github.com/Tech-GabrielLima',
  status: { en: 'Available for jobs and freelance', pt: 'Disponível para vagas e freelas' },
}

export const mailto = (name: string, message: string, lang: Lang) =>
  `mailto:${CONTACT.email}?subject=${encodeURIComponent(
    lang === 'pt' ? `Contato pelo portfólio${name ? ` — ${name}` : ''}` : `Portfolio contact${name ? ` — ${name}` : ''}`,
  )}&body=${encodeURIComponent(message)}`

export const whatsapp = (name: string, message: string, lang: Lang) =>
  `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(
    `${name ? (lang === 'pt' ? `Olá, Gabriel! Aqui é ${name}. ` : `Hi Gabriel, this is ${name}. `) : ''}${message}`,
  )}`

/** The end credits, in order. Every craft is credited to the same person: that's the point. */
export const CREDITS: { role: Record<Lang, string>; name: string | Record<Lang, string> }[] = [
  { role: { en: 'Directed by', pt: 'Direção' }, name: 'Gabriel Lima' },
  { role: { en: 'Screenplay', pt: 'Roteiro' }, name: 'Gabriel Lima' },
  { role: { en: 'Data', pt: 'Dados' }, name: 'Gabriel Lima' },
  { role: { en: 'Automation', pt: 'Automações' }, name: 'Gabriel Lima' },
  { role: { en: 'Front-end', pt: 'Front-end' }, name: 'Gabriel Lima' },
  { role: { en: 'Back-end', pt: 'Back-end' }, name: 'Gabriel Lima' },
  { role: { en: 'Compiler', pt: 'Compilador' }, name: 'Gabriel Lima' },
  { role: { en: 'GPU kernels', pt: 'Kernels de GPU' }, name: 'Gabriel Lima' },
  { role: { en: 'Distributed consensus', pt: 'Consenso distribuído' }, name: 'Gabriel Lima' },
  { role: { en: 'Cinematography', pt: 'Fotografia' }, name: 'Poly Haven · NASA' },
  { role: { en: 'Cast', pt: 'Elenco' }, name: 'flight · hale · raft · match · ledger · nabla · cuda' },
  { role: { en: 'Special appearance', pt: 'Participação especial' }, name: { en: 'Grupo Bel Cosméticos · 8+ companies', pt: 'Grupo Bel Cosméticos · 8+ empresas' } },
  { role: { en: 'Thanks', pt: 'Agradecimentos' }, name: { en: 'you, for staying until the end', pt: 'você, por ficar até o fim' } },
]
