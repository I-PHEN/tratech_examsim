import React, { useMemo } from 'react';
import { ChevronLeft, Target, TrendingUp, Clock, BrainCircuit } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function PerformanceScreen({ 
  onBack
}: { 
  onBack: () => void
}) {
  // Use MOCK data for the chart
  const performanceData = useMemo(() => [
    { name: 'S1', accuracy: 55 },
    { name: 'S2', accuracy: 62 },
    { name: 'S3', accuracy: 58 },
    { name: 'S4', accuracy: 70 },
    { name: 'S5', accuracy: 68 },
    { name: 'S6', accuracy: 75 },
    { name: 'S7', accuracy: 82 },
    { name: 'S8', accuracy: 78 },
    { name: 'S9', accuracy: 85 },
    { name: 'S10', accuracy: 90 },
  ], []);

  return (
    <div className="flex-1 w-full flex justify-center py-6 md:py-12 px-4 h-full overflow-y-auto">
      <div className="w-full max-w-5xl space-y-8 animate-fade-in pb-12">
        <header className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-container-high transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-text-primary">Performance Overview</h1>
            <p className="text-sm md:text-base text-text-secondary mt-1">Analyze your progress and identify areas for improvement.</p>
          </div>
        </header>

        {/* High-Level Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-surface-container-high border border-outline-variant/20 flex flex-col gap-4 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <Target className="w-24 h-24" />
             </div>
             <p className="text-sm font-bold text-text-secondary uppercase tracking-widest relative z-10">Total Questions</p>
             <h3 className="text-5xl font-black text-text-primary tracking-tighter relative z-10">1,248</h3>
             <div className="flex items-center gap-2 text-sm font-bold text-success-text relative z-10 mt-auto pt-4">
                <TrendingUp className="w-4 h-4" />
                <span>+124 this week</span>
             </div>
          </div>
          <div className="p-6 rounded-3xl bg-surface-container-high border border-outline-variant/20 flex flex-col gap-4 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <BrainCircuit className="w-24 h-24" />
             </div>
             <p className="text-sm font-bold text-text-secondary uppercase tracking-widest relative z-10">Average Accuracy</p>
             <h3 className="text-5xl font-black text-text-primary tracking-tighter relative z-10">72%</h3>
             <div className="flex items-center gap-2 text-sm font-bold text-success-text relative z-10 mt-auto pt-4">
                <TrendingUp className="w-4 h-4" />
                <span>+5% vs last month</span>
             </div>
          </div>
          <div className="p-6 rounded-3xl bg-surface-container-high border border-outline-variant/20 flex flex-col gap-4 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <Clock className="w-24 h-24" />
             </div>
             <p className="text-sm font-bold text-text-secondary uppercase tracking-widest relative z-10">Time Learning</p>
             <h3 className="text-5xl font-black text-text-primary tracking-tighter relative z-10">42<span className="text-2xl text-text-tertiary">h</span></h3>
             <div className="flex items-center gap-2 text-sm font-bold text-text-tertiary relative z-10 mt-auto pt-4">
                <span>Across 56 sessions</span>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
           {/* Chart Section */}
           <div className="p-6 rounded-3xl bg-surface-container-high border border-outline-variant/20 flex flex-col">
              <div className="mb-6">
                 <h2 className="text-xl font-bold text-text-primary">Accuracy Trend</h2>
                 <p className="text-sm text-text-secondary">Your performance over the last 10 sessions</p>
              </div>
              <div className="flex-1 min-h-[300px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={performanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                     <defs>
                       <linearGradient id="colorAccuracy" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="var(--text-primary)" stopOpacity={0.2} />
                         <stop offset="95%" stopColor="var(--text-primary)" stopOpacity={0} />
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                     <XAxis dataKey="name" stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                     <YAxis stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} dx={-10} domain={[0, 100]} />
                     <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--bg-sunken)', borderRadius: '12px', border: '1px solid var(--border-subtle)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        itemStyle={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                     />
                     <Area type="monotone" dataKey="accuracy" stroke="var(--text-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorAccuracy)" />
                   </AreaChart>
                 </ResponsiveContainer>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
