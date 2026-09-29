import { useEffect } from 'react'
import { countTry, findFrame } from '../cinema/progress'
import { usherSays } from '../cinema/usher'
import { useFilm } from '../film/store'

// Site-wide keys of Part II (ROTEIRO §0.4.4): Ctrl+P and Konami.

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']

/** Frames 4 and 9: printing the page, and the code everybody tries. */
export function usePartIIKeys() {
  useEffect(() => {
    const onPrint = () => findFrame('print')
    let at = 0
    const onKey = (e: KeyboardEvent) => {
      // Not while typing into a terminal.
      if ((e.target as HTMLElement)?.closest?.('.gl1-term')) return
      at = e.key === KONAMI[at] || e.key.toLowerCase() === KONAMI[at] ? at + 1 : e.key === KONAMI[0] ? 1 : 0
      if (at === KONAMI.length) {
        at = 0
        const pt = useFilm.getState().lang === 'pt'
        usherSays(pt ? 'Sério?' : 'Seriously?', true)
        void countTry('konami').then((r) => {
          findFrame('konami')
          setTimeout(() => usherSays(pt ? `…você realmente tentou.${r ? ` Você e mais ${r.n - 1}.` : ''}` : `…you really tried.${r ? ` You and ${r.n - 1} others.` : ''}`, true), 2200)
        })
      }
    }
    addEventListener('beforeprint', onPrint)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('beforeprint', onPrint)
      removeEventListener('keydown', onKey)
    }
  }, [])
}

