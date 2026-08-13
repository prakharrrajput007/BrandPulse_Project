"use client";
import React, { useState, useEffect } from 'react';
import { Activity, LayoutDashboard, ChevronLeft, ChevronRight, TrendingUp, Bell, X, MessageSquare, ArrowUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function BrandPulseDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Navigation & UI State
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard', 'trending', 'alerts'
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  
  // Pagination State
  const [displayLimit, setDisplayLimit] = useState(20);
  
  // Filters State
  const [brand, setBrand] = useState("Flipkart");
  const [dateRange, setDateRange] = useState("30"); 
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Fetch data dynamically
  useEffect(() => {
    setLoading(true);
    // Reset pagination when filters change
    setDisplayLimit(20); 
    
   let url = `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard?brand=${brand}`;
    if (dateRange === "custom" && customStart && customEnd) {
      url += `&start_date=${customStart}T00:00:00Z&end_date=${customEnd}T23:59:59Z`;
    } else if (dateRange !== "custom") {
      url += `&days=${dateRange}`;
    } else {
      setLoading(false);
      return; 
    }

    fetch(url)
      .then(res => res.json())
      .then(apiData => {
        setData(apiData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch data", err);
        setLoading(false);
      });
  }, [brand, dateRange, customStart, customEnd]);

  // Reset pagination when switching tabs or topics
  useEffect(() => {
    setDisplayLimit(20);
  }, [activeTab, selectedTopic]);

  const handleLoadMore = () => {
    setDisplayLimit(prev => Math.min(prev + 20, 100)); // Cap at 100 to prevent lag
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Recent";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const slideLeft = () => {
    const slider = document.getElementById('trending-carousel');
    if (slider) slider.scrollBy({ left: -300, behavior: 'smooth' });
  };

  const slideRight = () => {
    const slider = document.getElementById('trending-carousel');
    if (slider) slider.scrollBy({ left: 300, behavior: 'smooth' });
  };

  if (loading && !data) return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500 font-semibold">Loading BrandPulse Data...</div>;

  // Filter Arrays
  const livePosts = data?.live_feed || [];
  const alertPosts = data?.alerts_feed || []; 
  const trendingPosts = selectedTopic ? livePosts.filter(post => (post.normalized_text || post.raw_text || "").toLowerCase().includes(selectedTopic.toLowerCase())) : [];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col fixed h-full shadow-xl">
        <div className="p-6 flex items-center gap-3 border-b border-slate-700">
          <Activity className="text-blue-400" size={28} />
          <span className="text-2xl font-bold text-white tracking-tight">BrandPulse</span>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          <button 
            onClick={() => { setActiveTab("dashboard"); setSelectedTopic(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${activeTab === 'dashboard' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}
          >
            <LayoutDashboard size={20} /> Dashboard
          </button>
          <button 
            onClick={() => setActiveTab("trending")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${activeTab === 'trending' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}
          >
            <TrendingUp size={20} /> Trending Topics
          </button>
          <button 
            onClick={() => setActiveTab("alerts")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${activeTab === 'alerts' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}
          >
            <Bell size={20} /> Active Alerts
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        
        {/* TOP APP BAR */}
        <header className="bg-white h-20 px-8 flex items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex gap-4 items-center">
            <select 
              value={brand} 
              onChange={(e) => { setBrand(e.target.value); setSelectedTopic(null); }}
              className="px-4 py-2 bg-slate-100 rounded-md font-semibold border border-slate-200 outline-none cursor-pointer"
            >
              <option value="Flipkart">Flipkart</option>
              <option value="Amazon">Amazon</option>
              <option value="Meesho">Meesho</option>
              <option value="Myntra">Myntra</option>
              <option value="Nykaa">Nykaa</option>
              <option value="Tira">Tira</option>
              <option value="Ajio">Ajio</option>
              <option value="Tata Cliq">Tata Cliq</option>
            </select>
            
            <select 
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 bg-slate-100 rounded-md text-sm border border-slate-200 outline-none cursor-pointer"
            >
              <option value="3">Last 3 Days</option>
              <option value="7">Last 7 Days</option>
              <option value="15">Last 15 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="custom">Custom Date...</option>
            </select>

            {dateRange === "custom" && (
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-md border border-slate-200">
                <input 
                  type="date" 
                  value={customStart} 
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-transparent text-sm outline-none px-2 text-slate-600"
                />
                <span className="text-slate-400">to</span>
                <input 
                  type="date" 
                  value={customEnd} 
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-transparent text-sm outline-none px-2 text-slate-600"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm">P</div>
          </div>
        </header>

        {/* CONTENT ROUTER */}
        <div className="p-8 overflow-y-auto flex-1 relative">
          
          {/* TAB: DASHBOARD */}
          {activeTab === "dashboard" && data && (
            <>
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-4 gap-6 mb-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-slate-500 text-sm font-medium mb-1">Total Mentions</p>
                  <p className="text-3xl font-bold">{data.kpis.total_mentions}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-slate-500 text-sm font-medium mb-1">Pos Sentiment %</p>
                  <p className="text-3xl font-bold text-green-600">{data.kpis.positive_pct}%</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-slate-500 text-sm font-medium mb-1">Neg Sentiment %</p>
                  <p className="text-3xl font-bold text-red-600">{data.kpis.negative_pct}%</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-slate-500 text-sm font-medium mb-1">Active Alerts</p>
                  <p className="text-3xl font-bold text-orange-500">{data.kpis.active_alerts}</p>
                </div>
              </div>

              {/* Live Feed & Trend Graph */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                
                {/* Live Posts Feed */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[350px]">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl font-semibold flex justify-between">
                    <span>Live Posts</span>
                  </div>
                  <div className="overflow-y-auto p-4 space-y-3">
                    {livePosts.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center mt-10">No mentions found for this filter.</p>
                    ) : (
                      <>
                        {livePosts.slice(0, displayLimit).map((post, i) => (
                          <div 
                            key={i} 
                            onClick={() => setSelectedPost(post)}
                            className="p-3 border border-slate-100 rounded-lg text-sm cursor-pointer hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-600 text-xs">r/{post.subreddit || "ecom"}</span>
                                <span className="text-[11px] text-slate-400 font-medium">
                                  • {formatDate(post.created_date || post.createdDate)}
                                </span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-xs font-bold 
                                ${post.sentiment_label === 'Positive' ? 'bg-green-100 text-green-700' : 
                                  post.sentiment_label === 'Negative' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                {post.sentiment_label || "Unscored"}
                              </span>
                            </div>
                            {/* Added break-words to handle overflowing text */}
                            <p className="text-slate-700 line-clamp-2 break-words">{post.normalized_text || post.raw_text}</p>
                          </div>
                        ))}
                        {livePosts.length > displayLimit && displayLimit < 100 && (
                          <button onClick={handleLoadMore} className="w-full py-2 text-sm text-blue-600 font-semibold hover:bg-blue-50 rounded-lg transition-colors">
                            Load More
                          </button>
                        )}
                        {displayLimit >= 100 && (
                          <p className="text-center text-xs text-slate-400 py-2">Maximum preview limit reached.</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Trend Graph */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[350px]">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl font-semibold">Sentiment Trend</div>
                  <div className="p-4 flex-1 w-full h-full pb-8">
                    {data.trend_data.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center mt-10">Not enough data to map trends.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.trend_data}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dx={-10} />
                          <Tooltip />
                          <Line type="monotone" dataKey="positive" stroke="#16a34a" strokeWidth={3} dot={false} />
                          <Line type="monotone" dataKey="negative" stroke="#dc2626" strokeWidth={3} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Trending Topics Carousel */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl font-semibold flex justify-between items-center">
                  <span>Trending Topics</span>
                  <div className="flex gap-2">
                    <button onClick={slideLeft} className="p-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors">
                      <ChevronLeft size={18} />
                    </button>
                    <button onClick={slideRight} className="p-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors">
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
                
                <div id="trending-carousel" className="p-6 flex overflow-x-auto gap-4 scroll-smooth" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  <style dangerouslySetInnerHTML={{__html: `#trending-carousel::-webkit-scrollbar { display: none; }`}} />
                  {data.trending_topics.length === 0 ? (
                      <p className="text-sm text-slate-500 w-full text-center">No trending keywords found for this filter.</p>
                  ) : (
                    data.trending_topics.map((item, i) => (
                      <div 
                        key={i} 
                        onClick={() => { setActiveTab("trending"); setSelectedTopic(item.topic); }}
                        className="min-w-[240px] shrink-0 p-4 rounded-lg border border-slate-100 bg-white shadow-sm flex flex-col gap-2 cursor-pointer hover:border-blue-300 transition-all"
                      >
                        <span className="font-bold text-slate-800 truncate">{item.topic}</span>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-500">{item.mentions} mentions</span>
                          <span className={`px-2 py-1 rounded text-xs font-semibold
                            ${item.sentiment === 'Positive' ? 'text-green-600 bg-green-50' : 
                              item.sentiment === 'Negative' ? 'text-red-600 bg-red-50' : 'text-slate-600 bg-slate-50'}`}>
                            {item.sentiment}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB: TRENDING TOPICS */}
          {activeTab === "trending" && data && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
              <div className="p-6 border-b border-slate-100">
                <h2 className="text-xl font-bold">Trending Topics for {brand}</h2>
                <p className="text-slate-500 text-sm mt-1">Select a topic below to see related mentions.</p>
              </div>
              <div className="flex flex-1 overflow-hidden">
                {/* Topic List */}
                <div className="w-1/3 border-r border-slate-100 overflow-y-auto p-4 space-y-2 bg-slate-50">
                  {data.trending_topics.map((item, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedTopic(item.topic)}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${selectedTopic === item.topic ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}
                    >
                      <p className="font-bold text-slate-800">{item.topic}</p>
                      <p className="text-xs text-slate-500 mt-1">{item.mentions} mentions • {item.sentiment} sentiment</p>
                    </div>
                  ))}
                </div>
                {/* Related Posts */}
                <div className="w-2/3 p-6 overflow-y-auto">
                  {!selectedTopic ? (
                    <div className="h-full flex items-center justify-center text-slate-400">Select a topic to view posts</div>
                  ) : (
                    <div className="space-y-4">
                      <h3 className="font-bold text-lg mb-4">Posts mentioning "{selectedTopic}"</h3>
                      {trendingPosts.slice(0, displayLimit).map((post, i) => (
                        <div key={i} onClick={() => setSelectedPost(post)} className="p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                            <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold text-slate-600 text-sm">r/{post.subreddit || "ecom"}</span>
                            {/* Fixed missing positive condition for trending topic badges */}
                            <span className={`px-2 py-0.5 rounded text-xs font-bold 
                              ${post.sentiment_label === 'Positive' ? 'bg-green-100 text-green-700' : 
                                post.sentiment_label === 'Negative' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                              {post.sentiment_label || "Unscored"}
                            </span>
                          </div>
                          {/* Added break-words and line-clamp for layout stability */}
                          <p className="text-slate-700 text-sm break-words line-clamp-3">{post.raw_text}</p>
                        </div>
                      ))}
                      {trendingPosts.length > displayLimit && displayLimit < 100 && (
                        <button onClick={handleLoadMore} className="w-full py-3 text-sm text-blue-600 font-semibold hover:bg-blue-50 rounded-lg transition-colors border border-blue-100">
                          Load More Posts
                        </button>
                      )}
                      {displayLimit >= 100 && (
                         <p className="text-center text-xs text-slate-400 py-2">Maximum preview limit reached.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: ALERTS */}
          {activeTab === "alerts" && data && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-full flex flex-col">
              <h2 className="text-xl font-bold text-red-600 flex items-center gap-2 mb-4">
                <Bell size={24} /> Active Alerts
              </h2>
              <p className="text-slate-600 mb-6">Showing recent posts with negative sentiment that require attention.</p>
              
              <div className="space-y-4 overflow-y-auto flex-1">
                {alertPosts.length === 0 ? (
                  <p className="text-slate-500">No active alerts for this period! 🎉</p>
                ) : (
                  <>
                    {alertPosts.slice(0, displayLimit).map((post, i) => (
                      <div key={i} onClick={() => setSelectedPost(post)} className="p-4 border border-red-200 bg-red-50/30 rounded-lg cursor-pointer hover:bg-red-50 transition-colors">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-red-700">Action Required</span>
                          <span className="text-xs text-slate-500">{formatDate(post.created_date || post.createdDate)}</span>
                        </div>
                        {/* Added break-words to handle overflowing text */}
                        <p className="text-slate-800 text-sm mb-3 break-words line-clamp-3">{post.raw_text}</p>
                        <div className="flex gap-4 text-xs font-semibold text-slate-500">
                          <span className="flex items-center gap-1"><MessageSquare size={14} /> {post.comments || 0} Comments</span>
                          <span className="flex items-center gap-1"><ArrowUp size={14} /> {post.upvotes || 0} Upvotes</span>
                        </div>
                      </div>
                    ))}
                    {alertPosts.length > displayLimit && displayLimit < 100 && (
                      <button onClick={handleLoadMore} className="w-full py-3 text-sm text-red-600 font-semibold hover:bg-red-50 rounded-lg transition-colors border border-red-100">
                        Load More Alerts
                      </button>
                    )}
                    {displayLimit >= 100 && (
                       <p className="text-center text-xs text-slate-400 py-2">Maximum preview limit reached.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* POST DETAIL MODAL */}
          {selectedPost && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedPost(null)}>
              <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  {/* Added break-words to title */}
                  <h3 className="font-bold text-lg text-slate-800 line-clamp-2 break-words flex-1 pr-4">{selectedPost.title || "Post Details"}</h3>
                  <button onClick={() => setSelectedPost(null)} className="p-1 hover:bg-slate-200 rounded text-slate-500 shrink-0"><X size={20}/></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-4">
                  <div className="flex flex-wrap gap-3 mb-4">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">r/{selectedPost.subreddit || "Unknown"}</span>
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">{formatDate(selectedPost.created_date || selectedPost.createdDate)}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold 
                      ${selectedPost.sentiment_label === 'Positive' ? 'bg-green-100 text-green-700' : 
                        selectedPost.sentiment_label === 'Negative' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                      Sentiment: {selectedPost.sentiment_label || "Unscored"}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    {/* Added break-words here for modal body text */}
                    <p className="text-slate-800 whitespace-pre-wrap break-words text-sm leading-relaxed">{selectedPost.body || selectedPost.raw_text}</p>
                  </div>
                  <div className="flex gap-6 mt-4">
                    <div className="flex items-center gap-2 text-slate-600 font-semibold text-sm">
                      <MessageSquare size={18} className="text-slate-400" /> {selectedPost.comments || 0} Comments
                    </div>
                    <div className="flex items-center gap-2 text-slate-600 font-semibold text-sm">
                      <ArrowUp size={18} className="text-slate-400" /> {selectedPost.upvotes || 0} Upvotes
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}