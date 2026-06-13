import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useRoom } from '../contexts/RoomContext'

function generateRoomId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export default function Matchmaking() {
  const nav = useNavigate()
  const { initRoom } = useRoom()
  const [status, setStatus] = useState<'searching' | 'found'>('searching')
  const myUuidRef = useRef(crypto.randomUUID())
  const matchedRef = useRef(false)

  useEffect(() => {
    const myUuid = myUuidRef.current
    const ch = supabase.channel('matchmaking:global')
    const proposedRoomRef = { current: null as string | null }

    // Apply a confirmed pairing (idempotent — broadcast and presence both call it)
    const resolveMatch = (roomId: string, p1: string, p2: string) => {
      if (matchedRef.current) return
      if (p1 !== myUuid && p2 !== myUuid) return
      matchedRef.current = true
      const role: 'p1' | 'p2' = p1 === myUuid ? 'p1' : 'p2'
      setStatus('found')
      initRoom(roomId, role)
      // Keep the channel open until we navigate so the proposer's broadcast +
      // presence have time to reach the other player; cleanup unsubscribes.
      setTimeout(() => nav(`/profile/${roomId}`), 600)
    }

    const tryMatch = () => {
      if (matchedRef.current) return
      const state = ch.presenceState<{ uuid: string; matchRoom?: string; matchWith?: string }>()
      const all = Object.values(state).flat()

      // Fallback: someone already proposed a match that includes me — honor it
      // even if the broadcast never arrived (broadcast is fire-and-forget).
      const proposal = all.find(p => p.matchRoom && p.matchWith === myUuid)
      if (proposal?.matchRoom) { resolveMatch(proposal.matchRoom, proposal.uuid, myUuid); return }

      const opponents = all.filter(p => p.uuid !== myUuid && !p.matchRoom)
      if (opponents.length === 0) return
      // Lower UUID becomes P1 and proposes the match
      const minOppUuid = opponents.map(p => p.uuid).sort()[0]
      if (myUuid < minOppUuid && !proposedRoomRef.current) {
        const roomId = generateRoomId()
        proposedRoomRef.current = roomId
        // Persist the proposal in presence (reliable) AND broadcast (fast).
        ch.track({ uuid: myUuid, matchRoom: roomId, matchWith: minOppUuid })
        ch.send({ type: 'broadcast', event: 'match_found', payload: { roomId, p1: myUuid, p2: minOppUuid } })
        resolveMatch(roomId, myUuid, minOppUuid)
      }
    }

    ch.on('presence', { event: 'sync' }, tryMatch)
    ch.on('presence', { event: 'join' }, tryMatch)

    ch.on('broadcast', { event: 'match_found' }, ({ payload }) => {
      const { roomId, p1, p2 } = payload as { roomId: string; p1: string; p2: string }
      resolveMatch(roomId, p1, p2)
    })

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') ch.track({ uuid: myUuid })
    })

    return () => { ch.unsubscribe() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center justify-center w-full h-full bg-dark-bg gap-6">
      {status === 'searching' ? (
        <>
          <div className="text-4xl font-bold tracking-widest text-yellow-400 animate-pulse">
            尋找中...
          </div>
          <div className="text-gray-500 text-sm tracking-wider">正在搜尋對手</div>
          <div className="flex gap-2 mt-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-yellow-400"
                style={{ animation: `waiting-blink 1.2s ${i * 0.4}s ease-in-out infinite` }}
              />
            ))}
          </div>
          <button
            onClick={() => nav('/')}
            className="mt-8 text-gray-600 hover:text-gray-400 text-sm tracking-widest transition-colors"
          >
            ← 取消
          </button>
        </>
      ) : (
        <div className="text-neon-green text-2xl tracking-widest animate-pulse">
          配對成功！跳轉中...
        </div>
      )}
    </div>
  )
}
