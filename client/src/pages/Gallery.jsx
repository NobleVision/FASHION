import React from 'react'

const Gallery = () => {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Your Fashion Gallery
        </h1>
        <p className="text-gray-600">
          View and manage your saved fashion creations
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-12 text-center">
        <div className="text-4xl mb-4">🖼️</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          No saved creations yet
        </h3>
        <p className="text-gray-500 mb-6">
          Start creating fashion images in the Studio to see them here
        </p>
        <button className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700">
          Go to Studio
        </button>
      </div>
    </div>
  )
}

export default Gallery