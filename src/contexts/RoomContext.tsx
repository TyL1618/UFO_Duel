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
}

const Ctx = createContext<RoomContextType | null>(null)

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const initRoom = (roomId: string, role: 'p1' | 'p2') =>
    setRoom({ roomId, role, myLoadout: null, opponentLoadout: null, mapSeed: null })

  const setLoadoutData = (mine: PlayerLoadout, opp: PlayerLoadout, seed: number) =>
    setRoom(r => r ? { ...r, myLoadout: mine, opponentLoadout: opp, mapSeed: seed } : r)

  const clearRoom = () => {
    channelRef.current?.unsubscribe()
    channelRef.current = null
    setRoom(null)
  }

  return (
    <Ctx.Provider value={{ room, channelRef, initRoom, setLoadoutData, clearRoom }}>
      {children}
    </Ctx.Provider>
  )
}

export function useRoom() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRoom must be inside RoomProvider')
  return ctx
}
