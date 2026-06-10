import { Routes, Route } from 'react-router-dom'
import MainMenu from './pages/MainMenu'
import CreateRoom from './pages/CreateRoom'
import JoinRoom from './pages/JoinRoom'
import Loadout from './pages/Loadout'
import Game from './pages/Game'
import RotatePrompt from './components/RotatePrompt'

export default function App() {
  return (
    <>
      <RotatePrompt />
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/create" element={<CreateRoom />} />
        <Route path="/join" element={<JoinRoom />} />
        <Route path="/loadout/:roomId" element={<Loadout />} />
        <Route path="/game/:roomId" element={<Game />} />
      </Routes>
    </>
  )
}
