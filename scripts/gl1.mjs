// Builds the cinema's computer for the site (ROTEIRO §0.4): the GL-1 as
// WebAssembly, and GL-OS with the portfolio inside it, into public/gl1/.
//
//   npm run gl1        (needs Rust with the wasm32-unknown-unknown target)
//
// The portfolio's text comes from src/content, so the files you find inside
// GL-OS (/projects, the résumé, portfolio.gl) always say what the site says.
// The outputs are committed: the site's build doesn't need Rust.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gl1 = path.join(root, 'gl1')
const gen = path.join(gl1, 'gen')
const out = path.join(root, 'public', 'gl1')

const { PROJECTS } = await import(path.join(root, 'src/content/projects.ts'))
const { ABOUT, BIO, MILESTONES } = await import(path.join(root, 'src/content/about.ts'))
const { CONTACT } = await import(path.join(root, 'src/content/contact.ts'))
const { CONSTELLATIONS } = await import(path.join(root, 'src/content/skills.ts'))

fs.rmSync(gen, { recursive: true, force: true })
const put = (p, text) => {
  const f = path.join(gen, p)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, text)
}

const Y = '\x1b[33m'
const C = '\x1b[36m'
const D = '\x1b[90m'
const O = '\x1b[0m'

// /projects/<id>/README.en and README.pt
for (const p of PROJECTS) {
  for (const lang of ['en', 'pt']) {
    put(
      `projects/${p.id}/README.${lang}`,
      [
        `${Y}${p.title}${O}  ${D}${p.stack}${O}`,
        p.role[lang],
        '',
        p.hook[lang],
        '',
        p.plain[lang],
        '',
        `${D}${lang === 'pt' ? 'Como funciona' : 'How it works'}:${O} ${p.blurb[lang]}`,
        p.url ? `\n${C}${p.url}${O}` : '',
        '',
      ].join('\n'),
    )
  }
}

// The résumé, in both languages, in the visitor's home.
const cv = (lang) =>
  [
    `${Y}Gabriel Lima${O} · ${ABOUT.hook[lang]}`,
    '',
    ABOUT.body[lang],
    '',
    `${Y}${lang === 'pt' ? 'Trajetória' : 'Experience'}${O}`,
    ...MILESTONES.filter((m) => !m.future).map((m) => `  ${D}${m.year.padEnd(8)}${O}${m.title[lang]}: ${m.line[lang]}`),
    '',
    `${Y}Stack${O}`,
    ...CONSTELLATIONS.map((c) => `  ${c.name[lang].padEnd(14)}${c.stars.join(', ')}`),
    '',
    `${Y}${lang === 'pt' ? 'Contato' : 'Contact'}${O}`,
    `  ${CONTACT.email} · WhatsApp ${CONTACT.whatsappLabel} · ${CONTACT.github}`,
    `  ${CONTACT.status[lang]}`,
    '',
  ].join('\n')
put('home/visitante/curriculo.en', cv('en'))
put('home/visitante/curriculo.pt', cv('pt'))

// /projects/portfolio.gl: a GL-1 program that tells the whole thing, line by line.
const summary = (lang) => [
  '',
  `${Y}  S E S S Ã O   N O T U R N A${O}`,
  `${D}  ${lang === 'pt' ? 'um filme de' : 'a film by'} Gabriel Lima${O}`,
  '',
  ...BIO[lang].map((l) => `  ${l}`),
  '',
  `${Y}  ${lang === 'pt' ? 'Em cartaz' : 'Now showing'}${O}`,
  ...PROJECTS.filter((p) => p.id !== 'obras').map((p) => `  ${C}${p.id.padEnd(8)}${O}${p.hook[lang].length > 64 ? p.hook[lang].slice(0, 63) + '…' : p.hook[lang]}`),
  '',
  `${D}  ${lang === 'pt' ? 'cat /projects/<nome>/README.pt para cada um' : 'cat /projects/<name>/README.en for each one'}${O}`,
  `${D}  ${lang === 'pt' ? 'cat ~/curriculo.pt para o currículo' : 'cat ~/curriculo.en for the résumé'}${O}`,
  `  ${CONTACT.email}`,
  '',
]
// The Moon's silence (ROTEIRO §0.4.5, frame 34): an 8-bit WAV that sounds like
// almost nothing, whose spectrogram spells the projectionist's password (the
// one Act I's box office asks for). One sine per lit pixel of a 5x7 font.
const { PROJECIONISTA_PASSWORD } = await import(path.join(root, 'src/gl1/secrets.ts'))
const FONT = {
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  q: ['00000', '00000', '01111', '10001', '01111', '00001', '00001'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  d: ['00001', '00001', '01101', '10011', '10001', '10001', '01111'],
  r: ['00000', '00000', '10110', '11001', '10000', '10000', '10000'],
  o: ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
  s: ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
}
function silence(text) {
  const rate = 8000
  const col = 0.07 // seconds per pixel column
  const cols = []
  for (const ch of text) {
    const g = FONT[ch]
    if (!g) throw new Error(`no glyph for ${ch}`)
    for (let x = 0; x < 5; x++) cols.push(g.map((row) => row[x] === '1'))
    cols.push(Array(7).fill(false))
  }
  const per = Math.round(col * rate)
  const samples = new Uint8Array(cols.length * per + rate / 2)
  // Row 0 (the top of the letters) is the highest frequency.
  const freq = (row) => 3400 - row * 360
  let phase = new Array(7).fill(0)
  for (let c = 0; c < cols.length; c++) {
    for (let i = 0; i < per; i++) {
      const env = Math.sin((Math.PI * i) / per) ** 0.5
      let v = 0
      for (let r = 0; r < 7; r++) {
        phase[r] += (2 * Math.PI * freq(r)) / rate
        if (cols[c][r]) v += Math.sin(phase[r])
      }
      samples[c * per + i] = 128 + Math.round(v * env * 14)
    }
  }
  samples.fill(128, cols.length * per)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + samples.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate, 28)
  h.writeUInt16LE(1, 32)
  h.writeUInt16LE(8, 34)
  h.write('data', 36)
  h.writeUInt32LE(samples.length, 40)
  return Buffer.concat([h, Buffer.from(samples)])
}
const wav = silence(PROJECIONISTA_PASSWORD)
put('cinema/lua/silencio.wav', wav)
fs.mkdirSync(path.join(root, 'public/audio'), { recursive: true })
fs.writeFileSync(path.join(root, 'public/audio/moon-silence.wav'), wav)

// `curl` on the site's domain (frame 11): the portfolio in ANSI, for terminals.
// vercel.json rewrites / to this file when the User-Agent is curl or wget.
const curlText = [
  '',
  `${Y}  ▄▄▄  ▄     Gabriel Lima${O}`,
  `${Y} █     █     ${O}${ABOUT.hook.en}`,
  `${Y} █  ▀█ █     ${O}${D}${ABOUT.hook.pt}${O}`,
  `${Y}  ▀▀▀  ▀▀▀▀${O}`,
  '',
  ...ABOUT.body.en.match(/.{1,76}(\s|$)/g).map((l) => `  ${l.trim()}`),
  '',
  `${Y}  Projects${O}`,
  ...PROJECTS.filter((p) => p.url).map((p) => `  ${C}${p.id.padEnd(8)}${O}${p.hook.en.slice(0, 64)}${p.hook.en.length > 64 ? '…' : ''}\n  ${D}          ${p.url}${O}`),
  '',
  `${Y}  Contact${O}  ${CONTACT.email} · WhatsApp ${CONTACT.whatsappLabel} · ${CONTACT.github}`,
  '',
  `${D}  You came in through the terminal, so here's the other door: the site has a computer`,
  `  of its own, and its shell answers the same command. Open the site, sit at the`,
  `  projectionist's computer (the booth, chapter 01) and run: curl ${'$'}{location}${O}`,
  `${D}  Você entrou pelo terminal; o site tem um computador próprio, e o shell dele responde ao`,
  `  mesmo comando. Sente no computador da cabine e rode curl no domínio.${O}`,
  '',
].join('\n')
fs.writeFileSync(path.join(root, 'public/curl.txt'), curlText.replace('${location}', 'gabriel-lima-eight.vercel.app'))

const asmString = (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\x1b/g, '\\e') + '\\n"'
const lines = (lang) => summary(lang).map((l) => `        .db ${asmString(l)}`).join('\n')
const portfolio = `; portfolio.gl: generated by scripts/gl1.mjs from src/content. Don't edit.
.include "inc/gl1.inc"
        .relocatable
STACK = 128
start:  LDW X, #t_en
        CALL is_pt
        JZ .go
        LDW X, #t_pt
.go:    STW [p], X
.line:  LDW X, [p]
        MOVW Y, X
.find:  LD A, [Y]
        TST A
        JZ .end
        INCW Y
        CMP A, #10
        JNZ .find
        STW [p], Y
        SUBW Y, X
        MOV B, #1
        SYS SYS_WRITE
        LDW X, #45
        SYS SYS_SLEEP
        JMP .line
.end:   MOV B, #0
        SYS SYS_EXIT
p:      .dw 0
t_en:
${lines('en')}
        .db 0
t_pt:
${lines('pt')}
        .db 0
.include "lib/libgl.s"
`
fs.mkdirSync(path.join(gl1, 'target'), { recursive: true })
const src = path.join(gl1, 'target', 'portfolio.s')
fs.writeFileSync(src, portfolio)

const cargo = (...args) => execFileSync('cargo', args, { cwd: gl1, stdio: 'inherit' })
cargo('build', '--release', '--lib', '--target', 'wasm32-unknown-unknown')
cargo('run', '-q', '--release', '--', 'asm', src, '-I', 'os', '-o', path.join(gen, 'projects', 'portfolio.gl'))
fs.mkdirSync(out, { recursive: true })
cargo('run', '-q', '--release', '--', 'build', 'os', out, gen)
fs.copyFileSync(path.join(gl1, 'target/wasm32-unknown-unknown/release/gl1.wasm'), path.join(out, 'gl1.wasm'))
for (const f of fs.readdirSync(out)) console.log(`public/gl1/${f}`.padEnd(28), `${(fs.statSync(path.join(out, f)).size / 1024).toFixed(1)} KB`)
