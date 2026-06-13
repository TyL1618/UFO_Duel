import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import MainMenu from './pages/MainMenu'
import RotatePrompt from './components/RotatePrompt'
import { RoomProvider } from './contexts/RoomContext'

const CreateRoom = lazy(() => import('./pages/CreateRoom'))
const CreateRoomMulti = lazy(() => import('./pages/CreateRoomMulti'))
const JoinRoom = lazy(() => import('./pages/JoinRoom'))
const Loadout = lazy(() => import('./pages/Loadout'))
const Game = lazy(() => import('./pages/Game'))
const Skills = lazy(() => import('./pages/Skills'))
const Matchmaking = lazy(() => import('./pages/Matchmaking'))
const GameResult = lazy(() => import('./pages/GameResult'))
const PrivateLobby = lazy(() => import('./pages/PrivateLobby'))
const Ban = lazy(() => import('./pages/Ban'))
const Profile = lazy(() => import('./pages/Profile'))
const MapReveal = lazy(() => import('./pages/MapReveal'))
const Spectate = lazy(() => import('./pages/Spectate'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center w-full h-full bg-dark-bg">
      <div className="text-neon-blue text-xs tracking-widest animate-pulse">LOADING...</div>
    </div>
  )
}

export default function App() {
  return (
    <RoomProvider>
      <RotatePrompt />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/create" element={<CreateRoom />} />
          <Route path="/create-multi" element={<CreateRoomMulti />} />
          <Route path="/join" element={<JoinRoom />} />
          <Route path="/profile/:roomId" element={<Profile />} />
          <Route path="/ban/:roomId" element={<Ban />} />
          <Route path="/loadout/:roomId" element={<Loadout />} />
          <Route path="/map-reveal/:roomId" element={<MapReveal />} />
          <Route path="/game/:roomId" element={<Game />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/matchmaking" element={<Matchmaking />} />
          <Route path="/game-result" element={<GameResult />} />
          <Route path="/private" element={<PrivateLobby />} />
          <Route path="/spectate/:roomId" element={<Spectate />} />
        </Routes>
      </Suspense>
    </RoomProvider>
  )
}
