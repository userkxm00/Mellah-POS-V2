import React, { useEffect, useRef } from 'react'

interface ConfettiBurstProps {
  onComplete?: () => void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  radius: number
  rotation: number
  rotationSpeed: number
  alpha: number
}

const COLORS = ['#0A84FF', '#30D158', '#FF9F0A', '#BF5AF2', '#FF453A', '#64D2FF', '#FFD60A']

export function ConfettiBurst({ onComplete }: ConfettiBurstProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: Particle[] = []
    const particleCount = 70

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() * 200 - 100),
        y: canvas.height / 2 - 50 + (Math.random() * 100 - 50),
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.8) * 16,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        radius: Math.random() * 6 + 3,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        alpha: 1,
      })
    }

    let animationFrameId: number

    const render = (): void => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let activeCount = 0

      particles.forEach((p) => {
        if (p.alpha <= 0) return
        activeCount++

        p.x += p.vx
        p.y += p.vy
        p.vy += 0.4 // gravity
        p.rotation += p.rotationSpeed
        p.alpha -= 0.015

        ctx.save()
        ctx.globalAlpha = Math.max(0, p.alpha)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2)
        ctx.restore()
      })

      if (activeCount > 0) {
        animationFrameId = requestAnimationFrame(render)
      } else if (onComplete) {
        onComplete()
      }
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [onComplete])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[70]"
    />
  )
}
