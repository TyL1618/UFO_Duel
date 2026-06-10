import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function JoinRoom() {
  const nav = useNavigate()
  const [code, setCode] = useState('')

  const handleJoin = () => {
    const trimmed = code.trim()
    if (trimmed.length === 6 && /^\d+$/.test(trimmed)) {
      nav(`/loadout/${trimmed}`)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-6 bg-dark-bg">
      <div className="text-neon-purple text-2xl tracking-widest">加入房間</div>

      <input
        type="tel"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
        onKeyDown={e => e.key === 'Enter' && handleJoin()}
        placeholder="輸入6位數房間號碼"
        className="bg-dark-panel border-2 border-dark-border focus:border-neon-purple outline-none rounded px-4 py-3 text-center text-3xl tracking-[0.4em] text-neon-purple w-64 font-mono transition-colors"
        autoFocus
      />

      <button
        onClick={handleJoin}
        disabled={code.length !== 6}
        className="border-2 border-neon-purple text-neon-purple px-8 py-2 rounded tracking-widest hover:bg-neon-purple/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        確認加入
      </button>

      <button
        onClick={() => nav('/')}
        className="text-gray-600 hover:text-gray-400 text-sm tracking-widest"
      >
        ← 返回
      </button>
    </div>
  )
}
