import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { CONTACT, mailto, whatsapp } from '../content/contact'
import { useFilm } from '../film/store'
import { useT } from '../i18n'

/** Whether the phone has been answered. Any scene (or the player) can open it. */
export const useContact = create<{ open: boolean; set(open: boolean): void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}))

/** The call itself: every way to reach Gabriel, plus a two-field message. */
export function ContactPanel() {
  const t = useT()
  const lang = useFilm((s) => s.lang)
  const open = useContact((s) => s.open)
  const close = () => useContact.getState().set(false)
  const [copied, setCopied] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const first = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT.email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked: the address is selectable anyway */
    }
  }

  return (
    <div className="contact" role="dialog" aria-modal="true" aria-labelledby="contact-title" onClick={close}>
      <div className="contact-card" onClick={(e) => e.stopPropagation()}>
        <p className="contact-status">
          <span className="dot" /> {CONTACT.status[lang]}
        </p>
        <h2 id="contact-title">{t.contact.heading}</h2>

        <ul className="contact-ways">
          <li>
            <span className="label">E-mail</span>
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
            <button onClick={copy}>{copied ? t.contact.copied : t.contact.copy}</button>
          </li>
          <li>
            <span className="label">WhatsApp</span>
            <a href={`https://wa.me/${CONTACT.whatsapp}`} target="_blank" rel="noreferrer">
              {CONTACT.whatsappLabel}
            </a>
          </li>
          <li>
            <span className="label">GitHub</span>
            <a href={CONTACT.github} target="_blank" rel="noreferrer">
              Tech-GabrielLima ↗
            </a>
          </li>
        </ul>

        <form className="contact-form" onSubmit={(e) => e.preventDefault()}>
          <input ref={first} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.contact.name} aria-label={t.contact.name} />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.contact.message} aria-label={t.contact.message} rows={3} />
          <div className="contact-send">
            <a className="primary" href={mailto(name, message, lang)}>
              {t.contact.sendMail}
            </a>
            <a href={whatsapp(name, message, lang)} target="_blank" rel="noreferrer">
              {t.contact.sendWhats}
            </a>
          </div>
        </form>

        <button className="contact-close" onClick={close}>
          ☎ {t.contact.close} <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
