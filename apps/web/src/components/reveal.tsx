'use client'

import { useEffect } from 'react'

export function Reveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px' }
    )
    for (const element of document.querySelectorAll('.reveal')) {
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [])

  return null
}
