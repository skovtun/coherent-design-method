# BMAD Few-Shot Examples

Эти примеры показывают ожидаемый уровень качества для типичных запросов. Используй их как reference для staged generation или few-shot prompting.

---

## Example 1: API Portal Dashboard

**User Request:**
"Create an API portal dashboard with API key management and usage statistics"

**Expected Output:**

```jsx
import React, { useState } from 'react';
import { 
  Key, Copy, Eye, EyeOff, Plus, Trash2, Check,
  Activity, Zap, CheckCircle, AlertCircle, Clock,
  BarChart3, TrendingUp, Bell, Search, Settings,
  ExternalLink, BookOpen, Code, HelpCircle
} from 'lucide-react';

export default function APIDashboard() {
  const [copiedKey, setCopiedKey] = useState(null);
  const [visibleKeys, setVisibleKeys] = useState({});

  const copyToClipboard = (key, id) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleKeyVisibility = (id) => {
    setVisibleKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const apiKeys = [
    { id: 1, name: 'Production', key: 'sk_live_a8f2k9d4m7n3p1q6', created: 'Jan 15, 2025', lastUsed: '2 min ago', status: 'active', requests: '45,231' },
    { id: 2, name: 'Staging', key: 'sk_test_b3g7h2j5l8m4n9p2', created: 'Dec 8, 2024', lastUsed: '3 hours ago', status: 'active', requests: '12,847' },
    { id: 3, name: 'Development', key: 'sk_dev_c1d6e9f3g8h2i5j7', created: 'Nov 20, 2024', lastUsed: 'Yesterday', status: 'active', requests: '8,392' },
  ];

  const stats = [
    { label: 'Total Requests', value: '847,293', change: '+12.5%', trend: 'up', icon: Activity },
    { label: 'Success Rate', value: '99.87%', change: '+0.12%', trend: 'up', icon: CheckCircle },
    { label: 'Avg Latency', value: '124ms', change: '-18ms', trend: 'up', icon: Zap },
    { label: 'Active Keys', value: '3', change: '', trend: 'neutral', icon: Key },
  ];

  const recentActivity = [
    { action: 'API key regenerated', detail: 'Production key', time: '2 hours ago', icon: Key },
    { action: 'Rate limit increased', detail: '10k → 50k req/min', time: '1 day ago', icon: TrendingUp },
    { action: 'New endpoint accessed', detail: 'POST /v1/embeddings', time: '2 days ago', icon: Code },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-slate-900">Acme API</span>
              </div>
              
              <nav className="flex gap-1">
                <a href="#" className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg">
                  Dashboard
                </a>
                <a href="#" className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                  Documentation
                </a>
                <a href="#" className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                  Usage
                </a>
                <a href="#" className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                  Settings
                </a>
              </nav>
            </div>
            
            <div className="flex items-center gap-3">
              <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <Search className="w-5 h-5" />
              </button>
              <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
              </button>
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full ring-2 ring-white" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">Welcome back, Alex</h1>
          <p className="text-slate-500 mt-1">Monitor your API usage and manage access keys.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <stat.icon className="w-5 h-5 text-slate-400" />
                {stat.change && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    stat.trend === 'up' ? 'text-emerald-700 bg-emerald-50' :
                    stat.trend === 'down' ? 'text-red-700 bg-red-50' :
                    'text-slate-600 bg-slate-100'
                  }`}>
                    {stat.change}
                  </span>
                )}
              </div>
              <div className="text-2xl font-semibold text-slate-900">{stat.value}</div>
              <div className="text-sm text-slate-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* API Keys */}
          <div className="col-span-2 bg-white border border-slate-200 rounded-xl">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">API Keys</h2>
                <p className="text-sm text-slate-500">Manage keys for different environments</p>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">
                <Plus className="w-4 h-4" />
                Create Key
              </button>
            </div>
            
            <div className="divide-y divide-slate-100">
              {apiKeys.map((apiKey) => (
                <div key={apiKey.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${apiKey.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <div>
                      <div className="font-medium text-slate-900">{apiKey.name}</div>
                      <div className="text-sm text-slate-500 font-mono mt-0.5">
                        {visibleKeys[apiKey.id] ? apiKey.key : apiKey.key.slice(0, 12) + '••••••••'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Requests</div>
                      <div className="text-sm font-medium text-slate-700">{apiKey.requests}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Last used</div>
                      <div className="text-sm text-slate-600">{apiKey.lastUsed}</div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => toggleKeyVisibility(apiKey.id)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        {visibleKeys[apiKey.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => copyToClipboard(apiKey.key, apiKey.id)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        {copiedKey === apiKey.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <button className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Start */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Quick Start</h3>
              <div className="space-y-2">
                <a href="#" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors group">
                  <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-slate-200 transition-colors">
                    <BookOpen className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">Documentation</div>
                    <div className="text-xs text-slate-500">Learn the API basics</div>
                  </div>
                </a>
                <a href="#" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors group">
                  <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-slate-200 transition-colors">
                    <Code className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">Code Examples</div>
                    <div className="text-xs text-slate-500">Python, Node.js, Go, cURL</div>
                  </div>
                </a>
                <a href="#" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors group">
                  <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-slate-200 transition-colors">
                    <HelpCircle className="w-4 h-4 text-slate-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">Support</div>
                    <div className="text-xs text-slate-500">Get help from our team</div>
                  </div>
                </a>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">Recent Activity</h3>
              <div className="space-y-4">
                {recentActivity.map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <item.icon className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900">{item.action}</div>
                      <div className="text-xs text-slate-500">{item.detail}</div>
                    </div>
                    <div className="text-xs text-slate-400 whitespace-nowrap">{item.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Usage Chart */}
        <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">API Usage</h2>
              <p className="text-sm text-slate-500">Request volume over the last 30 days</p>
            </div>
            <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:border-slate-300 transition-colors">
              <option>Last 30 days</option>
              <option>Last 7 days</option>
              <option>Last 24 hours</option>
            </select>
          </div>
          
          <div className="h-64 flex items-end gap-1">
            {[35, 42, 58, 45, 72, 68, 82, 75, 90, 85, 78, 92, 88, 95, 82, 70, 65, 78, 85, 92, 88, 76, 82, 90, 95, 88, 82, 78, 85, 92].map((height, i) => (
              <div 
                key={i}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 rounded-t transition-colors cursor-pointer"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
            <span>Jan 5</span>
            <span>Jan 12</span>
            <span>Jan 19</span>
            <span>Jan 26</span>
            <span>Feb 4</span>
          </div>
        </div>
      </main>
    </div>
  );
}
```

---

## Example 2: Settings Page

**User Request:**
"Create a settings page with profile, security, and billing sections"

**Expected Output:**

```jsx
import React, { useState } from 'react';
import { 
  User, Shield, CreditCard, Bell, Key, Users,
  Camera, Check, Eye, EyeOff, Smartphone, Laptop,
  Globe, Mail, AlertCircle
} from 'lucide-react';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile');
  const [showPassword, setShowPassword] = useState(false);

  const navItems = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'api', label: 'API Keys', icon: Key },
    { id: 'team', label: 'Team', icon: Users },
  ];

  const sessions = [
    { device: 'MacBook Pro', location: 'San Francisco, CA', current: true, icon: Laptop },
    { device: 'iPhone 15', location: 'San Francisco, CA', current: false, icon: Smartphone },
    { device: 'Chrome on Windows', location: 'New York, NY', current: false, icon: Globe },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center h-16">
            <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <nav className="w-56 shrink-0">
            <div className="space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    activeSection === item.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Content Area */}
          <div className="flex-1 max-w-2xl">
            {/* Profile Section */}
            {activeSection === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Profile</h2>
                  <p className="text-sm text-slate-500 mt-1">Manage your public profile information.</p>
                </div>

                {/* Avatar */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-semibold">
                        AS
                      </div>
                      <button className="absolute bottom-0 right-0 p-1.5 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-colors">
                        <Camera className="w-4 h-4 text-slate-600" />
                      </button>
                    </div>
                    <div>
                      <h3 className="font-medium text-slate-900">Profile Photo</h3>
                      <p className="text-sm text-slate-500 mt-0.5">JPG, GIF or PNG. Max 2MB.</p>
                      <button className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
                        Upload new photo
                      </button>
                    </div>
                  </div>
                </div>

                {/* Form */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">First name</label>
                      <input 
                        type="text" 
                        defaultValue="Alex"
                        className="w-full px-3 h-10 text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Last name</label>
                      <input 
                        type="text" 
                        defaultValue="Smith"
                        className="w-full px-3 h-10 text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Email</label>
                    <input 
                      type="email" 
                      defaultValue="alex.smith@company.com"
                      className="w-full px-3 h-10 text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                    />
                    <p className="text-xs text-slate-500">This is also your login email.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Bio</label>
                    <textarea 
                      rows={3}
                      defaultValue="Product designer based in San Francisco. I love building beautiful interfaces and great user experiences."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors resize-none"
                    />
                    <p className="text-xs text-slate-500">Brief description for your profile. Max 200 characters.</p>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Security Section */}
            {activeSection === 'security' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Security</h2>
                  <p className="text-sm text-slate-500 mt-1">Manage your account security and authentication.</p>
                </div>

                {/* Password */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h3 className="font-medium text-slate-900">Change Password</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Update your password to keep your account secure.</p>
                  
                  <div className="mt-4 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Current password</label>
                      <div className="relative">
                        <input 
                          type={showPassword ? 'text' : 'password'} 
                          className="w-full px-3 h-10 pr-10 text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                        />
                        <button 
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">New password</label>
                      <input 
                        type="password" 
                        className="w-full px-3 h-10 text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                      />
                      <p className="text-xs text-slate-500">Minimum 8 characters with a number and symbol.</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Confirm new password</label>
                      <input 
                        type="password" 
                        className="w-full px-3 h-10 text-sm border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                      />
                    </div>
                    <div className="pt-2">
                      <button className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">
                        Update Password
                      </button>
                    </div>
                  </div>
                </div>

                {/* Two-Factor */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-slate-900">Two-Factor Authentication</h3>
                      <p className="text-sm text-slate-500 mt-0.5">Add an extra layer of security to your account.</p>
                    </div>
                    <span className="px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                      Not enabled
                    </span>
                  </div>
                  <button className="mt-4 px-4 py-2 border border-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                    Enable 2FA
                  </button>
                </div>

                {/* Sessions */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h3 className="font-medium text-slate-900">Active Sessions</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Manage devices where you're currently logged in.</p>
                  
                  <div className="mt-4 space-y-3">
                    {sessions.map((session, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <session.icon className="w-5 h-5 text-slate-400" />
                          <div>
                            <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                              {session.device}
                              {session.current && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
                                  Current
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">{session.location}</div>
                          </div>
                        </div>
                        {!session.current && (
                          <button className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors">
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Billing Section */}
            {activeSection === 'billing' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Billing</h2>
                  <p className="text-sm text-slate-500 mt-1">Manage your subscription and payment methods.</p>
                </div>

                {/* Current Plan */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-6 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-sm text-slate-400">Current plan</span>
                      <div className="text-2xl font-semibold mt-1">Pro Plan</div>
                      <div className="text-slate-400 mt-1">$29/month · Renews Feb 15, 2025</div>
                    </div>
                    <button className="px-4 py-2 bg-white text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors">
                      Upgrade
                    </button>
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-slate-700 grid grid-cols-3 gap-6">
                    <div>
                      <div className="text-2xl font-semibold">47,832</div>
                      <div className="text-sm text-slate-400">of 100,000 requests</div>
                    </div>
                    <div>
                      <div className="text-2xl font-semibold">3</div>
                      <div className="text-sm text-slate-400">of 10 API keys</div>
                    </div>
                    <div>
                      <div className="text-2xl font-semibold">2</div>
                      <div className="text-sm text-slate-400">of 5 team members</div>
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h3 className="font-medium text-slate-900">Payment Method</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Update your billing information.</p>
                  
                  <div className="mt-4 flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded flex items-center justify-center text-white text-xs font-bold">
                        VISA
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">•••• •••• •••• 4242</div>
                        <div className="text-xs text-slate-500">Expires 12/2026</div>
                      </div>
                    </div>
                    <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
                      Update
                    </button>
                  </div>
                </div>

                {/* Billing History */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="font-medium text-slate-900">Billing History</h3>
                  </div>
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                        <th className="px-6 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        { date: 'Jan 15, 2025', desc: 'Pro Plan - Monthly', amount: '$29.00', status: 'Paid' },
                        { date: 'Dec 15, 2024', desc: 'Pro Plan - Monthly', amount: '$29.00', status: 'Paid' },
                        { date: 'Nov 15, 2024', desc: 'Pro Plan - Monthly', amount: '$29.00', status: 'Paid' },
                      ].map((invoice, index) => (
                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-600">{invoice.date}</td>
                          <td className="px-6 py-4 text-sm text-slate-900">{invoice.desc}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{invoice.amount}</td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
                              {invoice.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
                              Download
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Example 3: Empty States

**User Request:**
"Show me how to handle empty states properly"

**Expected Output:**

```jsx
// Different empty state patterns for various contexts

// 1. No Data - First Time User
<div className="flex flex-col items-center justify-center py-16">
  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
    <FolderPlus className="w-8 h-8 text-indigo-600" />
  </div>
  <h3 className="text-lg font-semibold text-slate-900">No projects yet</h3>
  <p className="text-sm text-slate-500 mt-1 text-center max-w-sm">
    Get started by creating your first project. It only takes a minute.
  </p>
  <button className="mt-6 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
    Create Project
  </button>
</div>

// 2. No Search Results
<div className="flex flex-col items-center justify-center py-16">
  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
    <Search className="w-8 h-8 text-slate-400" />
  </div>
  <h3 className="text-lg font-semibold text-slate-900">No results found</h3>
  <p className="text-sm text-slate-500 mt-1 text-center max-w-sm">
    We couldn't find anything matching "design system". Try adjusting your search.
  </p>
  <button className="mt-6 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
    Clear search
  </button>
</div>

// 3. Error State
<div className="flex flex-col items-center justify-center py-16">
  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
    <AlertCircle className="w-8 h-8 text-red-600" />
  </div>
  <h3 className="text-lg font-semibold text-slate-900">Something went wrong</h3>
  <p className="text-sm text-slate-500 mt-1 text-center max-w-sm">
    We couldn't load your data. Please try again or contact support if the problem persists.
  </p>
  <div className="mt-6 flex gap-3">
    <button className="px-4 py-2 border border-slate-200 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
      Contact Support
    </button>
    <button className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">
      Try Again
    </button>
  </div>
</div>

// 4. No Notifications
<div className="flex flex-col items-center justify-center py-12">
  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-3">
    <Bell className="w-6 h-6 text-slate-400" />
  </div>
  <h3 className="text-sm font-medium text-slate-900">All caught up!</h3>
  <p className="text-xs text-slate-500 mt-0.5">No new notifications.</p>
</div>

// 5. Filtered to Nothing
<div className="flex flex-col items-center justify-center py-16">
  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
    <Filter className="w-8 h-8 text-slate-400" />
  </div>
  <h3 className="text-lg font-semibold text-slate-900">No matching items</h3>
  <p className="text-sm text-slate-500 mt-1 text-center max-w-sm">
    No items match your current filters. Try removing some filters to see more results.
  </p>
  <button className="mt-6 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors">
    Reset all filters
  </button>
</div>
```

---

## Usage Notes

1. **Эти примеры показывают ожидаемый уровень детализации** — каждый элемент имеет состояния, реальный контент, hover-эффекты

2. **Используй как reference в staged generation:**
   - Step 1: Определи архитектуру страницы
   - Step 2: Выбери подходящий layout template
   - Step 3: Сгенерируй код, соответствующий этому уровню качества

3. **Ключевые паттерны из примеров:**
   - Все интерактивные элементы имеют hover/focus
   - Реальные данные вместо placeholder
   - Консистентные spacing и typography
   - Правильная визуальная иерархия
   - Готовые empty/error/loading states
