import './style.css'

type Note = { name: string; frequency: number; black?: boolean }

const notes: Note[] = [
  { name: 'C', frequency: 261.63 }, { name: 'C♯', frequency: 277.18, black: true },
  { name: 'D', frequency: 293.66 }, { name: 'D♯', frequency: 311.13, black: true },
  { name: 'E', frequency: 329.63 }, { name: 'F', frequency: 349.23 },
  { name: 'F♯', frequency: 369.99, black: true }, { name: 'G', frequency: 392.00 },
  { name: 'G♯', frequency: 415.30, black: true }, { name: 'A', frequency: 440.00 },
  { name: 'A♯', frequency: 466.16, black: true }, { name: 'B', frequency: 493.88 },
]

let audioContext: AudioContext | undefined
let currentNote: Note = notes[0]
let currentNotes: Note[] = [notes[0]]
let selectedAnswers: Note[] = []
let wrongFlash = false
let lastNote: Note | undefined
let selectedMode = localStorage.getItem('eartrain-mode') === 'All notes' ? 'All notes' : 'Natural notes'
let playMode = false
let noteCount = Number(localStorage.getItem('eartrain-note-count') ?? '1')
let themeMode = localStorage.getItem('eartrain-theme') ?? 'system'
let keyLevel = Number(localStorage.getItem('eartrain-key-level') ?? '1')
let keyboardStart = Number(localStorage.getItem('eartrain-key-start') ?? '0')
let playbackToken = 0
let playbackTimers: number[] = []
const activeOscillators = new Set<OscillatorNode>()

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="eartrain home"><span class="brand-mark">e</span><span>eartrain</span></a>
      <div class="key-range" aria-label="Keyboard range"><button id="remove-keys" aria-label="Remove keys">−</button><span id="key-level">1</span><button id="add-keys" aria-label="Add keys">+</button></div>
      <label class="mode-picker">MODE
        <select id="mode-select" aria-label="Choose training mode">
          <option value="Natural notes">Natural notes</option>
          <option value="All notes">All notes</option>
        </select>
      </label>
      <label class="mode-picker">NOTES
        <select id="note-count" aria-label="Choose number of notes">
          <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option>
        </select>
      </label>
      <label class="mode-picker">THEME
        <select id="theme-select" aria-label="Choose theme">
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
    </header>

    <section class="trainer-card" aria-label="Ear training exercise">
      <div class="listen-area">
        <label class="switch-control" title="Play freely on the keyboard">
          <span>Play mode</span>
          <input id="play-mode" type="checkbox" aria-label="Play mode" />
          <i></i>
        </label>
        <div class="note-orbs" id="note-orbs" aria-label="Expected notes"></div>
        <span class="listen-label" id="listen-label">Tap to play the note</span>
      </div>
      <div class="answer-area">
        <div class="keyboard" id="keyboard" role="group" aria-label="Piano keyboard"></div>
        <div class="slider-row">
          <input class="keyboard-slider" id="keyboard-slider" type="range" min="0" max="100" value="0" aria-label="Slide keyboard left and right" />
          <label class="slider-lock" title="Lock keyboard range"><input id="slider-lock" type="checkbox" /><span>🔓</span></label>
        </div>
      </div>
      <div class="feedback" id="feedback" aria-live="polite"></div>
    </section>

  </main>
`

const keyboard = document.querySelector<HTMLDivElement>('#keyboard')!
const natural = notes.filter((note) => !note.black)
const keyCounts = [7, 10, 12]
const fullPiano = Array.from({ length: 52 }, (_, index) => {
  const base = natural[index % natural.length]
  return { ...base, frequency: base.frequency * Math.pow(2, Math.floor(index / natural.length) - 2), pianoIndex: index }
})
function getVisibleNotes() {
  const count = keyCounts[keyLevel - 1]
  const maxStart = fullPiano.length - count
  keyboardStart = Math.min(Math.max(0, keyboardStart), maxStart)
  return fullPiano.slice(keyboardStart, keyboardStart + count)
}
function renderKeyboard() {
  keyboard.innerHTML = ''
  const count = keyCounts[keyLevel - 1]
  const whiteNotes = getVisibleNotes()
  whiteNotes.forEach((note) => {
  const key = document.createElement('button')
  key.className = 'key white-key'
  key.dataset.note = note.name
  key.innerHTML = `<span>${note.name}</span>`
  key.setAttribute('aria-label', `Play ${note.name}`)
  key.addEventListener('click', () => answer(note))
  keyboard.append(key)
  })

  const blackPattern = [
    { after: 0, note: notes[1] }, { after: 1, note: notes[3] },
    { after: 3, note: notes[6] }, { after: 4, note: notes[8] }, { after: 5, note: notes[10] },
  ]
  const blackNotes = Array.from({ length: count - 1 }, (_, index) => {
    const globalIndex = keyboardStart + index
    const after = globalIndex % 7
    const match = blackPattern.find((item) => item.after === after)
    return match ? { note: { ...match.note, frequency: match.note.frequency * Math.pow(2, Math.floor(globalIndex / 7) - 2) }, position: index } : undefined
  }).filter((item): item is { note: Note; position: number } => item !== undefined)
  blackNotes.forEach(({ note, position }, index) => {
  const key = document.createElement('button')
    key.className = 'key black-key'
    key.style.left = `calc(${((position + 1) / count) * 100}% - ${Math.min(4, 35 / count)}%)`
    key.style.width = `${Math.min(8, 70 / count)}%`
  key.dataset.note = note.name
  key.textContent = note.name
  key.setAttribute('aria-label', `Play ${note.name}`)
  key.addEventListener('click', () => answer(note))
  keyboard.append(key)
  })
  document.querySelector('#key-level')!.textContent = String(keyLevel)
  keyboard.style.width = '100%'
  keyboard.style.transform = 'translateX(0)'
  const slider = document.querySelector<HTMLInputElement>('#keyboard-slider')!
  slider.max = String(fullPiano.length - count)
  slider.step = '1'
  slider.value = String(keyboardStart)
}
renderKeyboard()

function renderNoteOrbs() {
  const orbs = document.querySelector<HTMLDivElement>('#note-orbs')!
  orbs.dataset.count = String(currentNotes.length)
  orbs.innerHTML = currentNotes.map((note, index) => `<div class="sound-orb ${wrongFlash ? 'incorrect' : selectedAnswers[index]?.name === note.name ? 'answered' : ''}"><span class="sound-icon">${selectedAnswers[index]?.name === note.name ? note.name : '♪'}</span></div>`).join('')
  const gap = 14
  const available = orbs.parentElement?.clientWidth ?? 470
  const size = Math.min(94, (available - gap * Math.max(0, currentNotes.length - 1)) / Math.max(1, currentNotes.length))
  orbs.style.setProperty('--orb-size', `${size}px`)
  orbs.querySelectorAll<HTMLDivElement>('.sound-orb').forEach((orb, index) => {
    orb.addEventListener('click', (event) => {
      event.stopPropagation()
      stopPlayback()
      playFrequency(currentNotes[index], index)
    })
  })
}

function playFrequency(note: Note, orbIndex = 0) {
  audioContext ??= new AudioContext()
  void audioContext.resume()
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = note.frequency
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.38, audioContext.currentTime + 0.025)
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 1.15)
  oscillator.connect(gain).connect(audioContext.destination)
  activeOscillators.add(oscillator)
  oscillator.addEventListener('ended', () => activeOscillators.delete(oscillator), { once: true })
  oscillator.start()
  oscillator.stop(audioContext.currentTime + 1.2)
  const orb = document.querySelectorAll('.sound-orb')[orbIndex]
  orb?.classList.add('playing')
  window.setTimeout(() => orb?.classList.remove('playing'), 500)
}

function stopPlayback() {
  playbackToken++
  playbackTimers.forEach((timer) => window.clearTimeout(timer))
  playbackTimers = []
  activeOscillators.forEach((oscillator) => {
    try { oscillator.stop() } catch { /* already stopped */ }
  })
  activeOscillators.clear()
}

function playSequence(sequence: Note[]) {
  stopPlayback()
  const token = playbackToken
  sequence.forEach((note, index) => {
    const timer = window.setTimeout(() => {
      if (token === playbackToken) playFrequency(note, index)
    }, index * 650)
    playbackTimers.push(timer)
  })
}

function chooseNote() {
  const whiteNotes = getVisibleNotes()
  const blackPattern = [
    { after: 0, note: notes[1] }, { after: 1, note: notes[3] },
    { after: 3, note: notes[6] }, { after: 4, note: notes[8] }, { after: 5, note: notes[10] },
  ]
  const visibleBlackNotes = Array.from({ length: keyCounts[keyLevel - 1] - 1 }, (_, index) => {
    const globalIndex = keyboardStart + index
    const match = blackPattern.find((item) => item.after === globalIndex % 7)
    return match ? { ...match.note, frequency: match.note.frequency * Math.pow(2, Math.floor(globalIndex / 7) - 2) } : undefined
  }).filter((note): note is Note => note !== undefined)
  const available = selectedMode === 'Natural notes' ? whiteNotes : [...whiteNotes, ...visibleBlackNotes]
  if (noteCount > 1) {
    const shuffled = [...available].sort(() => Math.random() - 0.5)
    currentNotes = shuffled.slice(0, Math.min(noteCount, shuffled.length))
    currentNote = currentNotes[0]
    selectedAnswers = []
    renderNoteOrbs()
    return
  }
  const choices = available.filter((note) => note !== lastNote)
  lastNote = currentNote
  currentNote = choices[Math.floor(Math.random() * choices.length)]
  currentNotes = [currentNote]
  selectedAnswers = []
  renderNoteOrbs()
}

function playRound() {
  chooseNote()
  playSequence(currentNotes)
  document.querySelector('#feedback')!.textContent = ''
}

function answer(note: Note) {
  const orbIndex = currentNotes.findIndex((expected) => expected.name === note.name)
  playFrequency(note, orbIndex >= 0 ? orbIndex : 0)
  if (playMode) return
  if (noteCount > 1) {
    const nextIndex = selectedAnswers.filter(Boolean).length
    if (currentNotes[nextIndex]?.name === note.name) {
      selectedAnswers[nextIndex] = note
      renderNoteOrbs()
      const answeredCount = selectedAnswers.filter(Boolean).length
      if (answeredCount < noteCount) {
        document.querySelector('#feedback')!.textContent = `Choose ${noteCount - answeredCount} more note${noteCount - answeredCount === 1 ? '' : 's'}.`
        return
      }
      const feedback = document.querySelector('#feedback')!
      feedback.textContent = 'That’s it. Nice listening.'
      feedback.className = 'feedback correct'
      if (!playMode) window.setTimeout(playRound, 1200)
    } else {
      showWrongAnswer()
    }
    return
  }
  const feedback = document.querySelector('#feedback')!
  if (note.name === currentNote.name) {
    selectedAnswers = [note]
    renderNoteOrbs()
    feedback.textContent = 'That’s it. Nice listening.'
    feedback.className = 'feedback correct'
    if (!playMode) window.setTimeout(playRound, 1200)
  } else {
    showWrongAnswer()
  }
}

function showWrongAnswer() {
  const feedback = document.querySelector('#feedback')!
  feedback.textContent = 'Not quite — start again.'
  feedback.className = 'feedback try-again'
  wrongFlash = true
  renderNoteOrbs()
  window.setTimeout(() => { wrongFlash = false; selectedAnswers = []; renderNoteOrbs() }, 450)
}

document.querySelector('.listen-area')!.addEventListener('click', () => {
  if (!playMode) playSequence(currentNotes)
})
document.querySelector('#play-mode')!.addEventListener('change', (event) => {
  playMode = (event.target as HTMLInputElement).checked
  if (playMode) {
    currentNotes = [currentNote]
    selectedAnswers = []
    renderNoteOrbs()
  } else {
    lastNote = undefined
    chooseNote()
  }
  document.querySelector('#listen-label')!.textContent = playMode ? '' : 'Tap to play the note'
})
document.querySelector('.switch-control')!.addEventListener('click', (event) => event.stopPropagation())
document.querySelector<HTMLInputElement>('#keyboard-slider')!.addEventListener('input', (event) => {
  const slider = event.target as HTMLInputElement
  keyboardStart = Number(slider.value)
  localStorage.setItem('eartrain-key-start', String(keyboardStart))
  renderKeyboard()
  lastNote = undefined
  chooseNote()
  document.querySelector('#feedback')!.textContent = 'Range updated. Tap the note button when ready.'
  document.querySelector('#feedback')!.className = 'feedback'
})
document.querySelector<HTMLInputElement>('#slider-lock')!.addEventListener('change', (event) => {
  const locked = (event.target as HTMLInputElement).checked
  const slider = document.querySelector<HTMLInputElement>('#keyboard-slider')!
  slider.disabled = locked
  document.querySelector('.slider-lock span')!.textContent = locked ? '🔒' : '🔓'
})
document.querySelector<HTMLSelectElement>('#theme-select')!.addEventListener('change', (event) => {
  themeMode = (event.target as HTMLSelectElement).value
  localStorage.setItem('eartrain-theme', themeMode)
  document.documentElement.dataset.theme = themeMode === 'system' ? '' : themeMode
})
document.documentElement.dataset.theme = themeMode === 'system' ? '' : themeMode
document.querySelector<HTMLSelectElement>('#theme-select')!.value = themeMode
document.querySelector<HTMLSelectElement>('#mode-select')!.addEventListener('change', (event) => {
  selectedMode = (event.target as HTMLSelectElement).value
  localStorage.setItem('eartrain-mode', selectedMode)
  lastNote = undefined
  chooseNote()
  selectedAnswers = []
  document.querySelector('#feedback')!.textContent = `${selectedMode} mode selected.`
  document.querySelector('#feedback')!.className = 'feedback'
})
document.querySelector<HTMLSelectElement>('#mode-select')!.value = selectedMode
document.querySelector<HTMLSelectElement>('#note-count')!.value = String(noteCount)
document.querySelector<HTMLSelectElement>('#note-count')!.addEventListener('change', (event) => {
  noteCount = Number((event.target as HTMLSelectElement).value)
  localStorage.setItem('eartrain-note-count', String(noteCount))
  lastNote = undefined
  chooseNote()
  selectedAnswers = []
  document.querySelector('#feedback')!.textContent = 'Note count updated. Tap the note button when ready.'
  document.querySelector('#feedback')!.className = 'feedback'
})
document.querySelector('#remove-keys')!.addEventListener('click', () => { keyLevel = Math.max(1, keyLevel - 1); localStorage.setItem('eartrain-key-level', String(keyLevel)); renderKeyboard() })
document.querySelector('#add-keys')!.addEventListener('click', () => { keyLevel = Math.min(3, keyLevel + 1); localStorage.setItem('eartrain-key-level', String(keyLevel)); renderKeyboard() })
chooseNote()
