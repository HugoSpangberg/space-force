import { at, bolt, BRONZE, circle, core, exhaust, fill, glow, IRON, lamp, linear, line, mirror, plate, ring, SILVER, vent } from './drawing'
import type { Ctx, Motion } from './drawing'

export function drawScout(c: Ctx, m: Motion) {
  for (let i = 0; i < 3; i++) {
    at(c, 0, 0, i * Math.PI * 2 / 3 + Math.sin(m.time * 2) * 0.045 * m.articulation, () => {
      at(c, 0, -70, Math.PI, () => exhaust(c, 0, 0, 3.5, 18, '#ff4a37', m))
      plate(c, 'M-9 18L9 18 12 51 0 93-12 51Z', IRON)
      plate(c, 'M-7 32 L0 23 7 32 6 52 0 82-6 52Z', SILVER)
      fill(c, 'M0 32L5 48 0 78Z', '#405168')
      lamp(c, 'M0 54V71', '#ff3d38', 2)
      bolt(c, 0, 40, 1.6)
      plate(c, 'M-5-22L5-22 5-47 0-61-5-47Z', IRON)
      lamp(c, 'M0-40V-53', '#ff6046', 1.5)
    })
  }
  circle(c, 0, 0, 32, '#101822'); ring(c, 0, 0, 30, '#90a3b3', 3)
  for (let i = 0; i < 6; i++) {
    at(c, 0, 0, i * Math.PI / 3, () => {
      plate(c, 'M-12-18L-10-28 0-33 10-28 12-18 0-21Z', SILVER)
      bolt(c, 0, -27, 1.3)
    })
  }
  core(c, 0, 0, 16, '#ff3e24', m)
}

export function drawSpike(c: Ctx, m: Motion) {
  at(c, 0, 0, m.time * 0.12 * m.articulation, () => {
    for (let i = 0; i < 10; i++) {
      at(c, 0, 0, i * Math.PI / 5, () => {
        const extension = Math.sin(m.time * 2.4 + i * 0.6) * 1.8 * m.articulation
        at(c, 0, -extension, 0, () => {
          plate(c, 'M-8-40L-7-61 0-94 7-61 8-40Z', IRON)
          fill(c, 'M0-91L-5-58 0-50 5-58Z', '#d93039')
          fill(c, 'M0-91L0-52 5-58Z', '#ff8e81')
          line(c, 'M0-85V-67', '#ffe1bf', 0.8)
        })
      })
    }
    circle(c, 0, 0, 58, '#111822'); ring(c, 0, 0, 56, '#a69b92', 1.5)
    for (let i = 0; i < 8; i++) {
      at(c, 0, 0, i * Math.PI / 4, () => {
        plate(c, 'M-18-28L-18-45-8-54 8-54 18-45 18-28 7-21-7-21Z', BRONZE)
        fill(c, 'M-16-43L-8-51 7-51 3-46Z', '#ead6c36a')
        line(c, 'M-13-32L-9-35 M9-42L13-38', '#302e30', 1)
        lamp(c, 'M-3-49H3', '#ff6235', 1.5)
        circle(c, 0, -35, 5.5, '#101822'); circle(c, -0.7, -35.7, 2.7, '#ff642e')
        bolt(c, -12, -42, 1)
      })
    }
    core(c, 0, 0, 21, '#ff5d20', m)
  })
}

export function drawLaserMob(c: Ctx, m: Motion) {
  // The engine drives the beam: energy is 1 during the firing window and 0.55 otherwise.
  const firing = m.energy >= 0.8
  const cycle = (m.time * (0.55 + m.energy * 0.35)) % 1
  const charge = firing ? 0 : Math.min(1, (cycle - 0.3) / 0.55)
  const beam = 0.24 + m.energy * 0.76
  const flick = 0.82 + Math.sin(m.time * 24) * 0.09 + Math.sin(m.time * 41) * 0.09
  for (let i = 0; i < 4; i++) {
    at(c, 0, 0, i * Math.PI / 2 + Math.sin(m.time * 0.8 + i) * 0.045 * m.articulation, () => {
      at(c, 0, -62, Math.sin(m.time * 1.6 + i) * 0.06 * m.articulation, () => {
        plate(c, 'M-11 8L-8-18 0-30 8-18 11 8 0 5Z', IRON)
        plate(c, 'M-6 2L-5-14 0-23 5-14 6 2 0 0Z', SILVER)
        bolt(c, -7, 3, 1.2); bolt(c, 7, 3, 1.2)
        at(c, 0, -30, 0, () => {
          circle(c, 0, 0, 10, '#0b101c')
          ring(c, 0, 0, 9, '#8194a4', 1.4)
          const heat = firing ? flick * beam : 0.12 + charge * 0.55 * (0.7 + Math.sin(m.time * 9 + i) * 0.3)
          glow(c, 0, 0, 22 + charge * 14, '#ff2d78', heat * (firing ? 0.9 : 0.45))
          const g = c.createRadialGradient(-1.4, -1.6, 0, 0, 0, 7.5)
          g.addColorStop(0, '#ffffff'); g.addColorStop(0.2, '#ffd6e6'); g.addColorStop(0.45, '#ff2d78'); g.addColorStop(1, '#2a0a24')
          c.globalAlpha = Math.min(1, Math.max(0.25, heat))
          circle(c, 0, 0, 7.5, g)
          c.globalAlpha = 1
          if (firing) {
            // Engine treats the laser as a full-length aimed ray, so draw a beam
            // long enough to span the whole level in the aimed direction
            // (local units are scaled by size/280, ~0.2 at game size).
            const L = 12000
            const half = 2.6 * flick * beam
            c.globalCompositeOperation = 'lighter'
            c.fillStyle = '#ff2d78'
            c.globalAlpha = 0.32 * flick * beam
            c.fillRect(-half * 2.4, -L, half * 4.8, L)
            c.globalAlpha = 0.85 * flick
            c.fillStyle = linear(c, 0, 0, 0, -L, ['#ff2d78', '#ff2d7800'])
            c.fillRect(-half, -L, half * 2, L)
            c.globalAlpha = Math.min(1, flick)
            c.fillStyle = linear(c, 0, 0, 0, -L, ['#ffffff', '#ffffff00'])
            c.fillRect(-0.9, -L, 1.8, L)
            c.globalAlpha = 1
            c.globalCompositeOperation = 'source-over'
          }
          if (charge > 0.05 && !firing) {
            c.globalAlpha = charge * 0.8
            ring(c, 0, 0, 11 + (1 - charge) * 10, '#ff2d78', 1.1)
            c.globalAlpha = 1
          }
          lamp(c, 'M0-13V-16', '#ff5c9a', 1.2)
        })
      })
    })
  }
  circle(c, 0, 0, 34, '#101822'); ring(c, 0, 0, 32, '#90a3b3', 3)
  for (let i = 0; i < 8; i++) {
    at(c, 0, 0, i * Math.PI / 4 + Math.sin(m.time * 0.5) * 0.02 * m.articulation, () => {
      plate(c, 'M-11-20L-9-30 0-35 9-30 11-20 0-23Z', SILVER)
      bolt(c, 0, -29, 1.2)
      if (i % 2) vent(c, -3, -26, 6, 3)
    })
  }
  const spin = m.time * (0.5 + (firing ? 1.7 : 0)) * m.articulation
  at(c, 0, 0, spin, () => {
    ring(c, 0, 0, 43, firing ? '#ff2d78' : '#5a6c80', 1.6)
    for (let i = 0; i < 8; i++) {
      at(c, 0, 0, i * Math.PI / 4, () => {
        c.fillStyle = i % 2 ? '#e1e7ed' : (firing ? '#ff8fbd' : '#7d93a7')
        c.fillRect(-1.1, -48, 2.2, 5)
      })
    }
  })
  core(c, 0, 0, 15, firing ? '#ff2d78' : '#ff5d20', m)
  if (charge > 0.05 && !firing) {
    c.save(); c.globalAlpha *= charge
    ring(c, 0, 0, 20 + (1 - charge) * 9, '#ff2d78', 1.3)
    c.restore()
  }
  if (m.thrust > 0) {
    at(c, 0, 0, Math.PI, () => exhaust(c, 0, 36, 3, 22, firing ? '#ff2d78' : '#ff951f', m))
  }
}

export function drawKamikaze(c: Ctx, m: Motion) {
  const pulse = 0.72 + Math.sin(m.time * 6.2) * 0.16
  const wobble = Math.sin(m.time * 3.3) * 0.1 * m.articulation
  // Short trailing exhaust behind the charge.
  if (m.thrust > 0) exhaust(c, 0, 44, 4.2, 30 * pulse, '#ff6a2c', m)
  at(c, 0, 0, wobble, () => {
    // Four rear fins splayed like a detonating charge.
    for (let i = 0; i < 4; i++) {
      at(c, 0, 0, i * Math.PI / 2 + Math.PI / 4, () => {
        at(c, 0, 26, 0, () => {
          plate(c, 'M-9 4L-12 26 0 54 12 26 9 4 0 1Z', IRON)
          fill(c, 'M-7 14L0 46 7 14 0 9Z', '#7a3226')
          lamp(c, 'M0 18V36', '#ff5a2e', 1.6)
          bolt(c, -6, 24, 1.1); bolt(c, 6, 24, 1.1)
        })
      })
    }
    // Central armored hull with a vented face.
    circle(c, 0, 0, 30, '#141019'); ring(c, 0, 0, 28.5, '#7c5247', 2)
    for (let i = 0; i < 6; i++) {
      at(c, 0, 0, i * Math.PI / 3 + wobble, () => {
        plate(c, 'M-8-16L-6-27 0-33 6-27 8-16 0-19Z', SILVER)
        bolt(c, 0, -27, 1.1)
        if (i % 2) vent(c, -3, -23, 6, 2)
      })
    }
    // Glowing detonator core.
    glow(c, 0, 0, 34 * pulse, '#ff4b3a', 0.5 * m.energy + 0.2)
    core(c, 0, 0, 15, '#ff4b3a', m)
  })
}

export function drawInterceptor(c: Ctx, m: Motion) {
  mirror(c, () => {
    at(c, 29, -29, Math.PI, () => exhaust(c, 0, 0, 4, 64, '#ff951f', m))
    at(c, 12, 0, Math.sin(m.time * 2.1) * 0.04 * m.articulation, () => {
      plate(c, 'M0-12L25-35 47-88 43-22 72 45 37 18 18 13 7 52Z', IRON)
      plate(c, 'M14-16L24-29 44-78 38-19 64 34 39 9 26 6 14 23Z', SILVER)
      fill(c, 'M43-73L33-15 48 12 36 4 28-16Z', '#3e4f60')
      lamp(c, 'M24-21L19-2 25 4', '#ff7623', 1.8)
      line(c, 'M41-13L51 11 M34 0L27-5', '#1b2a3e', 1)
      bolt(c, 36, -18); bolt(c, 36, 7)
    })
    plate(c, 'M17-33L23-45 29-32 28 20 20 37 16 17Z', IRON)
    vent(c, 20, -18, 5, 5)
    lamp(c, 'M23 5V18', '#ff5c27', 1.5)
  })
  plate(c, 'M0 97L-10 60-15 9-10-49 0-73 10-49 15 9 10 60Z', SILVER)
  fill(c, 'M0 94L2 40 8 11 5-40 0-58Z', '#334354')
  lamp(c, 'M0 73V84', '#ff452a', 1.4)
  plate(c, 'M0 36L-6 17-5-11 0-22 5-11 6 17Z', IRON)
  fill(c, 'M0 30L-3 15-2-8 0-14 3-8 3 15Z', '#ffc571')
  line(c, 'M0-10V14', '#fff9de', 1)
  core(c, 0, -39, 6, '#ff7022', m)
}
