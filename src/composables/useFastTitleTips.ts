import { onMounted, onUnmounted, reactive, ref } from 'vue'

const SKIP_MS = 400
const SHOW_MS = 140

/**
 * Replace slow OS `title` tooltips with a short-delay overlay.
 * After one tip, the next appears immediately while you skim icons.
 */
export function useFastTitleTips() {
  const text = ref('')
  const visible = ref(false)
  const x = ref(0)
  const y = ref(0)
  const side = ref<'right' | 'bottom'>('bottom')

  let showTimer: number | undefined
  let lastHiddenAt = 0
  let active: HTMLElement | null = null
  let titleObserver: MutationObserver | undefined

  function watchTitle(el: HTMLElement) {
    titleObserver?.disconnect()
    titleObserver = new MutationObserver(() => {
      if (el !== active || !el.hasAttribute('title')) return
      const label = el.getAttribute('title')
      if (!label) return
      el.setAttribute('data-fast-tip', label)
      el.removeAttribute('title')
      if (visible.value) text.value = label
    })
    titleObserver.observe(el, { attributes: true, attributeFilter: ['title'] })
  }

  function place(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    const preferRight = r.left < 96 && r.width < 48
    if (preferRight) {
      side.value = 'right'
      x.value = Math.min(window.innerWidth - 12, r.right + 8)
      y.value = r.top + r.height / 2
    } else {
      side.value = 'bottom'
      x.value = r.left + r.width / 2
      y.value = Math.min(window.innerHeight - 12, r.bottom + 8)
    }
  }

  function hide(record = true) {
    if (showTimer !== undefined) {
      window.clearTimeout(showTimer)
      showTimer = undefined
    }
    titleObserver?.disconnect()
    titleObserver = undefined
    if (visible.value && record) lastHiddenAt = Date.now()
    visible.value = false
    active = null
  }

  function onOver(e: Event) {
    const t = e.target
    if (!(t instanceof Element)) return
    if (t.closest('input, textarea, select, [data-native-title]')) return
    const el = t.closest('[title], [data-fast-tip]') as HTMLElement | null
    if (!el) return
    const label = el.getAttribute('title') || el.getAttribute('data-fast-tip')
    if (!label) return
    if (el.hasAttribute('title')) {
      el.setAttribute('data-fast-tip', label)
      el.removeAttribute('title')
    }
    if (active === el) return
    hide(visible.value)
    active = el
    watchTitle(el)
    const delay = Date.now() - lastHiddenAt < SKIP_MS ? 0 : SHOW_MS
    showTimer = window.setTimeout(() => {
      if (active !== el) return
      place(el)
      text.value = label
      visible.value = true
    }, delay)
  }

  function onOut(e: MouseEvent) {
    const t = e.target
    if (!(t instanceof Element)) return
    const el = t.closest('[data-fast-tip]')
    if (!el || el !== active) return
    const next = e.relatedTarget
    if (next instanceof Node && el.contains(next)) return
    hide()
  }

  function onScroll() {
    hide(false)
  }

  function onPointerDown() {
    hide()
  }

  onMounted(() => {
    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('mouseout', onOut, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
  })

  onUnmounted(() => {
    hide(false)
    document.removeEventListener('mouseover', onOver, true)
    document.removeEventListener('mouseout', onOut, true)
    document.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('scroll', onScroll, true)
  })

  return reactive({ text, visible, x, y, side })
}
