/**
 * useDocOutline — estrae la struttura (heading h1/h2/h3) di un documento TipTap
 * per la navigazione rapida (pannello indice). Reattivo all'editing (debounce)
 * e tiene traccia della sezione corrente (scroll-spy) per evidenziarla.
 *
 * NON tocca lo schema: legge `editor.state.doc` e basta. Lo scroll usa
 * `editor.view.domAtPos` → niente id sugli heading (eviterebbe un attr di schema).
 */
import { ref, watch, onUnmounted, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'

export interface OutlineItem {
  level: number
  text: string
  pos: number
}

export function useDocOutline(
  editorRef: Ref<Editor | undefined>,
  scrollerRef?: Ref<HTMLElement | null>,
) {
  const headings = ref<OutlineItem[]>([])
  const activeIndex = ref(-1)
  let timer: ReturnType<typeof setTimeout> | null = null
  let scroller: HTMLElement | null = null
  let rafPending = false

  function recompute(editor: Editor) {
    const list: OutlineItem[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        list.push({
          level: Number(node.attrs.level ?? 1),
          text: node.textContent.trim() || 'Senza titolo',
          pos,
        })
      }
    })
    headings.value = list
    recomputeActive()
  }

  /** Sezione corrente = l'ultimo heading il cui top è sopra la soglia. */
  function recomputeActive() {
    const editor = editorRef.value
    if (!editor || !editor.view) return
    // Soglia appena sotto il bordo superiore dell'area documento (o 120px).
    const top0 = scroller ? scroller.getBoundingClientRect().top : 0
    const threshold = top0 + 90
    let active = -1
    headings.value.forEach((h, i) => {
      try {
        const top = editor.view.coordsAtPos(h.pos + 1).top
        if (top <= threshold) active = i
      } catch { /* pos non risolvibile */ }
    })
    // Sopra il primo heading → evidenzia comunque il primo.
    activeIndex.value = active === -1 && headings.value.length ? 0 : active
  }

  function onScroll() {
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      recomputeActive()
    })
  }

  function detachScroller() {
    scroller?.removeEventListener('scroll', onScroll)
    scroller = null
  }
  function attachScroller(el: HTMLElement | null) {
    detachScroller()
    scroller = el
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    recomputeActive()
  }

  function schedule(editor: Editor) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => recompute(editor), 150)
  }

  const stopEditor = watch(
    editorRef,
    (editor, _old, onCleanup) => {
      if (!editor) return
      recompute(editor)
      const handler = () => schedule(editor)
      editor.on('update', handler)
      onCleanup(() => editor.off('update', handler))
    },
    { immediate: true },
  )

  // Aggancia lo scroll-spy quando il contenitore scrollabile è montato.
  const stopScroller = scrollerRef
    ? watch(scrollerRef, (el) => attachScroller(el), { immediate: true })
    : null

  window.addEventListener('resize', recomputeActive)

  /** Scrolla alla sezione: risolve il DOM dell'heading e lo porta in vista. */
  function scrollToHeading(pos: number) {
    const editor = editorRef.value
    if (!editor) return
    try {
      const at = editor.view.domAtPos(pos + 1)
      const node = at?.node as Node | undefined
      const el = (node && node.nodeType === 3 ? node.parentElement : node) as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      /* posizione non più valida (doc cambiato): ignora */
    }
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
    detachScroller()
    window.removeEventListener('resize', recomputeActive)
    stopEditor()
    stopScroller?.()
  })

  return { headings, activeIndex, scrollToHeading }
}
