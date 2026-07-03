'use client';

import React from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export function GrowthAreaChart({ data, dataKey, name }: { data: any[], dataKey: string, name: string }) {
  return (
    <div style={{ width: '100%', height: 250 }}>
      <ResponsiveContainer minWidth={0} minHeight={0} debounce={50}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="name" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
            itemStyle={{ color: '#e4e4e7' }}
          />
          <Area type="monotone" dataKey={dataKey} stroke="#10b981" fillOpacity={1} fill="url(#colorArea)" name={name} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AcquisitionFunnelChart({ data }: { data: any[] }) {
  // A simple horizontal bar chart acts well as a funnel visualization when sorted
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer minWidth={0} minHeight={0} debounce={50}>
        <BarChart layout="vertical" data={data} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
          <XAxis type="number" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis dataKey="step" type="category" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} width={100} />
          <Tooltip 
            cursor={{fill: '#27272a', opacity: 0.4}}
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }}
          />
          <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Users" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SourcePieChart({ data }: { data: {name: string, value: number}[] }) {
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'];
  
  return (
    <div style={{ width: '100%', height: 250 }}>
      <ResponsiveContainer minWidth={0} minHeight={0} debounce={50}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
