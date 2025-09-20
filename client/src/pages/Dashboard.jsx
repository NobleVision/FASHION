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
  // Inline and toastable messages for rate limiting/retries
  const [stepMessages, setStepMessages] = useState([])
  const [stepRateLimited, setStepRateLimited] = useState(false)

  // Bulk selection and per-item loading for category management
  const [bulkSelected, setBulkSelected] = useState({ accessory: [], pose: [], location: [], makeup: [] })
  const [loadingKeys, setLoadingKeys] = useState(new Set())
  const keyFor = (type, id, action = 'op') => `${type}:${id}:${action}`
  const setItemLoading = (type, id, action, on) => {
    setLoadingKeys((prev) => {
      const next = new Set(prev)
      const k = keyFor(type, id, action)
      if (on) next.add(k); else next.delete(k)
      return next
    })
  }
  const isItemLoading = (type, id) => {
    const base = `${type}:${id}:`
    for (const k of loadingKeys) if (k.startsWith(base)) return true
    return false
  }

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
  // Delete a single previous upload (optimistic)
  const deletePreviousImage = async (publicId) => {
    if (!publicId) return
    const confirmed = window.confirm('Delete this previous upload? This cannot be undone.')
    if (!confirmed) return
    const backup = previousImages
    setPreviousImages((imgs) => imgs.filter((img) => String(img.id) !== String(publicId)))
    try {
      const resp = await fetch(`${API_BASE}/api/uploaded-images/${encodeURIComponent(publicId)}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error(await resp.text())
      toast.success('Previous upload deleted')
      await fetchPreviousImages()
    } catch (e) {
      console.error('deletePreviousImage error:', e)
      setPreviousImages(backup)
      toast.error('Failed to delete upload')
    }
  }

  // Clear all previous uploads (optimistic)
  const clearAllPreviousImages = async () => {
    if (!previousImages.length) return
    const confirmed = window.confirm('Delete ALL previous uploads from Cloudinary? This cannot be undone.')
    if (!confirmed) return
    const backup = previousImages
    setPreviousImages([])
    try {
      const resp = await fetch(`${API_BASE}/api/uploaded-images/clear`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      if (!resp.ok) throw new Error(await resp.text())
      toast.success('All previous uploads cleared')
      await fetchPreviousImages()
    } catch (e) {
      console.error('clearAllPreviousImages error:', e)
      setPreviousImages(backup)
      toast.error('Failed to clear previous uploads')
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
        // Show any server-provided retry/rate-limit messages
        if (Array.isArray(data.messages) && data.messages.length) {
          data.messages.forEach((m) => {
            const isFinalError = /Rate limit exceeded/i.test(m) || data.rateLimited
            if (isFinalError) toast.error(m, { duration: Infinity })
            else toast(m, { icon: '\u23f3', duration: 3000 })
          })
        }
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
  const getInputForStep = (step, currentChain = chain) => {
    if (step === 'pose') return currentChain.base || uploadedImage
    if (step === 'location') return currentChain.pose || uploadedImage
    if (step === 'accessory') return currentChain.location || currentChain.pose || uploadedImage
    if (step === 'makeup') return currentChain.accessory || currentChain.location || currentChain.pose || uploadedImage
    return uploadedImage
  }

  const callStep = async (step) => {
    const inputImageUrl = getInputForStep(step)
    if (!inputImageUrl) {
      toast.error('Upload an image first')
      return null
    }
    setStepMessages([])
    setStepRateLimited(false)
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
      console.log('Step payload →', payload)
      const resp = await fetch(`${API_BASE}/api/generate-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      })
      if (!resp.ok) throw new Error('Step failed')
      const data = await resp.json()

      // Handle rate limit / retry messages from server
      const msgs = Array.isArray(data.messages) ? data.messages : []
      setStepMessages(msgs)
      if (msgs.length) {
        msgs.forEach((m) => {
          // Intermediate retry info as ephemeral toasts
          const isFinalError = /Rate limit exceeded/i.test(m) || data.rateLimited
          if (isFinalError) {
            toast.error(m, { duration: Infinity })
          } else {
            toast(m, { icon: '⏳', duration: 3000 })
          }
        })
      }
      if (data.rateLimited && !data.imageUrl) {
        setStepRateLimited(true)
      }

      setStepPreviewUrl(data.imageUrl)
      setCurrentStep(step)
      if (data.prompt) setStepPrompts(prev => ({ ...prev, [step]: data.prompt }))

      // Auto-approve and continue to the next step
      await autoAdvanceFromStep(step, data.imageUrl, data.prompt)
      return data.imageUrl
    } catch (e) {
      console.error('callStep error', e)
      toast.error('Step failed')
      return null
    } finally {
      setStepLoading(false)
    }
  }

  const callStepWithChain = async (step, currentChain) => {
    const inputImageUrl = getInputForStep(step, currentChain)
    if (!inputImageUrl) {
      toast.error('Upload an image first')
      return null
    }
    setStepMessages([])
    setStepRateLimited(false)
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
      console.log('Step payload →', payload)
      const resp = await fetch(`${API_BASE}/api/generate-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      })
      if (!resp.ok) throw new Error('Step failed')
      const data = await resp.json()

      // Handle rate limit / retry messages from server
      const msgs = Array.isArray(data.messages) ? data.messages : []
      setStepMessages(msgs)
      if (msgs.length) {
        msgs.forEach((m) => {
          // Intermediate retry info as ephemeral toasts
          const isFinalError = /Rate limit exceeded/i.test(m) || data.rateLimited
          if (isFinalError) {
            toast.error(m, { duration: Infinity })
          } else {
            toast(m, { icon: '⏳', duration: 3000 })
          }
        })
      }
      if (data.rateLimited && !data.imageUrl) {
        setStepRateLimited(true)
      }

      setStepPreviewUrl(data.imageUrl)
      setCurrentStep(step)
      if (data.prompt) setStepPrompts(prev => ({ ...prev, [step]: data.prompt }))

      // Auto-approve and continue to the next step
      await autoAdvanceFromStep(step, data.imageUrl, data.prompt)
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
    const initialChain = { base: uploadedImage, pose: null, location: null, accessory: null, makeup: null }
    setChain(initialChain)
    setStepPrompts({ pose: null, location: null, accessory: null, makeup: null })
    setChainPrompts({ pose: null, location: null, accessory: null, makeup: null })
    // Kick off with the explicit initial chain to avoid any state timing issues
    await callStepWithChain('pose', initialChain)
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
      // Pass the freshly updated chain to avoid stale state
      await callStepWithChain(next, nextChain)
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


  // Automatically approve a finished step and continue the chain
  const autoAdvanceFromStep = async (step, imageUrl, prompt) => {
    try {
      if (!imageUrl) return

      // Create the updated chain state with the new step result
      const updatedChain = { ...chain, [step]: imageUrl }

      // Persist the step result into the chain state
      setChain(updatedChain)
      if (prompt) setChainPrompts((prev) => ({ ...prev, [step]: prompt }))

      // Work out the next step based on user selections
      const order = ['pose', 'location', 'accessory', 'makeup']
      const idx = order.indexOf(step)
      const nextCandidates = order.slice(idx + 1)
      const hasSelection = {
        location: Boolean(selectedItems.location),
        accessory: Boolean(selectedItems.accessory),
        makeup: Boolean(selectedItems.makeup),
      }
      const next = nextCandidates.find((s) => s === 'location' || (s === 'accessory' && hasSelection.accessory) || (s === 'makeup' && hasSelection.makeup))

      if (next) {
        // Pass the updated chain to ensure proper chaining
        await callStepWithChain(next, updatedChain)
      } else {
        // Finished chain — finalize UI and snapshot selections
        setCurrentStep(null)
        setStepPreviewUrl(null)
        const finalUrl = imageUrl || (updatedChain.makeup || updatedChain.accessory || updatedChain.location || updatedChain.pose || uploadedImage)
        setGeneratedImage(finalUrl)
        const findById = (arr, id) => (Array.isArray(arr) ? arr.find((i) => i.id === id) : null)
        setUsedSelections({
          pose: findById(categories.pose, selectedItems.pose),
          location: findById(categories.location, selectedItems.location),
          accessory: selectedItems.accessory ? findById(categories.accessory, selectedItems.accessory) : null,
          makeup: selectedItems.makeup ? findById(categories.makeup, selectedItems.makeup) : null,
        })
        toast.success('Step-by-step complete')
      }
    } catch (e) {
      console.error('autoAdvanceFromStep error', e)
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
    // Ensure we use the updated chain explicitly
    await callStepWithChain(step, nextChain)
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

  // Category item management handlers
  const toggleBulkSelect = (type, id) => {
    setBulkSelected(prev => {
      const set = new Set(prev[type] || [])
      const key = String(id)
      if (set.has(key)) set.delete(key); else set.add(key)
      return { ...prev, [type]: Array.from(set) }
    })
  }

  const clearBulkSelect = (type) => setBulkSelected(prev => ({ ...prev, [type]: [] }))

  const promptReplace = (type, id) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0]
      if (file) replaceItemWithFile(type, id, file)
    }
    input.click()
  }

  const replaceItemWithFile = async (type, id, file) => {
    try {
      setItemLoading(type, id, 'replace', true)
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(String(e.target.result).split(',')[1] || '')
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const resp = await fetch(`${API_BASE}/api/categories/${encodeURIComponent(type)}/${encodeURIComponent(id)}/replace-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64, mimeType: file.type || 'image/jpeg' })
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      const updated = data.item
      if (updated?.url) {
        setCategories(prev => ({ ...prev, [type]: (prev[type] || []).map(it => String(it.id) === String(id) ? { ...it, url: updated.url } : it) }))
      }
      toast.success('Image replaced')
    } catch (e) {
      console.error('replaceItemWithFile error:', e)
      toast.error('Failed to replace image')
    } finally {
      setItemLoading(type, id, 'replace', false)
    }
  }

  const regenerateItem = async (type, id) => {
    const confirmed = window.confirm('Regenerate image for this item?')
    if (!confirmed) return
    try {
      setItemLoading(type, id, 'regen', true)
      const resp = await fetch(`${API_BASE}/api/categories/${encodeURIComponent(type)}/${encodeURIComponent(id)}/regenerate-image`, { method: 'POST' })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      const updated = data.item
      if (updated?.url) {
        setCategories(prev => ({ ...prev, [type]: (prev[type] || []).map(it => String(it.id) === String(id) ? { ...it, url: updated.url } : it) }))
      }
      // Show any retry messages
      const msgs = Array.isArray(data.messages) ? data.messages : []
      msgs.forEach(m => toast(m, { icon: '⏳', duration: 2500 }))
      if (data.rateLimited) toast.error('Rate limited during regeneration')
      toast.success('Regenerated')
    } catch (e) {
      console.error('regenerateItem error:', e)
      toast.error('Failed to regenerate')
    } finally {
      setItemLoading(type, id, 'regen', false)
    }
  }

  const deleteItem = async (type, id) => {
    const confirmed = window.confirm('Delete this item from the database?')
    if (!confirmed) return
    const backup = categories[type]
    setCategories(prev => ({ ...prev, [type]: (prev[type] || []).filter(it => String(it.id) !== String(id)) }))
    try {
      const resp = await fetch(`${API_BASE}/api/categories/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error(await resp.text())
      toast.success('Item deleted')
    } catch (e) {
      console.error('deleteItem error:', e)
      setCategories(prev => ({ ...prev, [type]: backup }))
      toast.error('Failed to delete item')
    }
  }

  const bulkDelete = async (type) => {
    const ids = (bulkSelected[type] || []).map(String)
    if (!ids.length) return
    const confirmed = window.confirm(`Delete ${ids.length} selected item(s)?`)
    if (!confirmed) return
    const backup = categories[type]
    setCategories(prev => ({ ...prev, [type]: (prev[type] || []).filter(it => !ids.includes(String(it.id))) }))
    try {
      const resp = await fetch(`${API_BASE}/api/categories/${encodeURIComponent(type)}/bulk`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', ids })
      })
      if (!resp.ok) throw new Error(await resp.text())
      toast.success('Selected items deleted')
      clearBulkSelect(type)
      await fetchCategories()
    } catch (e) {
      console.error('bulkDelete error:', e)
      setCategories(prev => ({ ...prev, [type]: backup }))
      toast.error('Failed bulk delete')
    }
  }

  const bulkRegenerate = async (type) => {
    const ids = (bulkSelected[type] || []).map(String)
    if (!ids.length) return
    const confirmed = window.confirm(`Regenerate ${ids.length} selected item(s)? This may take a while.`)
    if (!confirmed) return
    try {
      // mark loading on each
      ids.forEach(id => setItemLoading(type, id, 'regen', true))
      const resp = await fetch(`${API_BASE}/api/categories/${encodeURIComponent(type)}/bulk`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'regenerate', ids })
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      const results = Array.isArray(data.results) ? data.results : []
      if (results.length) {
        setCategories(prev => ({
          ...prev,
          [type]: (prev[type] || []).map(it => {
            const r = results.find(r => String(r.id) === String(it.id))
            return r && r.url ? { ...it, url: r.url } : it
          })
        }))
      }
      toast.success('Regenerated selected items')
      clearBulkSelect(type)
    } catch (e) {
      console.error('bulkRegenerate error:', e)
      toast.error('Failed bulk regenerate')
    } finally {
      ids.forEach(id => setItemLoading(type, id, 'regen', false))
      await fetchCategories()
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
        {itemsArray.map((item) => {
          const checked = (bulkSelected[type] || []).map(String).includes(String(item.id))
          const loading = isItemLoading(type, item.id)
          return (
            <div
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`relative cursor-pointer border-2 rounded-lg p-2 transition-all ${
                selectedItems.includes(item.id)
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
            >
              {/* Bulk select checkbox */}
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => { e.stopPropagation(); toggleBulkSelect(type, item.id) }}
                className="absolute top-1 left-1 h-4 w-4 accent-purple-600"
                title="Select for bulk actions"
              />

              {/* Item actions (compact icon buttons) */}
              <div className="absolute top-1 right-1 flex gap-1">
                {/* Replace */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); promptReplace(type, item.id) }}
                  className="inline-flex items-center justify-center w-6 h-6 text-[13px] leading-none bg-white/90 border rounded-full shadow-sm hover:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  title="Replace image"
                  aria-label="Replace image"
                >
                  📷
                </button>
                {/* Regenerate */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); regenerateItem(type, item.id) }}
                  className="inline-flex items-center justify-center w-6 h-6 text-[13px] leading-none bg-white/90 border rounded-full shadow-sm hover:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  title="Regenerate image"
                  aria-label="Regenerate image"
                >
                  🔄
                </button>
                {/* Delete */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteItem(type, item.id) }}
                  className="inline-flex items-center justify-center w-6 h-6 text-[13px] leading-none bg-white/90 border rounded-full shadow-sm text-red-600 hover:text-red-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                  title="Delete item"
                  aria-label="Delete item"
                >
                  🗑️
                </button>
              </div>

              {loading && (
                <div className="absolute inset-0 bg-white/60 flex items-center justify-center text-xs font-medium">
                  Working...
                </div>
              )}

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
          )
        })}
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Select from Previous Uploads:</h3>
              <button
                onClick={clearAllPreviousImages}
                className="text-xs text-red-600 hover:text-red-700 underline"
                title="Clear all previous uploads"
              >
                Clear All Previous Uploads
              </button>
            </div>
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {previousImages.map((image) => (
                <div
                  key={image.id}
                  onClick={() => setUploadedImage(image.url)}
                  className={`relative cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${
                    uploadedImage === image.url
                      ? 'border-purple-500 ring-2 ring-purple-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deletePreviousImage(image.id) }}
                    className="absolute top-1 right-1 bg-white/90 text-red-600 hover:text-red-700 rounded-full w-5 h-5 flex items-center justify-center shadow"
                    title="Delete this upload"
                  >
                    ×
                  </button>
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
            <h3 className="text-lg font-semibold capitalize">{type}</h3>
            <div className="flex items-center justify-between mb-3 mt-1">
              <div className="text-xs text-gray-500">
                {(bulkSelected[type] && bulkSelected[type].length > 0) ? `${bulkSelected[type].length} selected` : ''}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => bulkRegenerate(type)}
                  disabled={!bulkSelected[type] || bulkSelected[type].length === 0}
                  className="text-xs px-2 py-1 rounded border bg-white disabled:opacity-50"
                  title="Regenerate images for selected items"
                >
                  Regenerate Selected
                </button>
                <button
                  onClick={() => bulkDelete(type)}
                  disabled={!bulkSelected[type] || bulkSelected[type].length === 0}
                  className="text-xs px-2 py-1 rounded border bg-white text-red-600 disabled:opacity-50"
                  title="Delete selected items"
                >
                  Delete Selected
                </button>
              </div>
            </div>
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
                <div className="flex items-start gap-6">

                  {/* Original */}
                  <div className="min-w-[160px] text-center">
                    <div className="text-xs font-medium mb-1">Original</div>
                    <img src={chain.base || uploadedImage} alt="Original" className="w-32 h-32 object-cover rounded border" />
                    <div className="mt-1 text-[10px] text-gray-500">Uploaded image</div>
                  </div>

                  {/* After Pose */}
                  <div className="min-w-[200px] text-center">
                    <div className="text-xs font-medium mb-1">{`After Pose${(!chain.pose && currentStep==='pose' && stepPreviewUrl) ? ' (preview)' : ''}`}</div>
                    <img src={(chain.pose || (currentStep==='pose' ? stepPreviewUrl : null)) || 'https://placehold.co/128x128/e5e7eb/6b7280?text=Pending'} alt="After Pose" className="w-32 h-32 object-cover rounded border mx-auto" />
                    {/* Reference thumbnail */}
                    {(() => { const ref = (categories.pose || []).find(i => String(i.id) === String(selectedItems.pose)); return ref ? (
                      <div className="mt-2 text-[10px] text-gray-600">
                        <div className="mb-1">Using:</div>
                        <img src={ref.url || 'https://placehold.co/80x80?text=Ref'} alt={ref.name} className="w-16 h-16 object-cover rounded border mx-auto" />
                      </div>
                    ) : null })()}
                    {(chain.pose ? chainPrompts.pose : (currentStep==='pose' ? stepPrompts.pose : null)) && (
                      <div className="mt-1 text-[10px] text-gray-600 whitespace-pre-wrap break-words text-left">{(chain.pose ? chainPrompts.pose : stepPrompts.pose)}</div>
                    )}

                    {/* Retry / rate-limit inline notices */}
                    {(stepMessages.length > 0 || stepRateLimited) && (
                      <div className="mb-3 space-y-1">
                        {stepMessages.map((m, i) => (
                          <div key={i} className="text-xs px-2 py-1 rounded border border-yellow-300 bg-yellow-50 text-yellow-800">
                            {m}
                          </div>
                        ))}
                        {stepRateLimited && (
                          <div className="text-xs px-2 py-1 rounded border border-red-300 bg-red-50 text-red-700 flex items-center justify-between">
                            <span>Rate limit exceeded. Please try again in a few minutes.</span>
                            <button className="ml-2 underline" onClick={() => { setStepRateLimited(false) }}>Dismiss</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* After Location */}
                  <div className="min-w-[200px] text-center">
                    <div className="text-xs font-medium mb-1">{`After Location${(!chain.location && currentStep==='location' && stepPreviewUrl) ? ' (preview)' : ''}`}</div>
                    <img src={(chain.location || (currentStep==='location' ? stepPreviewUrl : null)) || 'https://placehold.co/128x128/e5e7eb/6b7280?text=Pending'} alt="After Location" className="w-32 h-32 object-cover rounded border mx-auto" />
                    {(() => { const ref = (categories.location || []).find(i => String(i.id) === String(selectedItems.location)); return ref ? (
                      <div className="mt-2 text-[10px] text-gray-600">
                        <div className="mb-1">Using:</div>
                        <img src={ref.url || 'https://placehold.co/80x80?text=Ref'} alt={ref.name} className="w-16 h-16 object-cover rounded border mx-auto" />
                      </div>
                    ) : null })()}
                    {(chain.location ? chainPrompts.location : (currentStep==='location' ? stepPrompts.location : null)) && (
                      <div className="mt-1 text-[10px] text-gray-600 whitespace-pre-wrap break-words text-left">{(chain.location ? chainPrompts.location : stepPrompts.location)}</div>
                    )}
                  </div>

                  {/* After Accessory */}
                  <div className="min-w-[200px] text-center">
                    <div className="text-xs font-medium mb-1">{`After Accessory${(!chain.accessory && currentStep==='accessory' && stepPreviewUrl) ? ' (preview)' : ''}`}</div>
                    <img src={(chain.accessory || (currentStep==='accessory' ? stepPreviewUrl : null)) || 'https://placehold.co/128x128/e5e7eb/6b7280?text=Pending'} alt="After Accessory" className="w-32 h-32 object-cover rounded border mx-auto" />
                    {(() => { const ref = selectedItems.accessory ? (categories.accessory || []).find(i => String(i.id) === String(selectedItems.accessory)) : null; return ref ? (
                      <div className="mt-2 text-[10px] text-gray-600">
                        <div className="mb-1">Using:</div>
                        <img src={ref.url || 'https://placehold.co/80x80?text=Ref'} alt={ref.name} className="w-16 h-16 object-cover rounded border mx-auto" />
                      </div>
                    ) : null })()}
                    {(chain.accessory ? chainPrompts.accessory : (currentStep==='accessory' ? stepPrompts.accessory : null)) && (
                      <div className="mt-1 text-[10px] text-gray-600 whitespace-pre-wrap break-words text-left">{(chain.accessory ? chainPrompts.accessory : stepPrompts.accessory)}</div>
                    )}
                  </div>

                  {/* After Makeup */}
                  <div className="min-w-[200px] text-center">
                    <div className="text-xs font-medium mb-1">{`After Makeup${(!chain.makeup && currentStep==='makeup' && stepPreviewUrl) ? ' (preview)' : ''}`}</div>
                    <img src={(chain.makeup || (currentStep==='makeup' ? stepPreviewUrl : null)) || 'https://placehold.co/128x128/e5e7eb/6b7280?text=Pending'} alt="After Makeup" className="w-32 h-32 object-cover rounded border mx-auto" />
                    {(() => { const ref = selectedItems.makeup ? (categories.makeup || []).find(i => String(i.id) === String(selectedItems.makeup)) : null; return ref ? (
                      <div className="mt-2 text-[10px] text-gray-600">
                        <div className="mb-1">Using:</div>
                        <img src={ref.url || 'https://placehold.co/80x80?text=Ref'} alt={ref.name} className="w-16 h-16 object-cover rounded border mx-auto" />
                      </div>
                    ) : null })()}
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


