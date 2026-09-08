// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ServerGlobe, { NODES } from './serverGlobe'
import { useThemeStore } from '~/features/theme/store'

// happy-dom has no canvas backend and no layout engine, so three things
// need standing in for:
//   - getContext('2d'), which otherwise returns null and the effect bails
//   - clientWidth, which is always 0 without layout, so the globe would
//     size itself to nothing and never draw
//   - requestAnimationFrame, which must NOT actually run the callback or
//     the render loop spins forever inside the test

let ctxCalls: string[]

const makeFakeCtx = () => {
  const target: Record<string, unknown> = {}
  return new Proxy(target, {
    get: (t, prop: string) => {
      if (!(prop in t)) {
        t[prop] = (...args: unknown[]) => { ctxCalls.push(prop); return args }
      }
      return t[prop]
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D
}

const setReducedMotion = (reduce: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

let rafSpy: ReturnType<typeof vi.fn>
let cafSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  ctxCalls = []
  rafSpy = vi.fn(() => 1)
  cafSpy = vi.fn()

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => makeFakeCtx())
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 })
  vi.stubGlobal('requestAnimationFrame', rafSpy)
  vi.stubGlobal('cancelAnimationFrame', cafSpy)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  setReducedMotion(false)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
})

describe('ServerGlobe', () => {
  it('exposes every node location to assistive tech via the canvas label', () => {
    render(<ServerGlobe />)
    const label = screen.getByRole('img').getAttribute('aria-label') ?? ''
    for (const node of NODES) expect(label).toContain(node.city)
  })

  it('lists server and worker nodes separately in the legend', () => {
    render(<ServerGlobe />)

    const servers = screen.getByText('Server nodes').parentElement?.textContent ?? ''
    const workers = screen.getByText('Worker nodes').parentElement?.textContent ?? ''

    for (const node of NODES.filter(n => n.role === 'server')) {
      expect(servers).toContain(node.city)
      expect(workers).not.toContain(node.city)
    }
    for (const node of NODES.filter(n => n.role === 'worker')) {
      expect(workers).toContain(node.city)
      expect(servers).not.toContain(node.city)
    }
  })

  it('labels the legend without Nomad-specific vocabulary', () => {
    render(<ServerGlobe />)
    // "Client" means workload host in Nomad and the opposite to everyone
    // else — it must not resurface in anything the reader sees.
    expect(screen.queryByText(/client/i)).toBeNull()
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toMatch(/client/i)
  })

  it('has three server nodes and four worker nodes', () => {
    expect(NODES.filter(n => n.role === 'server')).toHaveLength(3)
    expect(NODES.filter(n => n.role === 'worker')).toHaveLength(4)
  })

  it('draws the globe and starts the rotation loop', () => {
    render(<ServerGlobe />)
    expect(ctxCalls).toContain('arc')
    expect(ctxCalls).toContain('stroke')
    expect(rafSpy).toHaveBeenCalled()
  })

  it('draws a single static frame and never animates under reduced motion', () => {
    setReducedMotion(true)
    render(<ServerGlobe />)
    // The frame is still painted — the globe is visible, it just holds still.
    expect(ctxCalls).toContain('arc')
    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('sizes the backing store for the device pixel ratio', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    render(<ServerGlobe />)
    const canvas = screen.getByRole('img') as HTMLCanvasElement
    // 400px container, capped at the 420px max, doubled for the DPR.
    expect(canvas.width).toBe(800)
    expect(canvas.style.width).toBe('400px')
  })

  it('cancels the pending frame on unmount', () => {
    const { unmount } = render(<ServerGlobe />)
    unmount()
    expect(cafSpy).toHaveBeenCalled()
  })

  describe('interactive rotation', () => {
    const drag = (canvas: HTMLElement, from: [number, number], to: [number, number]) => {
      fireEvent.pointerDown(canvas, { pointerId: 1, clientX: from[0], clientY: from[1] })
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: to[0], clientY: to[1] })
    }

    it('pauses the auto-spin while the pointer is down', () => {
      render(<ServerGlobe />)
      expect(cafSpy).not.toHaveBeenCalled()
      fireEvent.pointerDown(screen.getByRole('img'), { pointerId: 1, clientX: 200, clientY: 200 })
      expect(cafSpy).toHaveBeenCalled()
    })

    it('redraws as the pointer drags', () => {
      render(<ServerGlobe />)
      const canvas = screen.getByRole('img')
      ctxCalls = []
      drag(canvas, [200, 200], [240, 200])
      expect(ctxCalls).toContain('arc')
    })

    it('resumes the auto-spin a moment after the drag ends', () => {
      // Only fake the timeout — faking rAF too would displace the rafSpy
      // stub this test asserts on.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        render(<ServerGlobe />)
        const canvas = screen.getByRole('img')
        drag(canvas, [200, 200], [240, 200])
        rafSpy.mockClear()
        fireEvent.pointerUp(canvas, { pointerId: 1 })
        expect(rafSpy).not.toHaveBeenCalled() // not immediately
        vi.advanceTimersByTime(5_000)
        expect(rafSpy).toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('lets reduced-motion users drag, still without ever animating', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        setReducedMotion(true)
        render(<ServerGlobe />)
        const canvas = screen.getByRole('img')
        ctxCalls = []
        drag(canvas, [200, 200], [240, 200])
        expect(ctxCalls).toContain('arc') // the drag itself redraws
        fireEvent.pointerUp(canvas, { pointerId: 1 })
        vi.advanceTimersByTime(60_000)
        expect(rafSpy).not.toHaveBeenCalled() // auto-spin never starts
      } finally {
        vi.useRealTimers()
      }
    })

    it('ignores pointer moves when no drag is in progress', () => {
      render(<ServerGlobe />)
      const canvas = screen.getByRole('img')
      ctxCalls = []
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 240, clientY: 200 })
      expect(ctxCalls).not.toContain('arc')
    })
  })

  it('repaints when the theme flips, and reads the palette again', () => {
    const readSpy = vi.spyOn(window, 'getComputedStyle')
    render(<ServerGlobe />)
    const drawsBefore = ctxCalls.filter(c => c === 'clearRect').length
    const readsBefore = readSpy.mock.calls.length
    useThemeStore.getState().toggleTheme()
    expect(ctxCalls.filter(c => c === 'clearRect').length).toBe(drawsBefore + 1)
    expect(readSpy.mock.calls.length).toBeGreaterThan(readsBefore)
    useThemeStore.setState({ theme: 'dark', pinned: false })
    readSpy.mockRestore()
  })
})
