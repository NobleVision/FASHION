import React, { useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'

const Dashboard = () => {
  const [uploadedImage, setUploadedImage] = useState(null)
  const [previousImages, setPreviousImages] = useState([])
  const [showPreviousImages, setShowPreviousImages] = useState(false)
  const [categories, setCategories] = useState({
    accessory: [],
    pose: [],
    location: [],
    makeup: []
  })
  const [selectedItems, setSelectedItems] = useState({
    accessory: null,
    pose: null,
    location: null,
    makeup: null
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState(null)

  const API_BASE = import.meta.env.VITE_API_BASE || ''

  useEffect(() => {
    fetchCategories()
    fetchPreviousImages()
  }, [])

  const fetchPreviousImages = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/uploaded-images`)
      if (response.ok) {
        const data = await response.json()
        setPreviousImages(data.images || [])
      }
    } catch (error) {
      console.warn('Failed to fetch previous images:', error)
    }
  }

  const fetchCategories = async () => {
    try {
      // Try the combined endpoint first
      const response = await fetch(`${API_BASE}/api/categories`)
      if (response.ok) {
        const data = await response.json()
        console.log('Categories fetched:', data)
        setCategories(data)
        return
      }

      // Fallback: try individual endpoints
      const types = ['accessory', 'pose', 'location', 'makeup']
      const categoryData = {}

      for (const type of types) {
        try {
          const typeResponse = await fetch(`${API_BASE}/api/categories/${type}`)
          if (typeResponse.ok) {
            const typeData = await typeResponse.json()
            categoryData[type] = Array.isArray(typeData) ? typeData : []
          } else {
            console.warn(`Failed to fetch ${type} categories`)
            categoryData[type] = []
          }
        } catch (error) {
          console.error(`Error fetching ${type}:`, error)
          categoryData[type] = []
        }
      }

      setCategories(categoryData)
    } catch (error) {
      console.error('Error fetching categories:', error)
      // Set empty arrays as fallback
      setCategories({
        accessory: [],
        pose: [],
        location: [],
        makeup: []
      })
    }
  }

  const onDrop = async (acceptedFiles) => {
    const file = acceptedFiles[0]
    if (!file) return

    try {
      // Convert file to base64
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64Data = e.target.result.split(',')[1] // Remove data:image/...;base64, prefix

        try {
          // Upload as JSON with base64 data
          const response = await fetch(`http://localhost:3000/api/upload`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image: base64Data,
              mimeType: file.type
            }),
          })

          if (response.ok) {
            const data = await response.json()
            setUploadedImage(data.url)
            toast.success('Image uploaded successfully!')
          } else {
            toast.error('Failed to upload image')
          }
        } catch (error) {
          console.error('Upload error:', error)
          toast.error('Upload failed')
        }
      }

      reader.readAsDataURL(file)
    } catch (error) {
      console.error('File reading error:', error)
      toast.error('Failed to read file')
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif']
    },
    multiple: false
  })

  const handleItemSelect = (type, itemId) => {
    setSelectedItems(prev => ({
      ...prev,
      [type]: prev[type] === itemId ? null : itemId
    }))
  }

  const generateFashionLook = async () => {
    if (!uploadedImage) {
      toast.error('Please upload an image first')
      return
    }

    // Server requires pose and location; enforce explicitly
    if (!selectedItems.pose || !selectedItems.location) {
      toast.error('Please select a Pose and a Location')
      return
    }

    setIsGenerating(true)
    try {
      const payload = {
        userImageUrl: uploadedImage,
        poseId: selectedItems.pose,
        locationId: selectedItems.location,
        accessories: selectedItems.accessory ? [selectedItems.accessory] : [],
        makeup: selectedItems.makeup ? [selectedItems.makeup] : []
      }

      const response = await fetch(`${API_BASE}/api/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const data = await response.json()
        setGeneratedImage(data.imageUrl)
        toast.success('Fashion look generated!')
      } else {
        const errorData = await response.text()
        console.error('Generation failed:', errorData)
        toast.error('Failed to generate fashion look')
      }
    } catch (error) {
      console.error('Generation error:', error)
      toast.error('Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }


  // Initialize DB tables
  const initDb = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/init-db`, { method: 'POST' })
      if (!resp.ok) throw new Error('init-db failed')
      toast.success('Database tables initialized')
      await fetchCategories()
    } catch (e) {
      console.error('init-db error:', e)
      toast.error('Failed to initialize DB')
    }
  }

  // Seed defaults for the provided types (e.g., ['pose'])
  const seedDefaults = async (types) => {
    try {
      const resp = await fetch(`${API_BASE}/api/seed-defaults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types })
      })
      if (!resp.ok) throw new Error('seed-defaults failed')
      toast.success('Defaults seeded')
      await fetchCategories()
    } catch (e) {
      console.error('seed-defaults error:', e)
      toast.error('Failed to seed defaults')
    }
  }

  // Seed for all empty sections
  const seedAllEmpty = async () => {
    const types = Object.entries(categories)
      .filter(([, arr]) => !Array.isArray(arr) || arr.length === 0)
      .map(([t]) => t)
    if (types.length === 0) {
      toast('No empty sections to seed')
      return
    }
    await seedDefaults(types)
  }

  const renderCategoryGrid = (items, type, selectedItems, onSelect) => {
    // Ensure items is always an array
    const itemsArray = Array.isArray(items) ? items : []

    if (itemsArray.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <p>No {type} items available.</p>
          <p className="text-sm mb-3">You can seed a few defaults for quick testing.</p>
          <button
            onClick={() => seedDefaults([type])}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
          >
            Seed {type} defaults
          </button>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {itemsArray.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`cursor-pointer border-2 rounded-lg p-2 transition-all ${
              selectedItems.includes(item.id)
                ? 'border-purple-500 bg-purple-50'
                : 'border-gray-200 hover:border-purple-300'
            }`}
          >
            <img
              src={item.url || 'https://placehold.co/300x200/e5e7eb/6b7280?text=No+Image'}
              alt={item.name}
              className="w-full h-24 object-cover rounded"
              onError={(e) => {
                e.target.src = 'https://placehold.co/300x200/e5e7eb/6b7280?text=No+Image'
              }}
            />
            <p className="text-sm mt-1 text-center">{item.name}</p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-center mb-8">Fashion Studio</h1>

      {/* Upload Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Upload Your Photo</h2>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300'
          }`}
        >
          <input {...getInputProps()} />
          {uploadedImage ? (
            <img src={uploadedImage} alt="Uploaded" className="max-w-xs mx-auto rounded" />
          ) : (
            <p>Drag & drop an image here, or click to select</p>
          )}
        </div>

        {/* Previous Images Toggle */}
        {previousImages.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowPreviousImages(!showPreviousImages)}
              className="text-purple-600 hover:text-purple-800 text-sm font-medium"
            >
              {showPreviousImages ? 'Hide' : 'Show'} Previous Uploads ({previousImages.length})
            </button>
          </div>
        )}

        {/* Previous Images Grid */}
        {showPreviousImages && previousImages.length > 0 && (
          <div className="mt-4 p-4 border rounded-lg bg-gray-50">
            <h3 className="text-sm font-medium mb-3">Select from Previous Uploads:</h3>
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {previousImages.map((image) => (
                <div
                  key={image.id}
                  onClick={() => setUploadedImage(image.url)}
                  className={`cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${
                    uploadedImage === image.url
                      ? 'border-purple-500 ring-2 ring-purple-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <img
                    src={image.url}
                    alt="Previous upload"
                    className="w-full h-16 object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

	      {/* Init & Seed helper when sections are empty */}
	      {Object.values(categories).some(arr => !Array.isArray(arr) || arr.length === 0) && (
	        <div className="mb-8 p-4 border rounded bg-yellow-50">
	          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
	            <div>
	              <h3 className="font-semibold">No items found in one or more sections</h3>
	              <p className="text-sm text-gray-700">Initialize tables and seed sample defaults to get started.</p>
	            </div>
	            <div className="space-x-2">
	              <button onClick={initDb} className="bg-gray-800 text-white px-4 py-2 rounded">Initialize Tables</button>
	              <button onClick={seedAllEmpty} className="bg-purple-600 text-white px-4 py-2 rounded">Seed defaults for empty sections</button>
	            </div>
	          </div>
	        </div>
	      )}


      {/* Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        {Object.entries(categories).map(([type, items]) => (
          <div key={type} className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 capitalize">{type}</h3>
            {renderCategoryGrid(
              items,
              type,
              selectedItems[type] ? [selectedItems[type]] : [],
              (itemId) => handleItemSelect(type, itemId)
            )}
          </div>
        ))}
      </div>

      {/* Generate Button */}
      <div className="text-center mb-8">
        <button
          onClick={generateFashionLook}
          disabled={!uploadedImage || isGenerating}
          className="bg-purple-600 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? 'Generating...' : 'Generate Fashion Look'}
        </button>
      </div>

      {/* Generated Image */}
      {generatedImage && (
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-4">Your Fashion Look</h3>
          <img src={generatedImage} alt="Generated fashion look" className="max-w-md mx-auto rounded-lg shadow" />
        </div>
      )}
    </div>
  )
}

export default Dashboard


