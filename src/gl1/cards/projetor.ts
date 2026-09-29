import { findFrame } from '../../cinema/progress'
import { useFilm } from '../../film/store'
import type { CardCtx } from '../cards'
import { SCRIPT, armProjector, rerun, useProjector } from '../projector'

// projetor status | run: the booth's projector, as seen from its computer
// (the Projector Workshop, ROTEIRO §0.4.5, frame 17).

export async function projetor(c: CardCtx): Promise<number> {
  const [cmd = 'status'] = c.args
  const p = useProjector.getState()
  const L = (en: string, pt: string) => (c.pt ? pt : en)
  if (cmd === 'status') {
    if (!p.armed) armProjector()
    if (p.jammed) {
      c.out(`\x1b[31m${L('JAMMED', 'TRAVADO')}\x1b[0m ${L('at frame', 'no quadro')} ${p.at} (${L('reel time', 'tempo do filme')} ${((p.at ?? 0) / 24).toFixed(1)} s)\n\n${p.error}\n`)
      c.out(`\x1b[90m${L(`the script is ${SCRIPT}: fix it (vi, or python), then run: projetor run`, `o script é ${SCRIPT}: conserte (vi, ou python) e rode: projetor run`)}\x1b[0m\n`)
      return 1
    }
    c.out(`${L('running', 'rodando')} · ${p.fps} fps · ${L('light', 'luz')} ${p.tint.map((x) => x.toFixed(2)).join('/')} · ${L('grain', 'grão')} ${p.grain}\n`)
    c.out(`\x1b[90m${L(`the film obeys ${SCRIPT}; change FPS, TINT or GRAIN there and watch the film`, `o filme obedece ${SCRIPT}; mude FPS, TINT ou GRAIN lá e veja o filme`)}\x1b[0m\n`)
    return 0
  }
  if (cmd === 'run') {
    c.m.saveDisk()
    const src = c.m.readText(SCRIPT)
    if (src === null) {
      c.out(`projetor: ${SCRIPT}: ${L('the script is gone', 'o script sumiu')}\n`)
      return 1
    }
    if (!p.armed) armProjector()
    const was = useProjector.getState().jammed
    const r = await rerun(src)
    if (!r.ok) {
      c.out(`\x1b[31m${L('still jammed at frame', 'ainda travado no quadro')} ${r.at}\x1b[0m\n${r.error}\n`)
      return 1
    }
    c.out(`\x1b[32m${L('the projector runs.', 'o projetor voltou a rodar.')}\x1b[0m ${L('Stand up: the film carries on.', 'Levante: o filme continua.')}\n`)
    if (was) {
      findFrame('projector')
      useFilm.setState({ playing: true })
    }
    return 0
  }
  c.out(L('usage: projetor status | run\n', 'uso: projetor status | run\n'))
  return 2
}
