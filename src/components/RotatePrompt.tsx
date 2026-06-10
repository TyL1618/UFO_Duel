import { useEffect, useState } from 'react'

export default function RotatePrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const check = () => setShow(window.innerHeight > window.innerWidth)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-dark-bg gap-6">
      <div className="text-6xl animate-spin" style={{ animationDuration: '2s' }}>↻</div>
      <div className="text-neon-blue text-xl tracking-widest">請旋轉螢幕</div>
      <div className="text-gray-500 text-sm">本遊戲需要橫屏顯示</div>
    </div>
  )
}
