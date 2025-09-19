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
  const [generationId, setGenerationId] = useState(null)
  const [usedSelections, setUsedSelections] = useState(null) // snapshot of items used for the generated image
  const [videoPrompt, setVideoPrompt] = useState('You are a professional worldwide fashion model in a photo session, seductively posing and modeling with these new clothes in a photo shoot')
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState(null)
  const [saveName, setSaveName] = useState('')

  // Step-by-step mode (beta)
  const [stepMode, setStepMode] = useState(false)
  const steps = ['pose', 'location', 'accessory', 'makeup']
  const [currentStep, setCurrentStep] = useState(null)
  const [stepPreviewUrl, setStepPreviewUrl] = useState(null)
  const [stepLoading, setStepLoading] = useState(false)
  const [chain, setChain] = useState({ base: null, pose: null, location: null, accessory: null, makeup: null })
  const [stepPrompts, setStepPrompts] = useState({ pose: null, location: null, accessory: null, makeup: null })
  const [chainPrompts, setChainPrompts] = useState({ pose: null, location: null, accessory: null, makeup: null })

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
        setGenerationId(data.generationId)
        setGeneratedVideoUrl(null)
        // snapshot the selections actually used
        const findById = (arr, id) => (Array.isArray(arr) ? arr.find((i) => i.id === id) : null)
        const poseObj = findById(categories.pose, selectedItems.pose)
        const locObj = findById(categories.location, selectedItems.location)
        const accObj = selectedItems.accessory ? findById(categories.accessory, selectedItems.accessory) : null
        const makeupObj = selectedItems.makeup ? findById(categories.makeup, selectedItems.makeup) : null
        setUsedSelections({ pose: poseObj, location: locObj, accessory: accObj, makeup: makeupObj })
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


  // Actions for result
  const handleDownloadImage = () => {
    if (!generatedImage) return
    const a = document.createElement('a')
    a.href = generatedImage
    a.download = 'fashionforge-image.jpg'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleSaveGenerationName = async () => {
    if (!generationId) {
      toast.error('No generation to save')
      return
    }
    if (!saveName.trim()) {
      toast.error('Please enter a name')
      return
    }
    try {
      const resp = await fetch(`${API_BASE}/api/save-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, name: saveName.trim() })
      })
      if (!resp.ok) throw new Error('Save failed')
      toast.success('Saved to Gallery')
    } catch (e) {
      console.error('save-generation error:', e)
      toast.error('Failed to save')
    }
  }

  const handleGenerateVideo = async () => {
    if (!generatedImage) {
      toast.error('Generate an image first')
      return
    }
    setIsGeneratingVideo(true)
    setGeneratedVideoUrl(null)
    try {
      const resp = await fetch(`${API_BASE}/api/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: generatedImage, customPrompt: videoPrompt, generationId, plan: 'fast' })
      })
      if (!resp.ok) throw new Error('Video generation failed')
      const data = await resp.json()
      setGeneratedVideoUrl(data.videoUrl)
      toast.success(data.status === 'fallback' ? 'Video ready (fallback used)' : 'Video generated!')
    } catch (e) {
      console.error('generate-video error:', e)
      toast.error('Failed to generate video')
    } finally {
      setIsGeneratingVideo(false)
    }
  }

  // Step-by-step helpers
  // Step-by-step helpers
  const getInputForStep = (step) => {
    if (step === 'pose') return chain.base || uploadedImage
    if (step === 'location') return chain.pose || uploadedImage
    if (step === 'accessory') return chain.location || chain.pose || uploadedImage
    if (step === 'makeup') return chain.accessory || chain.location || chain.pose || uploadedImage
    return uploadedImage
  }

  const callStep = async (step) => {
    const inputImageUrl = getInputForStep(step)
    if (!inputImageUrl) {
      toast.error('Upload an image first')
      return null
    }
    setStepLoading(true)
    try {
      const payload = {
        step,
        inputImageUrl,
        userImageUrl: uploadedImage,
        poseId: selectedItems.pose,
        locationId: selectedItems.location,
        accessoryId: selectedItems.accessory || null,
        makeupId: selectedItems.makeup || null,
      }
      const resp = await fetch(`${API_BASE}/api/generate-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      })
      if (!resp.ok) throw new Error('Step failed')
      const data = await resp.json()
      setStepPreviewUrl(data.imageUrl)
      setCurrentStep(step)
      if (data.prompt) setStepPrompts(prev => ({ ...prev, [step]: data.prompt }))
      return data.imageUrl
    } catch (e) {
      console.error('callStep error', e)
      toast.error('Step failed')
      return null
    } finally {
      setStepLoading(false)
    }
  }

  const startStepByStep = async () => {
    if (!uploadedImage) { toast.error('Please upload an image first'); return }
    if (!selectedItems.pose || !selectedItems.location) { toast.error('Select Pose and Location'); return }
    setGeneratedImage(null)
    setGenerationId(null)
    setGeneratedVideoUrl(null)
    setUsedSelections(null)
    setChain({ base: uploadedImage, pose: null, location: null, accessory: null, makeup: null })
    setStepPrompts({ pose: null, location: null, accessory: null, makeup: null })
    setChainPrompts({ pose: null, location: null, accessory: null, makeup: null })
    await callStep('pose')
  }

  const approveStep = async () => {
    if (!stepPreviewUrl || !currentStep) return
    const nextChain = { ...chain }
    nextChain[currentStep] = stepPreviewUrl
    setChain(nextChain)
    const nextPrompts = { ...chainPrompts }
    nextPrompts[currentStep] = stepPrompts[currentStep] || null
    setChainPrompts(nextPrompts)

    // Determine next step based on selections
    const order = ['pose', 'location', 'accessory', 'makeup']
    const idx = order.indexOf(currentStep)
    const nextCandidates = order.slice(idx + 1)
    const hasSelection = {
      location: Boolean(selectedItems.location),
      accessory: Boolean(selectedItems.accessory),
      makeup: Boolean(selectedItems.makeup),
    }
    const next = nextCandidates.find(s => s === 'location' || (s === 'accessory' && hasSelection.accessory) || (s === 'makeup' && hasSelection.makeup))
    if (next) {
      await callStep(next)
    } else {
      // finished
      setCurrentStep(null)
      setStepPreviewUrl(null)
      const finalUrl = nextChain.makeup || nextChain.accessory || nextChain.location || nextChain.pose || uploadedImage
      setGeneratedImage(finalUrl)
      // Snapshot used selections
      const findById = (arr, id) => (Array.isArray(arr) ? arr.find(i => i.id === id) : null)
      setUsedSelections({
        pose: findById(categories.pose, selectedItems.pose),
        location: findById(categories.location, selectedItems.location),
        accessory: selectedItems.accessory ? findById(categories.accessory, selectedItems.accessory) : null,
        makeup: selectedItems.makeup ? findById(categories.makeup, selectedItems.makeup) : null,
      })
      toast.success('Step-by-step complete')
    }
  }

  const retryStep = async () => {
    if (!currentStep) return
    await callStep(currentStep)
  }

  const restartFrom = async (step) => {
    const base = step === 'pose' ? uploadedImage : (step === 'location' ? chain.pose : (step === 'accessory' ? (chain.location || chain.pose) : (chain.accessory || chain.location || chain.pose)))
    if (!base) { toast.error('No base for this step yet'); return }
    // Clear downstream chain entries
    const nextChain = { ...chain }
    if (step === 'pose') { nextChain.pose = null; nextChain.location = null; nextChain.accessory = null; nextChain.makeup = null }
    else if (step === 'location') { nextChain.location = null; nextChain.accessory = null; nextChain.makeup = null }
    else if (step === 'accessory') { nextChain.accessory = null; nextChain.makeup = null }
    else if (step === 'makeup') { nextChain.makeup = null }
    setChain(nextChain)
    await callStep(step)
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

      {/* Generate + Step-by-step Controls */}
      <div className="text-center mb-8">
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={generateFashionLook}
            disabled={!uploadedImage || isGenerating}
            className="bg-purple-600 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Generate Fashion Look'}
          </button>

          <div className="flex items-center gap-3 mt-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={stepMode} onChange={(e) => setStepMode(e.target.checked)} />
              Step-by-step mode (Beta)
            </label>
            <button
              onClick={startStepByStep}
              disabled={!stepMode || !uploadedImage || stepLoading}
              className="bg-pink-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {stepLoading && currentStep ? `Working ${currentStep}...` : 'Start Step-by-step'}
            </button>
          </div>

          {(currentStep || stepPreviewUrl || chain.pose || chain.location || chain.accessory || chain.makeup) && (
            <div className="w-full md:w-2/3 mt-4 text-left">
              {/* Progress */}
              <div className="flex items-center gap-3 mb-3">
                {['pose','location','accessory','makeup'].map((s) => (
                  <div key={s} className={`text-xs px-2 py-1 rounded-full border ${
                    chain[s] ? 'bg-green-50 text-green-700 border-green-300' : (currentStep===s ? 'bg-yellow-50 text-yellow-700 border-yellow-300' : 'bg-gray-50 text-gray-500 border-gray-300')
                  }`}>
                    {s}
                  </div>
                ))}
              </div>

              {/* Visual chain: Original -> Pose -> Location -> Accessory -> Makeup */}
              <div className="mb-4 overflow-x-auto">
                <div className="flex items-start gap-4">
                  {/* Original */}
                  <div className="min-w-[140px] text-center">
                    <div className="text-xs font-medium mb-1">Original</div>
                    <img src={chain.base || uploadedImage} alt="Original" className="w-32 h-32 object-cover rounded border" />
                    <div className="mt-1 text-[10px] text-gray-500">Uploaded image</div>
                  </div>
                  {/* After Pose */}
                  <div className="min-w-[140px] text-center">
                    <div className="text-xs font-medium mb-1">{`After Pose${(!chain.pose && currentStep==='pose' && stepPreviewUrl) ? ' (preview)' : ''}`}</div>
                    <img src={(chain.pose || (currentStep==='pose' ? stepPreviewUrl : null)) || 'https://placehold.co/128x128/e5e7eb/6b7280?text=Pending'} alt="After Pose" className="w-32 h-32 object-cover rounded border" />
                    {(chain.pose ? chainPrompts.pose : (currentStep==='pose' ? stepPrompts.pose : null)) && (
                      <div className="mt-1 text-[10px] text-gray-600 whitespace-pre-wrap break-words text-left">{(chain.pose ? chainPrompts.pose : stepPrompts.pose)}</div>
                    )}
                  </div>
                  {/* After Location */}
                  <div className="min-w-[140px] text-center">
                    <div className="text-xs font-medium mb-1">{`After Location${(!chain.location && currentStep==='location' && stepPreviewUrl) ? ' (preview)' : ''}`}</div>
                    <img src={(chain.location || (currentStep==='location' ? stepPreviewUrl : null)) || 'https://placehold.co/128x128/e5e7eb/6b7280?text=Pending'} alt="After Location" className="w-32 h-32 object-cover rounded border" />
                    {(chain.location ? chainPrompts.location : (currentStep==='location' ? stepPrompts.location : null)) && (
                      <div className="mt-1 text-[10px] text-gray-600 whitespace-pre-wrap break-words text-left">{(chain.location ? chainPrompts.location : stepPrompts.location)}</div>
                    )}
                  </div>
                  {/* After Accessory */}
                  <div className="min-w-[140px] text-center">
                    <div className="text-xs font-medium mb-1">{`After Accessory${(!chain.accessory && currentStep==='accessory' && stepPreviewUrl) ? ' (preview)' : ''}`}</div>
                    <img src={(chain.accessory || (currentStep==='accessory' ? stepPreviewUrl : null)) || 'https://placehold.co/128x128/e5e7eb/6b7280?text=Pending'} alt="After Accessory" className="w-32 h-32 object-cover rounded border" />
                    {(chain.accessory ? chainPrompts.accessory : (currentStep==='accessory' ? stepPrompts.accessory : null)) && (
                      <div className="mt-1 text-[10px] text-gray-600 whitespace-pre-wrap break-words text-left">{(chain.accessory ? chainPrompts.accessory : stepPrompts.accessory)}</div>
                    )}
                  </div>
                  {/* After Makeup */}
                  <div className="min-w-[140px] text-center">
                    <div className="text-xs font-medium mb-1">{`After Makeup${(!chain.makeup && currentStep==='makeup' && stepPreviewUrl) ? ' (preview)' : ''}`}</div>
                    <img src={(chain.makeup || (currentStep==='makeup' ? stepPreviewUrl : null)) || 'https://placehold.co/128x128/e5e7eb/6b7280?text=Pending'} alt="After Makeup" className="w-32 h-32 object-cover rounded border" />
                    {(chain.makeup ? chainPrompts.makeup : (currentStep==='makeup' ? stepPrompts.makeup : null)) && (
                      <div className="mt-1 text-[10px] text-gray-600 whitespace-pre-wrap break-words text-left">{(chain.makeup ? chainPrompts.makeup : stepPrompts.makeup)}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview + controls */}
              {stepPreviewUrl && (
                <div className="bg-white rounded-lg shadow p-4">
                  <img src={stepPreviewUrl} alt="Step preview" className="w-full rounded" />
                  <div className="mt-3 flex gap-2">
                    <button onClick={approveStep} disabled={stepLoading} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50">Approve & Continue</button>
                    <button onClick={retryStep} disabled={stepLoading} className="bg-gray-200 text-gray-800 px-4 py-2 rounded">Retry</button>
                  </div>
                </div>
              )}

              {/* Restart from links */}
              <div className="mt-2 text-xs text-gray-500">
                Restart from:
                {chain.pose && <button className="ml-2 underline" onClick={() => restartFrom('pose')}>Pose</button>}
                {chain.location && <button className="ml-2 underline" onClick={() => restartFrom('location')}>Location</button>}
                {chain.accessory && <button className="ml-2 underline" onClick={() => restartFrom('accessory')}>Accessory</button>}
                {chain.makeup && <button className="ml-2 underline" onClick={() => restartFrom('makeup')}>Makeup</button>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Generated Result */}
      {generatedImage && (
        <div className="text-center">
          <h3 className="text-xl font-semibold mb-4">Your Fashion Look</h3>
          <img src={generatedImage} alt="Generated fashion look" className="max-w-md mx-auto rounded-lg shadow" />

          {/* Selected Items Summary */}
          {usedSelections && (
            <div className="mt-6 bg-white rounded-lg shadow p-4 text-left">
              <h4 className="font-semibold mb-3">Selected Items Used</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {usedSelections.pose && (
                  <div className="border rounded p-2">
                    <div className="text-sm text-gray-600 mb-1">Pose</div>
                    <img src={usedSelections.pose.url || 'https://placehold.co/100x80?text=Pose'} alt={usedSelections.pose.name} className="w-full h-20 object-cover rounded" />
                    <div className="text-sm mt-1 truncate" title={usedSelections.pose.name}>{usedSelections.pose.name}</div>
                  </div>
                )}
                {usedSelections.location && (
                  <div className="border rounded p-2">
                    <div className="text-sm text-gray-600 mb-1">Location</div>
                    <img src={usedSelections.location.url || 'https://placehold.co/100x80?text=Location'} alt={usedSelections.location.name} className="w-full h-20 object-cover rounded" />
                    <div className="text-sm mt-1 truncate" title={usedSelections.location.name}>{usedSelections.location.name}</div>
                  </div>
                )}
                {usedSelections.accessory && (
                  <div className="border rounded p-2">
                    <div className="text-sm text-gray-600 mb-1">Accessory</div>
                    <img src={usedSelections.accessory.url || 'https://placehold.co/100x80?text=Accessory'} alt={usedSelections.accessory.name} className="w-full h-20 object-cover rounded" />
                    <div className="text-sm mt-1 truncate" title={usedSelections.accessory.name}>{usedSelections.accessory.name}</div>
                  </div>
                )}
                {usedSelections.makeup && (
                  <div className="border rounded p-2">
                    <div className="text-sm text-gray-600 mb-1">Makeup</div>
                    <img src={usedSelections.makeup.url || 'https://placehold.co/100x80?text=Makeup'} alt={usedSelections.makeup.name} className="w-full h-20 object-cover rounded" />
                    <div className="text-sm mt-1 truncate" title={usedSelections.makeup.name}>{usedSelections.makeup.name}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
              <button onClick={handleDownloadImage} className="bg-gray-900 text-white px-4 py-2 rounded hover:bg-black">Download Image</button>
              <div className="flex items-center gap-2">
                <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this creation" className="border rounded px-3 py-2 w-56" />
                <button onClick={handleSaveGenerationName} disabled={!generationId} className="bg-purple-600 text-white px-4 py-2 rounded disabled:opacity-50">Save</button>
              </div>
            </div>

            <div className="w-full md:w-2/3 bg-white rounded-lg shadow p-4 text-left">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">Animate with Veo 3</h4>
                {isGeneratingVideo && <span className="text-sm text-purple-600">Generating video...</span>}
              </div>
              <textarea
                className="w-full border rounded p-2 text-sm"
                rows={3}
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
              />
              <div className="mt-2">
                <button onClick={handleGenerateVideo} disabled={isGeneratingVideo} className="bg-pink-600 text-white px-4 py-2 rounded disabled:opacity-50">
                  {isGeneratingVideo ? 'Animating...' : 'Animate with Veo 3'}
                </button>
              </div>

              {generatedVideoUrl && (
                <div className="mt-4">
                  <video src={generatedVideoUrl} controls className="w-full rounded-lg shadow"></video>
                  <div className="mt-2 flex gap-2">
                    <a href={generatedVideoUrl} download className="bg-gray-800 text-white px-3 py-1 rounded">Download Video</a>
                    <a href={generatedVideoUrl} target="_blank" rel="noreferrer" className="bg-gray-200 text-gray-800 px-3 py-1 rounded">Open</a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard


