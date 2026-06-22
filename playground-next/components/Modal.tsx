'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  content: string
}

export default function Modal({ isOpen, onClose, content }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    
    document.addEventListener('keydown', handleEscape)
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  return (
    <div 
      className={`modal-overlay ${isOpen ? 'active' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-content glass-card">
        <button className="modal-close" onClick={onClose}>
          <X size={24} />
        </button>
        <div 
          className="modal-body md-body"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    </div>
  )
}
