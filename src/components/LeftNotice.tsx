// Brief full-screen overlay shown when the other player leaves the room
// (back to menu / closed the tab) during any pre-game stage, before we return
// to the main menu ourselves.
export default function LeftNotice({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 select-none">
      <div className="text-red-400 text-lg tracking-widest mb-1">對方已離開房間</div>
      <div className="text-gray-500 text-sm tracking-wider animate-pulse">返回主選單...</div>
    </div>
  )
}
