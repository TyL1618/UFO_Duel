import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function generateRoomId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export default function CreateRoom() {
  const nav = useNavigate()
  const [roomId] = useState(generateRoomId)
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-8 bg-dark-bg">
      <div className="text-gray-400 tracking-widest text-sm">房間號碼</div>

      <button
        onClick={copy}
        className="text-7xl font-bold tracking-[0.3em] text-neon-blue drop-shadow-[0_0_30px_#00d4ff] hover:scale-105 transition-transform"
      >
        {roomId}
      </button>
      <div className="text-gray-500 text-sm h-4">
        {copied ? '已複製！' : '點擊號碼複製'}
      </div>

      <div className="text-gray-500 text-sm animate-pulse">等待對手加入...</div>

      <button
        onClick={() => nav('/')}
        className="text-gray-600 hover:text-gray-400 text-sm tracking-widest mt-4"
      >
        ← 返回
      </button>
    </div>
  )
}
