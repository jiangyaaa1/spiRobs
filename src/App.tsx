import React, { useState, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import { Settings, Play, RefreshCw, Info, Code, AlertCircle, ChevronRight, Activity } from 'lucide-react';
import { calculateKinematics, RobotState } from './kinematics';
import { SpiRobsModel } from './components/SpiRobsModel';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  // Cable lengths in mm
  const [l1, setL1] = useState(100);
  const [l2, setL2] = useState(100);
  const [l3, setL3] = useState(100);
  
  const [showCode, setShowCode] = useState(false);
  const [isAuto, setIsAuto] = useState(false);

  const state = useMemo(() => calculateKinematics(l1, l2, l3), [l1, l2, l3]);

  // Auto-demo mode
  useEffect(() => {
    if (!isAuto) return;
    const interval = setInterval(() => {
      const time = Date.now() / 1000;
      setL1(100 + Math.sin(time) * 20);
      setL2(100 + Math.sin(time + (2 * Math.PI) / 3) * 20);
      setL3(100 + Math.sin(time + (4 * Math.PI) / 3) * 20);
    }, 50);
    return () => clearInterval(interval);
  }, [isAuto]);

  const reset = () => {
    setL1(100);
    setL2(100);
    setL3(100);
    setIsAuto(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">SpiRobs Simulator</h1>
            <p className="text-xs text-zinc-500 font-mono">v1.0.0 | 3-Cable Soft Robot</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsAuto(!isAuto)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
              isAuto ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            )}
          >
            <Play size={14} className={isAuto ? "fill-current" : ""} />
            {isAuto ? "Running Demo" : "Auto Demo"}
          </button>
          <button 
            onClick={reset}
            className="p-2 bg-zinc-800 text-zinc-400 rounded-full hover:bg-zinc-700 transition-colors"
            title="Reset to Neutral"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex relative">
        {/* 3D Viewport */}
        <div className="flex-1 relative bg-gradient-to-b from-[#0a0a0a] to-[#1a1a1a]">
          <Canvas shadows>
            <PerspectiveCamera makeDefault position={[150, 150, 150]} fov={45} />
            <OrbitControls makeDefault minDistance={50} maxDistance={500} />
            
            <ambientLight intensity={0.5} />
            <pointLight position={[100, 100, 100]} intensity={1} castShadow />
            <spotLight position={[-100, 200, -100]} angle={0.15} penumbra={1} intensity={1} />
            
            <SpiRobsModel state={state} l1={l1} l2={l2} l3={l3} />
            
            <Environment preset="city" />
            <ContactShadows position={[0, -1, 0]} opacity={0.4} scale={20} blur={2} far={4.5} />
          </Canvas>

          {/* Overlay Info */}
          <div className="absolute top-6 left-6 flex flex-col gap-4 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-2xl w-64">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Info size={12} /> Kinematic State
              </h3>
              <div className="space-y-3">
                <StatRow label="Length (L)" value={state.length.toFixed(1)} unit="mm" />
                <StatRow label="Bending (θ)" value={(state.theta * 180 / Math.PI).toFixed(1)} unit="deg" />
                <StatRow label="Orientation (φ)" value={(state.phi * 180 / Math.PI).toFixed(1)} unit="deg" />
                <StatRow label="Curvature (κ)" value={state.curvature.toFixed(4)} unit="mm⁻¹" />
              </div>
            </div>

            <div className="bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-2xl w-64">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertCircle size={12} /> Cable Status
              </h3>
              <div className="space-y-2">
                <CableIndicator label="Cable 1" value={l1} color="bg-red-500" />
                <CableIndicator label="Cable 2" value={l2} color="bg-green-500" />
                <CableIndicator label="Cable 3" value={l3} color="bg-yellow-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Control Sidebar */}
        <aside className="w-96 border-l border-white/10 bg-black/40 backdrop-blur-xl flex flex-col">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
              <Settings size={16} /> Actuator Controls
            </h2>
            
            <div className="space-y-8">
              <ControlSlider 
                label="Cable 1 (Red)" 
                value={l1} 
                onChange={setL1} 
                color="accent-red-500"
                min={50}
                max={150}
              />
              <ControlSlider 
                label="Cable 2 (Green)" 
                value={l2} 
                onChange={setL2} 
                color="accent-green-500"
                min={50}
                max={150}
              />
              <ControlSlider 
                label="Cable 3 (Yellow)" 
                value={l3} 
                onChange={setL3} 
                color="accent-yellow-500"
                min={50}
                max={150}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
              <h4 className="text-blue-400 text-xs font-bold uppercase mb-2">Design Note</h4>
              <p className="text-xs text-blue-200/70 leading-relaxed">
                This simulation uses a Constant Curvature (CC) model. 
                SpiRobs with spiral backbones exhibit high compliance. 
                Ensure your motor steps match the cable length changes shown here.
              </p>
            </div>

            <button 
              onClick={() => setShowCode(!showCode)}
              className="w-full flex items-center justify-between p-4 bg-zinc-900/50 border border-white/5 rounded-xl hover:bg-zinc-800 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <Code size={18} className="text-zinc-400" />
                <span className="text-sm font-medium">Export Motor Commands</span>
              </div>
              <ChevronRight size={16} className={cn("text-zinc-600 transition-transform", showCode && "rotate-90")} />
            </button>

            {showCode && (
              <div className="bg-black rounded-xl p-4 font-mono text-[10px] text-zinc-400 border border-white/5 overflow-x-auto">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-zinc-600 uppercase">C++ / Arduino Snippet</span>
                  <button className="text-blue-500 hover:text-blue-400">Copy</button>
                </div>
                <pre className="leading-relaxed">
{`// Target lengths (mm)
float L1 = ${l1.toFixed(2)};
float L2 = ${l2.toFixed(2)};
float L3 = ${l3.toFixed(2)};

// Map to motor steps (example: 200 steps/rev, 10mm spool)
long steps1 = (long)(L1 * 20.0);
long steps2 = (long)(L2 * 20.0);
long steps3 = (long)(L3 * 20.0);

moveTo(steps1, steps2, steps3);`}
                </pre>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-white/10 text-center">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">
              Based on ScienceDirect S2666998624006033
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function StatRow({ label, value, unit }: { label: string, value: string, unit: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-mono font-bold text-white">{value}</span>
        <span className="text-[10px] text-zinc-500 font-mono">{unit}</span>
      </div>
    </div>
  );
}

function CableIndicator({ label, value, color }: { label: string, value: number, color: string }) {
  const percentage = Math.max(0, Math.min(100, (value - 50))); // 50-150 range
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] uppercase tracking-tighter">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300 font-mono">{value.toFixed(1)}mm</span>
      </div>
      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-300", color)} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ControlSlider({ label, value, onChange, color, min, max }: { 
  label: string, 
  value: number, 
  onChange: (v: number) => void,
  color: string,
  min: number,
  max: number
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-xs font-medium text-zinc-300">{label}</label>
        <span className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">{value.toFixed(1)} mm</span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={cn("w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer", color)}
      />
    </div>
  );
}
