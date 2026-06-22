'use client'

import { useState, useEffect, useRef } from 'react'
import Hero from '@/components/Hero'
import Dashboard from '@/components/Dashboard'
import BentoGrid from '@/components/BentoGrid'
import Modal from '@/components/Modal'

const modalData: Record<string, string> = {
  compression: `
    <h2>Optimization Method: Semantic Compression</h2>
    <p>GreenPrompt doesn't just "cut words"; it performs <strong>Semantic Compression</strong> using a multi-step NLP pipeline before your prompt ever hits the server.</p>
    <ol class="md-ol">
      <li><strong>Meta-Talk Removal:</strong> Strips phrases like "I was wondering if you could," "Please," and "Thank you," which LLMs do not need for task execution.</li>
      <li><strong>Intensifier Stripping:</strong> Removes adverbs like "extremely" or "really" that add token weight without increasing clarity.</li>
      <li><strong>Verb Distillation:</strong> Converts noun-heavy phrases (e.g., "provide a summary") into direct imperatives ("Summarize").</li>
      <li><strong>RTF Structuring:</strong> Reformats the prompt into a <strong>Role-Task-Format</strong> structure, which improves model accuracy while using fewer tokens.</li>
      <li><strong>Deduplication:</strong> Uses trigram analysis to remove redundant sentences.</li>
    </ol>
    <div class="alert-box note">
      <strong>Note:</strong> Unlike other tools that track energy <em>after</em> it's spent, <strong>GreenPrompt</strong> stops the wastage at the source. We optimize the prompt <em>locally</em> in the browser, reducing the workload for the AI model itself.
    </div>
  `,
  routing: `
    <h2>3-Tier Intelligent Routing</h2>
    <p>What if developers want to automatically route prompts to the most energy-efficient model? That's where our Classification Engine comes in.</p>
    
    <h3>🟢 SLM Tier (Simple Tasks)</h3>
    <p>For straightforward questions like <em>"What is the capital of France?"</em>, the engine uses local rules to route to <strong>Llama 3.2 3B</strong>.</p>
    <ul class="md-ul">
      <li><strong>Latency:</strong> Zero (no heavy API call)</li>
      <li><strong>Savings:</strong> Up to 90% energy compared to full-tier models.</li>
    </ul>

    <h3>🟡 MID Tier (Standard Tasks)</h3>
    <p>For summarization or standard reasoning, tasks are routed to mid-weight models like <strong>Llama 3.1 8B</strong>.</p>

    <h3>🔴 FULL Tier (Heavy Logic)</h3>
    <p>For complex analytical tasks (e.g., <em>"Design a secure Python backend API"</em>), the system instantly catches heavy analytical verbs and routes to a massive model like <strong>Llama 3.3 70B</strong>.</p>

    <div class="alert-box info">
      <strong>⚡ Fallback Reliability:</strong> If our local classifier fails to understand a strange prompt, it falls back to a hyper-fast, low-energy API call to make the routing decision, ensuring 100% reliability.
    </div>
  `,
  metrics: `
    <h2>Environmental Constants (2025 Data)</h2>
    <p>GreenPrompt uses the most recent peer-reviewed data to ensure accuracy, aligned with the <strong>"How Hungry is AI?" (2025)</strong> framework.</p>

    <h3>The Core Formulas</h3>
    <ul class="md-ul">
      <li><strong>Energy (Wh):</strong> <code>(Tokens / 1000) × Tier_Wh_per_1k × PUE</code></li>
      <li><strong>Carbon (gCO2e):</strong> <code>(Energy / 1000) × Carbon_Intensity</code></li>
      <li><strong>Water (ml):</strong> <code>(Energy / 1000) × WUE × 1000</code></li>
    </ul>

    <h3>Provider Baselines</h3>
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>PUE</th>
            <th>Carbon Intensity (g/kWh)</th>
            <th>WUE (L/kWh)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Google</strong></td>
            <td>1.09</td>
            <td>125</td>
            <td>1.083</td>
          </tr>
          <tr>
            <td><strong>Microsoft</strong></td>
            <td>1.20</td>
            <td>233</td>
            <td>1.40</td>
          </tr>
          <tr>
            <td><strong>OpenAI</strong></td>
            <td>1.40</td>
            <td>400</td>
            <td>1.80</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="alert-box important">
      <strong>Limitation Scope:</strong> GreenPrompt measures the <strong>input/prompt energy</strong> (the tokens sent). While output generation uses more energy, GreenPrompt gives users agency over what they <em>can</em> control — making every input token count.
    </div>
  `,
  extension: `
    <h2>Chrome Extension & Audit Dashboard</h2>
    <p>Every day, millions of people use massive, energy-hungry models for simple tasks. We built a browser extension to intercept this wasteful behavior right where it happens.</p>

    <h3>How it Works</h3>
    <ol class="md-ol">
      <li><strong>Intercepts:</strong> Works directly on sites like ChatGPT.</li>
      <li><strong>Live Counter:</strong> A green leaf badge injects live stats into your text box.</li>
      <li><strong>Local Optimization:</strong> Instantly rewrites your prompt to be shorter and more precise via local NLP.</li>
      <li><strong>Audit Dashboard:</strong> Logs cumulative tokens saved, CO2 prevented, and water conserved across every session.</li>
    </ol>

    <h3>The Impact</h3>
    <p>A single 500-token prompt uses as much water as 5ml of a bottle and emits grams of CO2. With billions of prompts sent daily, this is the <em>"Invisible Carbon"</em> of the AI era. GreenPrompt makes every token count.</p>
  `,
}

export default function Home() {
  const [showHero, setShowHero] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalContent, setModalContent] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')
  const dashboardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
          }
        })
      },
      { threshold: 0.1 }
    )

    if (dashboardRef.current) {
      observer.observe(dashboardRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const handleSelectExample = (text: string) => {
    setInitialPrompt(text)
    setShowHero(false)
    setTimeout(() => {
      dashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const handleCardClick = (cardKey: string) => {
    if (modalData[cardKey]) {
      setModalContent(modalData[cardKey])
      setModalOpen(true)
    }
  }

  return (
    <main id="app">
      {showHero && <Hero onSelectExample={handleSelectExample} />}
      
      <div ref={dashboardRef} className="reveal visible">
        <Dashboard showHero={showHero} initialPrompt={initialPrompt} />
      </div>

      <BentoGrid onCardClick={handleCardClick} />

      <div style={{ height: '80px' }}></div>

      <Modal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        content={modalContent}
      />
    </main>
  )
}
