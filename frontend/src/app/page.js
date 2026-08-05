"use client";
import React, { useState, useEffect } from 'react';
import { Activity, LayoutDashboard, ChevronLeft, ChevronRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function BrandPulseDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Filters State
  const [brand, setBrand] = useState("Flipkart");
  const [dateRange, setDateRange] = useState("30"); 
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Fetch data dynamically
  useEffect(() => {
    setLoading(true);
    
    let url = `http://127.0.0.1:8000/api/dashboard?brand=${brand}`;
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
        // Data is now 100% dynamic from the backend
        setData(apiData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch data", err);
        setLoading(false);
      });
  }, [brand, dateRange, customStart, customEnd]);

  // Helper function to format the MongoDB timestamp
  const formatDate = (dateString) => {
    if (!dateString) return "Recent";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Carousel smooth scrolling functions
  const slideLeft = () => {
    const slider = document.getElementById('trending-carousel');
    if (slider) slider.scrollBy({ left: -300, behavior: 'smooth' });
  };

  const slideRight = () => {
    const slider = document.getElementById('trending-carousel');
    if (slider) slider.scrollBy({ left: 300, behavior: 'smooth' });
  };

  if (loading && !data) return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500 font-semibold">Loading BrandPulse Data...</div>;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* LEFT SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col fixed h-full shadow-xl">
        <div className="p-6 flex items-center gap-3 border-b border-slate-700">
          <Activity className="text-blue-400" size={28} />
          <span className="text-2xl font-bold text-white tracking-tight">BrandPulse</span>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          <a href="#" className="flex items-center gap-3 px-4 py-3 bg-blue-600/20 text-blue-400 rounded-lg transition-colors font-medium">
            <LayoutDashboard size={20} /> Dashboard
          </a>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        
        {/* TOP APP BAR */}
        <header className="bg-white h-20 px-8 flex items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex gap-4 items-center">
            <select 
              value={brand} 
              onChange={(e) => setBrand(e.target.value)}
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

        {/* DASHBOARD GRID */}
        <div className="p-8 overflow-y-auto flex-1">
          {data && (
            <>
              {/* Row 1: KPI Summary Cards */}
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

              {/* Row 2: Live Feed & Trend Graph */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                {/* Live Posts Feed */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[350px]">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl font-semibold flex justify-between">
                    <span>Live Posts</span>
                  </div>
                  <div className="overflow-y-auto p-4 space-y-3">
                    {data.live_feed.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center mt-10">No mentions found for this filter.</p>
                    ) : (
                      data.live_feed.map((post, i) => (
                        <div key={i} className="p-3 border border-slate-100 rounded-lg text-sm">
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
                          <p className="text-slate-700 line-clamp-2">{post.normalized_text || post.raw_text}</p>
                        </div>
                      ))
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

              {/* Row 3: Trending Topics Carousel */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl font-semibold flex justify-between items-center">
                  <span>Trending Topics</span>
                  
                  {/* Slider Controls */}
                  <div className="flex gap-2">
                    <button onClick={slideLeft} className="p-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors">
                      <ChevronLeft size={18} />
                    </button>
                    <button onClick={slideRight} className="p-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors">
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
                
                {/* Scrollable Container (Hidden Scrollbar) */}
                <div 
                  id="trending-carousel" 
                  className="p-6 flex overflow-x-auto gap-4 scroll-smooth" 
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} 
                >
                  <style dangerouslySetInnerHTML={{__html: `
                    #trending-carousel::-webkit-scrollbar { display: none; }
                  `}} />
                  
                  {data.trending_topics.length === 0 ? (
                      <p className="text-sm text-slate-500 w-full text-center">No trending keywords found for this filter.</p>
                  ) : (
                    data.trending_topics.map((item, i) => (
                      <div key={i} className="min-w-[240px] shrink-0 p-4 rounded-lg border border-slate-100 bg-white shadow-sm flex flex-col gap-2">
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
        </div>
      </main>
    </div>
  );
}