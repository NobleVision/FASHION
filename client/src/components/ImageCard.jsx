export default function ImageCard({ src, title, selected, onClick }) {
  return (
    <button onClick={onClick} className={`group relative overflow-hidden rounded-lg border-2 ${selected?'border-purple-500':'border-gray-200 hover:border-purple-300'}`}>
      <img loading="lazy" src={src} alt={title} onError={(e)=>{e.currentTarget.src='https://via.placeholder.com/300?text=No+Image'}} className="h-28 w-full object-cover" />
      <div className="absolute bottom-0 w-full bg-black/45 text-white text-xs px-2 py-1">{title}</div>
    </button>
  )
}