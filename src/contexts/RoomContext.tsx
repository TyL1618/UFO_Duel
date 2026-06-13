import { createContext, useContext, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { PlayerId, WeaponId } from '../types/game'

export interface PlayerLoadout {
  name: string
  color: string
  weapons: WeaponId[]
}

export interface RoomInfo {
  roomId: string
  role: PlayerId
  playerCount: 2 | 3 | 4
  loadouts: Partial<Record<PlayerId, PlayerLoadout>>
  mapSeed: number | null
  bannedWeapons: WeaponId[]
  profile?: { name: string; color: string }  // set on the Profile page, before weapons
  weaponReel?: boolean                        // weapons were randomized → reel them in MapReveal
}

interface RoomContextType {
  room: RoomInfo | null
  channelRef: React.MutableRefObject<RealtimeChannel | null>
  initRoom: (roomId: string, role: PlayerId, playerCount?: 2 | 3 | 4) => void
  setProfile: (name: string, color: string) => void
  setLoadoutData: (loadouts: Partial<Record<PlayerId, PlayerLoadout>>, seed: number, weaponReel?: boolean) => void
  setBannedWeapons: (weapons: WeaponId[]) => void
  clearRoom: () => void
  tryRestoreRoom: (roomId: string) => boolean
  tryRestorePartialRoom: (roomId: string) => boolean
}

const SS_KEY = (id: string) => `ufo_room_${id}`

const Ctx = createContext<RoomContextType | null>(null)

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const initRoom = (roomId: string, role: PlayerId, playerCount: 2 | 3 | 4 = 2) => {
    const info: RoomInfo = { roomId, role, playerCount, loadouts: {}, mapSeed: null, bannedWeapons: [] }
    localStorage.setItem(SS_KEY(roomId), JSON.stringify(info))
    setRoom(info)
  }

  const setProfile = (name: string, color: string) =>
    setRoom(r => {
      if (!r) return r
      const updated = { ...r, profile: { name, color } }
      localStorage.setItem(SS_KEY(r.roomId), JSON.stringify(updated))
      return updated
    })

  const setLoadoutData = (loadouts: Partial<Record<PlayerId, PlayerLoadout>>, seed: number, weaponReel = false) =>
    setRoom(r => {
      if (!r) return r
      const updated = { ...r, loadouts, mapSeed: seed, weaponReel }
      localStorage.setItem(SS_KEY(r.roomId), JSON.stringify(updated))
      return updated
    })

  const setBannedWeapons = (weapons: WeaponId[]) =>
    setRoom(r => {
      if (!r) return r
      const updated = { ...r, bannedWeapons: weapons }
      localStorage.setItem(SS_KEY(r.roomId), JSON.stringify(updated))
      return updated
    })

  const clearRoom = () => {
    if (room) localStorage.removeItem(SS_KEY(room.roomId))
    channelRef.current?.unsubscribe()
    channelRef.current = null
    setRoom(null)
  }

  const tryRestoreRoom = (roomId: string): boolean => {
    const stored = localStorage.getItem(SS_KEY(roomId))
    if (!stored) return false
    try {
      const info = JSON.parse(stored) as RoomInfo
      const hasLoadouts = info.loadouts && Object.keys(info.loadouts).length >= 2
      if (!info.role || !hasLoadouts || !info.mapSeed) return false
      setRoom(info)
      return true
    } catch {
      return false
    }
  }

  const tryRestorePartialRoom = (roomId: string): boolean => {
    const stored = localStorage.getItem(SS_KEY(roomId))
    if (!stored) return false
    try {
      const info = JSON.parse(stored) as RoomInfo
      if (!info.role) return false
      setRoom(info)
      return true
    } catch {
      return false
    }
  }

  return (
    <Ctx.Provider value={{ room, channelRef, initRoom, setProfile, setLoadoutData, setBannedWeapons, clearRoom, tryRestoreRoom, tryRestorePartialRoom }}>
      {children}
    </Ctx.Provider>
  )
}

export function useRoom() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRoom must be inside RoomProvider')
  return ctx
}
