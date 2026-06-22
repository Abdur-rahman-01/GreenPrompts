'use client'

import { ArrowRight } from 'lucide-react'

interface BentoGridProps {
  onCardClick: (cardKey: string) => void
}

const cards = [
  {
    key: 'compression',
    title: 'Token Compression Engine',
    desc: 'Before your prompt ever hits an LLM, GreenPrompt strips redundancy, filler words, and inflated phrasing — shrinking prompts by up to 40%. Fewer tokens = less compute, less energy, less CO₂ emitted per query.',
    delay: '0.1s',
  },
  {
    key: 'routing',
    title: '3-Tier Intelligent Routing',
    desc: 'Every prompt is scored for complexity and dispatched to the leanest capable model — Llama 3.2 3B for simple tasks, 8B for mid-tier, and 70B only when truly needed. Unnecessary power consumption is blocked at the gate.',
    delay: '0.2s',
  },
  {
    key: 'metrics',
    title: 'Live Environmental Metrics',
    desc: 'Every inference returns real CO₂ (g), water usage (ml), and energy (Joules) estimates across all three model tiers — so you see exactly how much the planet saved by choosing the greener path over the wasteful one.',
    delay: '0.3s',
  },
  {
    key: 'extension',
    title: 'Chrome Extension + Audit Dashboard',
    desc: 'The GreenPrompt browser extension intercepts prompts on any AI chat site, optimizes them in real-time, and logs cumulative CO₂, water, and energy savings — giving you a personal carbon audit across every session.',
    delay: '0.4s',
  },
]

export default function BentoGrid({ onCardClick }: BentoGridProps) {
  return (
    <section className="bento-grid">
      {cards.map((card) => (
        <div 
          key={card.key}
          className="bento-card" 
          style={{ '--d': card.delay } as React.CSSProperties}
          onClick={() => onCardClick(card.key)}
        >
          <h3 className="bento-title">{card.title}</h3>
          <p className="bento-desc">{card.desc}</p>
          <a href="#" className="bento-link" onClick={(e) => e.preventDefault()}>
            See How It Works <ArrowRight size={16} />
          </a>
        </div>
      ))}
    </section>
  )
}
