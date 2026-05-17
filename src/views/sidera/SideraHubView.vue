<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const moduleColor = ref('#D4C498')
let cycleTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  const NE = '#2A3F52', NV = '#243648', NS = '#364F66', SIDERA = '#D4C498'

  const mods: any[] = [
    null,
    { id:'quasar',   name:'Quasar',   desc:'Analytics · KPI · Business Intelligence',
      color:'#98C0D0', vx:340, vy:68,
      vEl:'hv-quasar',   hlEl:'hv-hl-quasar',   hsEl:'hv-hs-quasar',
      edges:[{id:'hv-e-v1v2',ox:155,oy:400},{id:'hv-e-v3v1',ox:525,oy:400},{id:'hv-e-v1v4',ox:405,oy:252},{id:'hv-e-v1v5',ox:275,oy:252}]
    },
    { id:'nebula',   name:'Nebula',   desc:'HR · Anagrafiche · Documentale',
      color:'#C46030', vx:155, vy:400,
      vEl:'hv-nebula',   hlEl:'hv-hl-nebula',   hsEl:'hv-hs-nebula',
      edges:[{id:'hv-e-v1v2',ox:340,oy:68},{id:'hv-e-v2v3',ox:525,oy:400},{id:'hv-e-v2v5',ox:275,oy:252},{id:'hv-e-v2v6',ox:340,oy:364}]
    },
    { id:'cepheid',  name:'Cepheid',  desc:'Project Management · Workflow · Task',
      color:'#D4A020', vx:525, vy:400,
      vEl:'hv-cepheid',  hlEl:'hv-hl-cepheid',  hsEl:'hv-hs-cepheid',
      edges:[{id:'hv-e-v2v3',ox:155,oy:400},{id:'hv-e-v3v1',ox:340,oy:68},{id:'hv-e-v3v4',ox:405,oy:252},{id:'hv-e-v3v6',ox:340,oy:364}]
    },
    { id:'pulsar',   name:'Pulsar',   desc:'Chat · Comunicazione · Collaborazione',
      color:'#3AAF98', vx:405, vy:252,
      vEl:'hv-pulsar',   hlEl:'hv-hl-pulsar',   hsEl:'hv-hs-pulsar',
      edges:[{id:'hv-e-v5v4',ox:275,oy:252},{id:'hv-e-v4v6',ox:340,oy:364},{id:'hv-e-v1v4',ox:340,oy:68},{id:'hv-e-v3v4',ox:525,oy:400}]
    },
    { id:'nova',     name:'Nova',     desc:'Logistica · Supply Chain · Spedizioni',
      color:'#8FAB35', vx:275, vy:252,
      vEl:'hv-nova',     hlEl:'hv-hl-nova',     hsEl:'hv-hs-nova',
      edges:[{id:'hv-e-v5v4',ox:405,oy:252},{id:'hv-e-v6v5',ox:340,oy:364},{id:'hv-e-v1v5',ox:340,oy:68},{id:'hv-e-v2v5',ox:155,oy:400}]
    },
    { id:'magnetar', name:'Magnetar', desc:'CRM · Lead Generation · Pipeline Commerciale',
      color:'#B06842', vx:340, vy:364,
      vEl:'hv-magnetar', hlEl:'hv-hl-magnetar', hsEl:'hv-hs-magnetar',
      edges:[{id:'hv-e-v4v6',ox:405,oy:252},{id:'hv-e-v6v5',ox:275,oy:252},{id:'hv-e-v2v6',ox:155,oy:400},{id:'hv-e-v3v6',ox:525,oy:400}]
    }
  ]

  const allEdges = ['hv-e-v1v2','hv-e-v2v3','hv-e-v3v1','hv-e-v5v4','hv-e-v4v6','hv-e-v6v5','hv-e-v1v4','hv-e-v1v5','hv-e-v2v5','hv-e-v2v6','hv-e-v3v4','hv-e-v3v6']
  const svgDefs = document.getElementById('hv-svg-defs')!
  let idx = 0

  function stopCycle() { if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null } }
  function startCycle() { stopCycle(); cycleTimer = setInterval(cycle, 4800) }

  function h2r(h: string) { return { r: parseInt(h.slice(1,3),16), g: parseInt(h.slice(3,5),16), b: parseInt(h.slice(5,7),16) } }

  function setSpheres(c: string) {
    const { r, g, b } = h2r(c)
    ;['hv-s1','hv-s2','hv-s3','hv-s4'].forEach((id, i) => {
      const el = document.getElementById(id)
      if (!el) return
      const vals = [
        `rgba(${r},${g},${b},.52)`,
        `rgba(${Math.round(r*.5)},${Math.round(g*.5)},${Math.round(b*.65)},.58)`,
        `rgba(${Math.round(r*.32)},${Math.round(g*.4)},${Math.round(b*.72)},.48)`,
        `rgba(${Math.round(r*.82)},${Math.round(g*.72)},${Math.round(b*.48)},.44)`,
      ]
      el.style.background = vals[i]
    })
  }

  function resetLogo() {
    allEdges.forEach(id => document.getElementById(id)?.setAttribute('stroke', NE))
    const eg = document.getElementById('hv-edge-glow'); if (eg) eg.style.opacity = '0'
    const es = document.getElementById('hv-edge-sweep'); if (es) es.style.opacity = '0'
    mods.filter(Boolean).forEach(m => {
      const v = document.getElementById(m.vEl); if (v) { v.style.fill = NV; v.style.stroke = NS }
      const hl = document.getElementById(m.hlEl); if (hl) { hl.style.opacity = '0'; hl.style.fillOpacity = '0' }
      const hs = document.getElementById(m.hsEl); if (hs) { hs.style.opacity = '0'; hs.style.fillOpacity = '0' }
    })
  }

  function activateLogo(m: any) {
    const v = document.getElementById(m.vEl); if (v) { v.style.fill = m.color; v.style.stroke = m.color }
    const hl = document.getElementById(m.hlEl); if (hl) { hl.style.fill = m.color; hl.style.fillOpacity = '.11'; hl.style.opacity = '1' }
    const hs = document.getElementById(m.hsEl); if (hs) { hs.style.fill = m.color; hs.style.fillOpacity = '.28'; hs.style.opacity = '1' }
    m.edges.forEach((e: any, i: number) => {
      const gid = `hv-g${i}`
      let g = document.getElementById(gid)
      if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
        g.setAttribute('id', gid); g.setAttribute('gradientUnits', 'userSpaceOnUse')
        svgDefs.appendChild(g)
      }
      g.setAttribute('x1', String(m.vx)); g.setAttribute('y1', String(m.vy))
      g.setAttribute('x2', String(e.ox)); g.setAttribute('y2', String(e.oy))
      g.innerHTML = `<stop offset="0%" stop-color="${m.color}"/><stop offset="75%" stop-color="${m.color}"/><stop offset="100%" stop-color="${NE}"/>`
      document.getElementById(e.id)?.setAttribute('stroke', `url(#${gid})`)
    })
  }

  function revealName(el: HTMLElement, text: string) {
    el.innerHTML = ''
    ;[...text].forEach((ch, i) => {
      const s = document.createElement('span')
      s.textContent = ch === ' ' ? ' ' : ch
      s.style.cssText = `opacity:0;display:inline;transition:opacity .38s ease ${i*.065}s`
      el.appendChild(s)
    })
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.querySelectorAll('span').forEach(s => ((s as HTMLElement).style.opacity = '1'))
    }))
  }

  function cycle() {
    const m = mods[idx]
    idx = (idx + 1) % mods.length
    const disp = document.getElementById('hv-mod-display')!
    disp.classList.add('fading')
    setTimeout(() => {
      resetLogo()
      const sep = disp.querySelector('.hv-sep') as HTMLElement
      if (m === null) {
        setSpheres(SIDERA)
        moduleColor.value = SIDERA
        document.getElementById('hv-module-name')!.innerHTML = '&nbsp;'
        document.getElementById('hv-module-desc')!.innerHTML = '&nbsp;'
        allEdges.forEach(id => document.getElementById(id)?.setAttribute('stroke', SIDERA))
        const eg = document.getElementById('hv-edge-glow'); if (eg) eg.style.opacity = '0.45'
        const es = document.getElementById('hv-edge-sweep'); if (es) es.style.opacity = '1'
        if (sep) sep.style.opacity = '0'
        mods.filter(Boolean).forEach(mod => {
          const v = document.getElementById(mod.vEl); if (v) { v.style.fill = SIDERA; v.style.stroke = SIDERA }
          const hs = document.getElementById(mod.hsEl); if (hs) { hs.style.fill = SIDERA; hs.style.fillOpacity = '.18'; hs.style.opacity = '1' }
        })
      } else {
        activateLogo(m)
        setSpheres(m.color)
        moduleColor.value = m.color
        revealName(document.getElementById('hv-module-name')!, m.name.toUpperCase())
        document.getElementById('hv-module-desc')!.textContent = m.desc
        if (sep) sep.style.opacity = '1'
      }
      disp.classList.remove('fading')
    }, 430)
  }

  setTimeout(() => {
    document.querySelectorAll('.hv-sphere').forEach(s => s.classList.add('on'))
    cycle()
    startCycle()

    mods.filter(Boolean).forEach(m => {
      const hit = document.getElementById('hv-hit-' + m.id)
      if (!hit) return
      hit.addEventListener('mouseenter', () => {
        stopCycle()
        const disp = document.getElementById('hv-mod-display')!
        disp.classList.add('fading')
        setTimeout(() => {
          resetLogo()
          activateLogo(m)
          setSpheres(m.color)
          moduleColor.value = m.color
          revealName(document.getElementById('hv-module-name')!, m.name.toUpperCase())
          document.getElementById('hv-module-desc')!.textContent = m.desc
          const sep = disp.querySelector('.hv-sep') as HTMLElement
          if (sep) sep.style.opacity = '1'
          disp.classList.remove('fading')
        }, 180)
      })
      hit.addEventListener('mouseleave', () => {
        idx = (mods.indexOf(m) + 1) % mods.length
        startCycle()
      })
    })
  }, 300)
})

onUnmounted(() => {
  if (cycleTimer) clearInterval(cycleTimer)
})
</script>

<template>
  <div class="hub" :style="{ '--module-color': moduleColor }">
    <!-- Sfere -->
    <div class="hv-bg">
      <div class="hv-sphere s1" id="hv-s1"></div>
      <div class="hv-sphere s2" id="hv-s2"></div>
      <div class="hv-sphere s3" id="hv-s3"></div>
      <div class="hv-sphere s4" id="hv-s4"></div>
    </div>

    <!-- Contenuto centrato -->
    <div class="hv-content">
      <svg class="hv-svg" viewBox="0 0 680 480" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs id="hv-svg-defs">
          <filter id="hv-gf-sm" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="hv-gf-md" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="9" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="hv-gf-lg" x="-180%" y="-180%" width="460%" height="460%">
            <feGaussianBlur stdDeviation="18" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <linearGradient id="hv-sweep-grad" gradientUnits="userSpaceOnUse" x1="-90" y1="240" x2="90" y2="240">
            <stop offset="0%"   stop-color="#D4C498" stop-opacity="0"/>
            <stop offset="50%"  stop-color="#D4C498" stop-opacity="1"/>
            <stop offset="100%" stop-color="#D4C498" stop-opacity="0"/>
            <animateTransform attributeName="gradientTransform" type="translate" values="-450 0; 1130 0" dur="3.2s" repeatCount="indefinite"/>
          </linearGradient>
        </defs>

        <!-- outer edges -->
        <line id="hv-e-v1v2" x1="340" y1="68"  x2="155" y2="400" stroke-width="1.2" fill="none"/>
        <line id="hv-e-v2v3" x1="155" y1="400" x2="525" y2="400" stroke-width="1.2" fill="none"/>
        <line id="hv-e-v3v1" x1="525" y1="400" x2="340" y2="68"  stroke-width="1.2" fill="none"/>
        <!-- inner edges -->
        <line id="hv-e-v5v4" x1="275" y1="252" x2="405" y2="252" stroke-width="1.2" fill="none"/>
        <line id="hv-e-v4v6" x1="405" y1="252" x2="340" y2="364" stroke-width="1.2" fill="none"/>
        <line id="hv-e-v6v5" x1="340" y1="364" x2="275" y2="252" stroke-width="1.2" fill="none"/>
        <!-- cross edges -->
        <line id="hv-e-v1v4" x1="340" y1="68"  x2="405" y2="252" stroke-width="1.2" fill="none"/>
        <line id="hv-e-v1v5" x1="340" y1="68"  x2="275" y2="252" stroke-width="1.2" fill="none"/>
        <line id="hv-e-v2v5" x1="155" y1="400" x2="275" y2="252" stroke-width="1.2" fill="none"/>
        <line id="hv-e-v2v6" x1="155" y1="400" x2="340" y2="364" stroke-width="1.2" fill="none"/>
        <line id="hv-e-v3v4" x1="525" y1="400" x2="405" y2="252" stroke-width="1.2" fill="none"/>
        <line id="hv-e-v3v6" x1="525" y1="400" x2="340" y2="364" stroke-width="1.2" fill="none"/>

        <!-- edge glow -->
        <g id="hv-edge-glow" opacity="0" style="transition:opacity .9s ease">
          <line x1="340" y1="68"  x2="155" y2="400" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="155" y1="400" x2="525" y2="400" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="525" y1="400" x2="340" y2="68"  stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="275" y1="252" x2="405" y2="252" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="405" y1="252" x2="340" y2="364" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="340" y1="364" x2="275" y2="252" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="340" y1="68"  x2="405" y2="252" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="340" y1="68"  x2="275" y2="252" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="155" y1="400" x2="275" y2="252" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="155" y1="400" x2="340" y2="364" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="525" y1="400" x2="405" y2="252" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
          <line x1="525" y1="400" x2="340" y2="364" stroke="#D4C498" stroke-width="3.5" fill="none" :filter="'url(#hv-gf-sm)'"/>
        </g>
        <!-- sweep -->
        <g id="hv-edge-sweep" opacity="0" style="transition:opacity .9s ease">
          <line x1="340" y1="68"  x2="155" y2="400" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="155" y1="400" x2="525" y2="400" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="525" y1="400" x2="340" y2="68"  stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="275" y1="252" x2="405" y2="252" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="405" y1="252" x2="340" y2="364" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="340" y1="364" x2="275" y2="252" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="340" y1="68"  x2="405" y2="252" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="340" y1="68"  x2="275" y2="252" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="155" y1="400" x2="275" y2="252" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="155" y1="400" x2="340" y2="364" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="525" y1="400" x2="405" y2="252" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
          <line x1="525" y1="400" x2="340" y2="364" stroke="url(#hv-sweep-grad)" stroke-width="2" fill="none"/>
        </g>

        <!-- halos large -->
        <circle id="hv-hl-quasar"   cx="340" cy="68"  r="42" :filter="'url(#hv-gf-lg)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .6s,fill-opacity .6s,opacity .6s"/>
        <circle id="hv-hl-nebula"   cx="155" cy="400" r="42" :filter="'url(#hv-gf-lg)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .6s,fill-opacity .6s,opacity .6s"/>
        <circle id="hv-hl-cepheid"  cx="525" cy="400" r="42" :filter="'url(#hv-gf-lg)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .6s,fill-opacity .6s,opacity .6s"/>
        <circle id="hv-hl-pulsar"   cx="405" cy="252" r="34" :filter="'url(#hv-gf-lg)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .6s,fill-opacity .6s,opacity .6s"/>
        <circle id="hv-hl-nova"     cx="275" cy="252" r="34" :filter="'url(#hv-gf-lg)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .6s,fill-opacity .6s,opacity .6s"/>
        <circle id="hv-hl-magnetar" cx="340" cy="364" r="34" :filter="'url(#hv-gf-lg)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .6s,fill-opacity .6s,opacity .6s"/>
        <!-- halos small -->
        <circle id="hv-hs-quasar"   cx="340" cy="68"  r="24" :filter="'url(#hv-gf-md)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .5s,fill-opacity .5s,opacity .5s"/>
        <circle id="hv-hs-nebula"   cx="155" cy="400" r="24" :filter="'url(#hv-gf-md)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .5s,fill-opacity .5s,opacity .5s"/>
        <circle id="hv-hs-cepheid"  cx="525" cy="400" r="24" :filter="'url(#hv-gf-md)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .5s,fill-opacity .5s,opacity .5s"/>
        <circle id="hv-hs-pulsar"   cx="405" cy="252" r="19" :filter="'url(#hv-gf-md)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .5s,fill-opacity .5s,opacity .5s"/>
        <circle id="hv-hs-nova"     cx="275" cy="252" r="19" :filter="'url(#hv-gf-md)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .5s,fill-opacity .5s,opacity .5s"/>
        <circle id="hv-hs-magnetar" cx="340" cy="364" r="19" :filter="'url(#hv-gf-md)'" style="fill:#2A3F52;fill-opacity:0;opacity:0;transition:fill .5s,fill-opacity .5s,opacity .5s"/>
        <!-- vertices -->
        <circle id="hv-quasar"   cx="340" cy="68"  r="14" :filter="'url(#hv-gf-sm)'" style="fill:#243648;stroke:#364F66;stroke-width:.8;transition:fill .5s,stroke .5s"/>
        <circle id="hv-nebula"   cx="155" cy="400" r="14" :filter="'url(#hv-gf-sm)'" style="fill:#243648;stroke:#364F66;stroke-width:.8;transition:fill .5s,stroke .5s"/>
        <circle id="hv-cepheid"  cx="525" cy="400" r="14" :filter="'url(#hv-gf-sm)'" style="fill:#243648;stroke:#364F66;stroke-width:.8;transition:fill .5s,stroke .5s"/>
        <circle id="hv-pulsar"   cx="405" cy="252" r="12" :filter="'url(#hv-gf-sm)'" style="fill:#243648;stroke:#364F66;stroke-width:.8;transition:fill .5s,stroke .5s"/>
        <circle id="hv-nova"     cx="275" cy="252" r="12" :filter="'url(#hv-gf-sm)'" style="fill:#243648;stroke:#364F66;stroke-width:.8;transition:fill .5s,stroke .5s"/>
        <circle id="hv-magnetar" cx="340" cy="364" r="12" :filter="'url(#hv-gf-sm)'" style="fill:#243648;stroke:#364F66;stroke-width:.8;transition:fill .5s,stroke .5s"/>
        <!-- hit areas -->
        <circle id="hv-hit-quasar"   cx="340" cy="68"  r="28" fill="transparent" style="cursor:pointer"/>
        <circle id="hv-hit-nebula"   cx="155" cy="400" r="28" fill="transparent" style="cursor:pointer"/>
        <circle id="hv-hit-cepheid"  cx="525" cy="400" r="28" fill="transparent" style="cursor:pointer"/>
        <circle id="hv-hit-pulsar"   cx="405" cy="252" r="24" fill="transparent" style="cursor:pointer"/>
        <circle id="hv-hit-nova"     cx="275" cy="252" r="24" fill="transparent" style="cursor:pointer"/>
        <circle id="hv-hit-magnetar" cx="340" cy="364" r="24" fill="transparent" style="cursor:pointer"/>
      </svg>

      <div class="hv-brand">
        <h1 class="hv-title">
          <span class="hv-ltr">S</span><span class="hv-dot">·</span>
          <span class="hv-ltr">I</span><span class="hv-dot">·</span>
          <span class="hv-ltr">D</span><span class="hv-dot">·</span>
          <span class="hv-ltr">E</span><span class="hv-dot">·</span>
          <span class="hv-ltr">R</span><span class="hv-dot">·</span>
          <span class="hv-ltr">A</span>
        </h1>
        <div class="hv-module-display" id="hv-mod-display">
          <p id="hv-module-name">&nbsp;</p>
          <div class="hv-sep"></div>
          <p id="hv-module-desc">&nbsp;</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hub {
  position: relative;
  width: 100%;
  height: 100%;
  background: #05090F;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: 'Outfit', sans-serif;
}

.hv-bg { position: absolute; inset: 0; pointer-events: none; }

.hv-sphere {
  position: absolute;
  border-radius: 50%;
  opacity: 0;
  will-change: transform, background;
  transition: background 3.8s ease, opacity 2.2s ease;
}
.hv-sphere.on { opacity: 1; }

.s1 { width:720px;height:720px;top:-290px;left:-200px;filter:blur(115px);animation:d1 30s ease-in-out infinite; }
.s2 { width:620px;height:620px;bottom:-220px;right:-140px;filter:blur(125px);animation:d2 37s ease-in-out infinite; }
.s3 { width:460px;height:460px;top:20%;left:22%;filter:blur(95px);animation:d3 24s ease-in-out infinite; }
.s4 { width:390px;height:390px;bottom:8%;right:28%;filter:blur(105px);animation:d4 42s ease-in-out infinite; }

@keyframes d1 { 0%,100%{transform:translate(0,0) scale(1)} 30%{transform:translate(75px,85px) scale(1.04)} 65%{transform:translate(-55px,115px) scale(0.96)} }
@keyframes d2 { 0%,100%{transform:translate(0,0) scale(1)} 35%{transform:translate(-105px,-65px) scale(1.06)} 72%{transform:translate(65px,-95px) scale(0.97)} }
@keyframes d3 { 0%,100%{transform:translate(0,0)} 42%{transform:translate(85px,-65px) scale(1.03)} 78%{transform:translate(-45px,75px) scale(0.97)} }
@keyframes d4 { 0%,100%{transform:translate(0,0)} 48%{transform:translate(65px,55px) scale(1.05)} }

.hv-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.8rem;
  padding: 2rem;
}

.hv-svg { width: min(340px, 65%); display: block; overflow: visible; }

.hv-brand { text-align: center; color: #fff; }

.hv-title {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 500;
  font-size: clamp(3rem, 5vw, 4.6rem);
  color: #D4C498;
  line-height: 1;
  letter-spacing: 0.04em;
  display: inline-flex;
  align-items: center;
  background: linear-gradient(
    90deg,
    #D4C498 0%,
    #D4C498 44%,
    #FFF8E0 50%,
    #D4C498 56%,
    #D4C498 100%
  );
  background-size: 400% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: hv-title-sweep 3.2s linear infinite;
}

@keyframes hv-title-sweep {
  from { background-position: 125% center; }
  to   { background-position: 0% center; }
}
.hv-ltr { display: inline-block; }
.hv-dot {
  display: inline-flex;
  align-items: center;
  font-size: 0.4em;
  opacity: 0.38;
  padding: 0 0.3em;
  line-height: 1;
  position: relative;
  top: 0.04em;
}

.hv-module-display {
  margin-top: 1.6rem;
  min-height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  transition: opacity 0.4s ease;
}
.hv-module-display.fading { opacity: 0; }

#hv-module-name {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 300;
  font-size: clamp(1rem, 2vw, 1.45rem);
  letter-spacing: 0.38em;
  color: #fff;
  min-height: 1.6em;
}

.hv-sep {
  width: 28px;
  height: 1px;
  background: rgba(255,255,255,0.13);
  flex-shrink: 0;
  transition: opacity 0.4s ease;
}

#hv-module-desc {
  font-family: 'Outfit', sans-serif;
  font-weight: 300;
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
}
</style>
