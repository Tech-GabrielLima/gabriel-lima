import { useFilm } from '../film/store'
import { Terminal } from './Terminal'
import { USER } from './machine'

// ?terminal=cabine|caixa|maquinas: one GL-1 terminal, full screen (for links
// and for testing; in the acts, the terminals live in their scenes).

const WHO = {
  caixa: { user: USER.caixa, en: 'Box office terminal', pt: 'Terminal da bilheteria' },
  cabine: { user: USER.visitante, en: "The projectionist's computer", pt: 'O computador do projecionista' },
  maquinas: { user: USER.root, en: 'Machine room console', pt: 'Console da sala de máquinas' },
} as const

export default function TerminalPage() {
  const lang = useFilm((s) => s.lang)
  const which = (new URLSearchParams(location.search).get('terminal') ?? 'cabine') as keyof typeof WHO
  const t = WHO[which] ?? WHO.cabine
  return (
    <div className="gl1-page">
      <header className="gl1-bar">
        <span className="gl1-led" aria-hidden />
        GL-1 · {t[lang]}
      </header>
      <Terminal user={t.user} label={t[lang]} />
    </div>
  )
}
