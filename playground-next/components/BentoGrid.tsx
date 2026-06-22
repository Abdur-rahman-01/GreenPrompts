'use client'

import { useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'

interface BentoGridProps {
  onCardClick: (cardKey: string) => void
}

const cards = [
  {
    key: 'compression',
    title: 'Token Compression Engine',
    desc: 'Before your prompt ever hits an LLM, GreenPrompt strips redundancy, filler words, and inflated phrasing — shrinking prompts by up to 40%. Fewer tokens = less compute, less energy, less CO₂ emitted per query.',
  },
  {
    key: 'routing',
    title: '3-Tier Intelligent Routing',
    desc: 'Every prompt is scored for complexity and dispatched to the leanest capable model — Llama 3.2 3B for simple tasks, 8B for mid-tier, and 70B only when truly needed. Unnecessary power consumption is blocked at the gate.',
  },
  {
    key: 'metrics',
    title: 'Live Environmental Metrics',
    desc: 'Every inference returns real CO₂ (g), water usage (ml), and energy (Joules) estimates across all three model tiers — so you see exactly how much the planet saved by choosing the greener path over the wasteful one.',
  },
  {
    key: 'extension',
    title: 'Chrome Extension + Audit Dashboard',
    desc: 'The GreenPrompt browser extension intercepts prompts on any AI chat site, optimizes them in real-time, and logs cumulative CO₂, water, and energy savings — giving you a personal carbon audit across every session.',
  },
]

export default function BentoGrid({ onCardClick }: BentoGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )

    cardsRef.current.forEach((card) => {
      if (card) observer.observe(card)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <section className="bento-grid" ref={gridRef}>
      {cards.map((card, index) => (
        <div 
          key={card.key}
          ref={(el) => { cardsRef.current[index] = el }}
          className="bento-card reveal"
          style={{ transitionDelay: `${index * 0.1}s` }}
          onClick={() => onCardClick(card.key)}
        >
          <h3 className="bento-title">{card.title}</h3>
          <p className="bento-desc">{card.desc}</p>
          <span className="bento-link">
            See How It Works <ArrowRight size={16} />
          </span>
        </div>
      ))}
    </section>
  )
}
