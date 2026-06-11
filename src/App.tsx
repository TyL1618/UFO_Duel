import { Routes, Route } from 'react-router-dom'
import MainMenu from './pages/MainMenu'
import CreateRoom from './pages/CreateRoom'
import JoinRoom from './pages/JoinRoom'
import Loadout from './pages/Loadout'
import Game from './pages/Game'
import Skills from './pages/Skills'
import Matchmaking from './pages/Matchmaking'
import GameResult from './pages/GameResult'
import RotatePrompt from './components/RotatePrompt'
import { RoomProvider } from './contexts/RoomContext'

export default function App() {
  return (
    <RoomProvider>
      <RotatePrompt />
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/create" element={<CreateRoom />} />
        <Route path="/join" element={<JoinRoom />} />
        <Route path="/loadout/:roomId" element={<Loadout />} />
        <Route path="/game/:roomId" element={<Game />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/matchmaking" element={<Matchmaking />} />
        <Route path="/game-result" element={<GameResult />} />
      </Routes>
    </RoomProvider>
  )
}
