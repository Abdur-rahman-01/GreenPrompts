'use client'

import { ArrowRight } from 'lucide-react'

interface HeroProps {
  onSelectExample: (text: string) => void
}

export default function Hero({ onSelectExample }: HeroProps) {
  const examples = [
    'Explain quantum entanglement',
    'Write a fast sort in Python',
    'Sustainable business strategy',
  ]

  return (
    <section className="hero" id="heroCenter">
      <h1 className="hero-title">
        Every prompt has a<br />cleaner path.
      </h1>
      <p className="hero-subtitle">Fullstack. Production-ready. Your code.</p>
      
      <div className="example-chips">
        {examples.map((example, i) => (
          <span 
            key={i} 
            className="ex-chip"
            onClick={() => onSelectExample(example)}
          >
            {example}
          </span>
        ))}
      </div>
    </section>
  )
}
