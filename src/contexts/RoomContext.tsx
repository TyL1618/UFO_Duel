import { createContext, useContext, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { WeaponId } from '../types/game'

export interface PlayerLoadout {
  name: string
  color: string
  weapons: WeaponId[]
}

export interface RoomInfo {
  roomId: string
  role: 'p1' | 'p2'
  myLoadout: PlayerLoadout | null
  opponentLoadout: PlayerLoadout | null
  mapSeed: number | null
}

interface RoomContextType {
  room: RoomInfo | null
  channelRef: React.MutableRefObject<RealtimeChannel | null>
  initRoom: (roomId: string, role: 'p1' | 'p2') => void
  setLoadoutData: (mine: PlayerLoadout, opp: PlayerLoadout, seed: number) => void
  clearRoom: () => void
  tryRestoreRoom: (roomId: string) => boolean
}

const SS_KEY = (id: string) => `ufo_room_${id}`

const Ctx = createContext<RoomContextType | null>(null)

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const initRoom = (roomId: string, role: 'p1' | 'p2') => {
    const info: RoomInfo = { roomId, role, myLoadout: null, opponentLoadout: null, mapSeed: null }
    sessionStorage.setItem(SS_KEY(roomId), JSON.stringify(info))
    setRoom(info)
  }

  const setLoadoutData = (mine: PlayerLoadout, opp: PlayerLoadout, seed: number) =>
    setRoom(r => {
      if (!r) return r
      const updated = { ...r, myLoadout: mine, opponentLoadout: opp, mapSeed: seed }
      sessionStorage.setItem(SS_KEY(r.roomId), JSON.stringify(updated))
      return updated
    })

  const clearRoom = () => {
    if (room) sessionStorage.removeItem(SS_KEY(room.roomId))
    channelRef.current?.unsubscribe()
    channelRef.current = null
    setRoom(null)
  }

  // Called by Game.tsx on mount when room context was lost (e.g. F5 refresh).
  // Returns true if valid game data was found and restored.
  const tryRestoreRoom = (roomId: string): boolean => {
    const stored = sessionStorage.getItem(SS_KEY(roomId))
    if (!stored) return false
    try {
      const info = JSON.parse(stored) as RoomInfo
      if (!info.role || !info.myLoadout || !info.opponentLoadout || !info.mapSeed) return false
      setRoom(info)
      return true
    } catch {
      return false
    }
  }

  return (
    <Ctx.Provider value={{ room, channelRef, initRoom, setLoadoutData, clearRoom, tryRestoreRoom }}>
      {children}
    </Ctx.Provider>
  )
}

export function useRoom() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRoom must be inside RoomProvider')
  return ctx
}
