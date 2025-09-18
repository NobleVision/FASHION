import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Dashboard from './pages/Dashboard'
import Categories from './pages/Categories'
import Gallery from './pages/Gallery'
import './App.css'

function App() {
  const [serverStatus, setServerStatus] = useState(null)

  useEffect(() => {
    // Check server health
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setServerStatus(data))
      .catch(err => console.error('Server health check failed:', err))
  }, [])

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Toaster position="top-right" />
        
        {/* Navigation */}
        <nav className="bg-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <Link to="/" className="flex items-center">
                  <h1 className="text-2xl font-bold text-purple-600">FashionForge</h1>
                  <span className="ml-2 text-sm text-gray-500">AI Virtual Wardrobe</span>
                </Link>
              </div>
              
              <div className="flex items-center space-x-8">
                <Link 
                  to="/" 
                  className="text-gray-700 hover:text-purple-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Studio
                </Link>
                <Link 
                  to="/categories" 
                  className="text-gray-700 hover:text-purple-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Categories
                </Link>
                <Link 
                  to="/gallery" 
                  className="text-gray-700 hover:text-purple-600 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Gallery
                </Link>
                
                {/* Server Status Indicator */}
                {serverStatus && (
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      serverStatus.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-xs text-gray-500">
                      {serverStatus.status === 'ok' ? 'Online' : 'Offline'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto py-6 px-4">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/gallery" element={<Gallery />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App