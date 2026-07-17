"use client";
import React, { useState, useEffect } from 'react';
import { Bell, AlertTriangle, MessageSquare, ChevronDown, Activity, LayoutDashboard } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function BrandPulseDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState("Flipkart");
  const [days, setDays] = useState(7); // Default to last 7 days

  // Fetch data dynamically from FastAPI backend
  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:8000/api/dashboard?brand=${brand}&days=${days}`)
      .then(res => res.json())
      .then(apiData => {
        setData(apiData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch data", err);
        setLoading(false);
      });
  }, [brand, days]); // Re-run this effect whenever brand or days change

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500 font-semibold text-lg">Loading BrandPulse Data...</div>;
  if (!data) return <div className="flex h-screen items-center justify-center bg-slate-50 text-red-500 font-semibold">Error connecting to database.</div>;

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
          <a href="#" className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800 rounded-lg transition-colors">
            <MessageSquare size={20} /> Mentions
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800 rounded-lg transition-colors">
            <AlertTriangle size={20} /> Alerts
          </a>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 ml-64 flex flex-col h-screen overflow-hidden">
        
        {/* TOP APP BAR */}
        <header className="bg-white h-20 px-8 flex items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex gap-4">
            <select 
              value={brand} 
              onChange={(e) => setBrand(e.target.value)}
              className="px-4 py-2 bg-slate-100 rounded-md font-semibold border border-slate-200 outline-none cursor-pointer"
            >
              <option value="All">All Brands</option>
              <option value="Flipkart">Flipkart</option>
              <option value="Amazon">Amazon</option>
              <option value="Meesho">Meesho</option>
              <option value="Myntra">Myntra</option>
              <option value="Nykaa">Nykaa</option>
            </select>
            
            <select 
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-4 py-2 bg-slate-100 rounded-md text-sm border border-slate-200 outline-none cursor-pointer"
            >
              <option value={3}>Last 3 Days</option>
              <option value={7}>Last 7 Days</option>
              <option value={15}>Last 15 Days</option>
              <option value={30}>Last 30 Days</option>
            </select>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <Bell size={20} className="cursor-pointer hover:text-slate-800" />
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm">P</div>
          </div>
        </header>

        {/* DASHBOARD GRID */}
        <div className="p-8 overflow-y-auto flex-1">
          
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
          <div className="grid grid-cols-2 gap-6">
            
            {/* Live Posts Feed */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[400px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl font-semibold flex justify-between">
                <span>Live Posts</span>
                <span className="text-xs font-normal text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">Auto-updating</span>
              </div>
              <div className="overflow-y-auto p-4 space-y-3">
                {data.live_feed.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center mt-10">No mentions found for this filter.</p>
                ) : (
                  data.live_feed.map((post, i) => (
                    <div key={i} className="p-3 border border-slate-100 rounded-lg text-sm hover:border-blue-200 transition-colors">
                      <div className="flex justify-between mb-2">
                        <span className="font-semibold text-slate-600 text-xs">r/{post.subreddit || "ecom"}</span>
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

            {/* Trend Graph using Recharts */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[400px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl font-semibold">Sentiment Trend</div>
              <div className="p-4 flex-1 w-full h-full pb-8">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend_data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dx={-10} />
                    <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}/>
                    <Line type="monotone" dataKey="positive" stroke="#16a34a" strokeWidth={3} dot={{r: 4, fill: "#16a34a", strokeWidth: 0}} activeDot={{r: 6}} name="Positive" />
                    <Line type="monotone" dataKey="negative" stroke="#dc2626" strokeWidth={3} dot={{r: 4, fill: "#dc2626", strokeWidth: 0}} activeDot={{r: 6}} name="Negative" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}