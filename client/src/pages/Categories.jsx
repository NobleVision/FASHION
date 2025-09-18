import React, { useState } from 'react'

const Categories = () => {
  const [activeTab, setActiveTab] = useState('accessories')

  const tabs = [
    { id: 'accessories', name: 'Accessories', icon: '👒' },
    { id: 'pose', name: 'Poses', icon: '🕺' },
    { id: 'location', name: 'Locations', icon: '🏙️' },
    { id: 'makeup', name: 'Makeup', icon: '💄' }
  ]

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Manage Categories
        </h1>
        <p className="text-gray-600">
          Upload and organize your accessories, poses, locations, and makeup options
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm \\${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          <div className="text-center py-12">
            <div className="text-4xl mb-4">
              {tabs.find(tab => tab.id === activeTab)?.icon}
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {tabs.find(tab => tab.id === activeTab)?.name} Management
            </h3>
            <p className="text-gray-500 mb-6">
              Upload and manage your {activeTab} collection
            </p>
            <button className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700">
              + Add New {tabs.find(tab => tab.id === activeTab)?.name.slice(0, -1)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Categories