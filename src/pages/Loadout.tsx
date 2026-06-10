import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { WEAPON_DEFS } from '../game/weapons'
import type { WeaponId } from '../types/game'
import { useRoom } from '../contexts/RoomContext'
import type { PlayerLoadout } from '../contexts/RoomContext'

const UFO_COLORS = [
  { label: '藍', value: '#00d4ff' },
  { label: '紫', value: '#9d00ff' },
  { label: '綠', value: '#00ff88' },
  { label: '紅', value: '#ff3366' },
  { label: '黃', value: '#ffdd00' },
  { label: '白', value: '#ffffff' },
]

export default function Loadout() {
  const { roomId } = useParams<{ roomId: string }>()
  const nav = useNavigate()
  const { room, channelRef, setLoadoutData } = useRoom()

  const [name, setName] = useState('')
  const [color, setColor] = useState('#00d4ff')
  const [selected, setSelected] = useState<WeaponId[]>([])
  const [waiting, setWaiting] = useState(false)
  const [oppReady, setOppReady] = useState(false)
  const [oppName, setOppName] = useState('')

  const myLoadoutRef = useRef<PlayerLoadout | null>(null)
  const navigatedRef = useRef(false)
  // Use a ref so presence/broadcast handlers always read the latest room value
  const roomRef = useRef(room)
  useEffect(() => { roomRef.current = room }, [room])

  const specials = WEAPON_DEFS.filter(w => w.id !== 'normal' && w.id !== 'smoke')

  // Guard: if room/channel missing on mount, go back home
  useEffect(() => {
    if (!room || !channelRef.current) {
      nav('/')
      return
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Set default color based on role
  useEffect(() => {
    if (room?.role === 'p2') setColor('#ff3366')
  }, [room?.role])

  useEffect(() => {
    const ch = channelRef.current
    if (!ch) return

    // Track own presence with no loadout yet
    ch.track({ role: roomRef.current?.role ?? 'p1', loadout: null })

    // Watch presence sync: update ready states and (for P1) enable start button
    ch.on('presence', { event: 'sync' }, () => {
      if (navigatedRef.current) return
      const state = ch.presenceState<{ role: string; loadout: PlayerLoadout | null }>()
      const all = Object.values(state).flat()
      const p1Entry = all.find(u => u.role === 'p1')
      const p2Entry = all.find(u => u.role === 'p2')

      const opp = roomRef.current?.role === 'p1' ? p2Entry : p1Entry
      if (opp?.loadout?.name) {
        setOppName(opp.loadout.name)
        setOppReady(true)
      } else {
        setOppReady(false)
      }
    })

    // P2 waits for start broadcast from P1
    ch.on('broadcast', { event: 'start' }, ({ payload }) => {
      if (navigatedRef.current) return
      if (roomRef.current?.role !== 'p2') return
      navigatedRef.current = true
      const { seed, p1Loadout, p2Loadout } = payload as {
        seed: number
        p1Loadout: PlayerLoadout
        p2Loadout: PlayerLoadout
      }
      setLoadoutData(p2Loadout, p1Loadout, seed)
      nav(`/game/${roomId}`)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: WeaponId) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(w => w !== id)
        : prev.length < 4 ? [...prev, id] : prev
    )
  }

  const ready = name.trim().length > 0 && selected.length === 4

  const handleReady = () => {
    const mine: PlayerLoadout = { name: name.trim(), color, weapons: selected }
    myLoadoutRef.current = mine
    setWaiting(true)
    channelRef.current?.track({ role: roomRef.current?.role ?? 'p1', loadout: mine })
  }

  // P1 (host) explicitly starts the game after both are ready
  const handleStart = () => {
    if (navigatedRef.current) return
    const ch = channelRef.current
    if (!ch) return
    const state = ch.presenceState<{ role: string; loadout: PlayerLoadout | null }>()
    const all = Object.values(state).flat()
    const p1L = all.find(u => u.role === 'p1')?.loadout
    const p2L = all.find(u => u.role === 'p2')?.loadout
    if (!p1L || !p2L) return
    navigatedRef.current = true
    const seed = Math.floor(Math.random() * 1000000)
    ch.send({ type: 'broadcast', event: 'start', payload: { seed, p1Loadout: p1L, p2Loadout: p2L } })

    setLoadoutData(p1L, p2L, seed)
    nav(`/game/${roomId}`)
  }

  const isP1 = room?.role === 'p1'
  const bothReady = waiting && oppReady

  return (
    <div className="flex flex-col items-center w-full h-full bg-dark-bg py-6 px-4 gap-5 overflow-auto">
      <div className="text-neon-blue tracking-widest text-lg">
        整裝 — 房間 {roomId}
        {room?.role && (
          <span className="ml-3 text-sm" style={{ color: room.role === 'p1' ? '#00d4ff' : '#ff3366' }}>
            ({room.role.toUpperCase()})
          </span>
        )}
      </div>

      {waiting ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <div className="text-neon-green text-lg tracking-widest">準備完成！</div>

          {isP1 ? (
            bothReady ? (
              <>
                <div className="text-gray-400 text-sm">{oppName} 已就緒</div>
                <button
                  onClick={handleStart}
                  className="mt-4 border-2 border-neon-blue text-neon-blue px-12 py-3 rounded tracking-widest text-lg hover:bg-neon-blue/10 hover:shadow-[0_0_20px_#00d4ff] transition-all"
                >
                  開始遊戲
                </button>
              </>
            ) : (
              <div className="text-gray-500 text-sm animate-pulse">等待對手完成整裝...</div>
            )
          ) : (
            bothReady ? (
              <div className="text-gray-400 text-sm animate-pulse">{oppName} 已就緒，等待房主開始...</div>
            ) : (
              <div className="text-gray-500 text-sm animate-pulse">等待對手完成整裝...</div>
            )
          )}
        </div>
      ) : (
        <>
          {/* Name */}
          <div className="w-full max-w-sm">
            <div className="text-gray-400 text-xs mb-1 tracking-widest">玩家名稱</div>
            <input
              type="text"
              maxLength={12}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="輸入名稱"
              className="w-full bg-dark-panel border border-dark-border focus:border-neon-blue outline-none rounded px-3 py-2 text-white font-mono tracking-wider transition-colors"
            />
          </div>

          {/* Color */}
          <div className="w-full max-w-sm">
            <div className="text-gray-400 text-xs mb-2 tracking-widest">飛碟顏色</div>
            <div className="flex gap-3">
              {UFO_COLORS.map(c => (
                <button key={c.value} onClick={() => setColor(c.value)} title={c.label}
                  className="w-9 h-9 rounded-full border-2 transition-all"
                  style={{ background: c.value, borderColor: color === c.value ? '#fff' : 'transparent', boxShadow: color === c.value ? `0 0 12px ${c.value}` : 'none' }}
                />
              ))}
            </div>
          </div>

          {/* Weapons */}
          <div className="w-full max-w-sm">
            <div className="text-gray-400 text-xs mb-2 tracking-widest">
              選擇 4 種特殊武器（{selected.length}/4）
            </div>
            <div className="grid grid-cols-2 gap-2">
              {specials.map(w => {
                const active = selected.includes(w.id)
                return (
                  <button key={w.id} onClick={() => toggle(w.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded border text-left transition-all
                      ${active ? 'border-neon-green bg-neon-green/10 text-neon-green' : 'border-dark-border text-gray-400 hover:border-gray-500'}
                      ${!active && selected.length >= 4 ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <span className="text-xl">{w.icon}</span>
                    <div>
                      <div className="text-xs font-bold">{w.label}</div>
                      <div className="text-xs opacity-60">傷害 {w.damage} × 2發</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <button
            disabled={!ready}
            onClick={handleReady}
            className="mt-auto border-2 border-neon-green text-neon-green px-10 py-3 rounded tracking-widest text-lg hover:bg-neon-green/10 hover:shadow-[0_0_20px_#00ff88] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            準備好！
          </button>
        </>
      )}
    </div>
  )
}
