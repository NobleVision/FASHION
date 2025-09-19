import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

const Gallery = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const API_BASE = import.meta.env.VITE_API_BASE || ''

  const load = async () => {
    setLoading(true)
    try {
      const resp = await fetch(`${API_BASE}/api/generations`)
      if (!resp.ok) throw new Error('Failed to load gallery')
      const data = await resp.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('gallery load error', e)
      toast.error('Failed to load gallery')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleRename = async (id) => {
    const name = prompt('Enter a name for this creation:')
    if (!name) return
    try {
      const resp = await fetch(`${API_BASE}/api/save-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: id, name })
      })
      if (!resp.ok) throw new Error('Rename failed')
      toast.success('Saved name')
      load()
    } catch (e) {
      console.error('rename error', e)
      toast.error('Failed to save name')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this item?')) return
    try {
      const resp = await fetch(`${API_BASE}/api/delete-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: id })
      })
      if (!resp.ok) throw new Error('Delete failed')
      toast.success('Deleted')
      setItems((prev) => prev.filter((x) => x.id !== id))
    } catch (e) {
      console.error('delete error', e)
      toast.error('Failed to delete')
    }
  }

  const handleShare = async (item) => {
    const url = item.output_video_url || item.output_image_url
    if (!url) return
    try {
      if (navigator.share) {
        await navigator.share({ title: item.name || 'FashionForge creation', url })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied to clipboard')
      }
    } catch (e) {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Your Fashion Gallery</h1>
          <p className="text-gray-600">View and manage your saved fashion creations</p>
        </div>
        <Link to="/" className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">Go to Studio</Link>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">Loading...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <div className="text-4xl mb-4">🖼️</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No saved creations yet</h3>
          <p className="text-gray-500 mb-6">Start creating fashion images in the Studio to see them here</p>
          <Link to="/" className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700">Go to Studio</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="aspect-video bg-gray-100">
                {item.output_video_url ? (
                  <video src={item.output_video_url} controls className="w-full h-full object-cover" />
                ) : (
                  <img src={item.output_image_url} alt={item.name || 'Creation'} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold truncate" title={item.name || `Creation #${item.id}`}>{item.name || `Creation #${item.id}`}</div>
                  <div className="text-xs text-gray-500">{new Date(item.created_at).toLocaleString()}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.output_image_url && (
                    <a href={item.output_image_url} download className="text-sm bg-gray-800 text-white px-3 py-1 rounded">Download Image</a>
                  )}
                  {item.output_video_url && (
                    <a href={item.output_video_url} download className="text-sm bg-gray-800 text-white px-3 py-1 rounded">Download Video</a>
                  )}
                  <button onClick={() => handleRename(item.id)} className="text-sm bg-purple-600 text-white px-3 py-1 rounded">Rename</button>
                  <button onClick={() => handleShare(item)} className="text-sm bg-gray-200 text-gray-800 px-3 py-1 rounded">Share</button>
                  <button onClick={() => handleDelete(item.id)} className="text-sm bg-red-600 text-white px-3 py-1 rounded">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Gallery