import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import { motion } from 'motion/react';
import { 
  Settings, Play, RefreshCw, Info, Code, AlertCircle, ChevronRight, 
  Activity, FileCode, Terminal, Layout, Save, Upload, X, Maximize2, 
  Database, Square, Sliders, Plus, Folder, Trash2
} from 'lucide-react';
import * as THREE from 'three';
import { calculateKinematics, RobotState } from './kinematics';
import { SpiRobsModel } from './components/SpiRobsModel';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import Editor from '@monaco-editor/react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function ResizeHandle({ vertical = false }: { vertical?: boolean }) {
  return (
    <PanelResizeHandle className={cn(
      "flex items-center justify-center bg-[#ccc] transition-colors hover:bg-[#99b] z-10",
      vertical ? "h-1 w-full cursor-row-resize" : "w-1 h-full cursor-col-resize"
    )}>
      <div className={cn("bg-[#888] rounded-full", vertical ? "w-8 h-[2px]" : "h-8 w-[2px]")} />
    </PanelResizeHandle>
  );
}

function CustomControls({ fingers, cableDistance }: { fingers: any, cableDistance: number }) {
  const { camera, gl, raycaster, mouse, scene } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const el = gl.domElement;
    const handleWheel = (e: WheelEvent) => {
      if (!controlsRef.current) return;
      
      // Prevent default zoom to handle it manually
      e.preventDefault();
      
      // 1. Find the 3D point under the mouse
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      
      const zoomIn = e.deltaY < 0;
      const factor = zoomIn ? 0.92 : 1.08;

      let point = new THREE.Vector3();
      if (intersects.length > 0) {
        point.copy(intersects[0].point);
      } else {
        // Fallback to a point on a plane at the target distance
        const plane = new THREE.Plane();
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        plane.setFromNormalAndCoplanarPoint(dir, controlsRef.current.target);
        raycaster.ray.intersectPlane(plane, point);
      }

      if (point) {
        // Move camera and target towards the point
        camera.position.lerp(point, 1 - factor);
        controlsRef.current.target.lerp(point, 1 - factor);
        controlsRef.current.update();
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [camera, gl, mouse, raycaster, scene]);

  return (
    <OrbitControls 
      ref={controlsRef} 
      makeDefault 
      minDistance={20} 
      maxDistance={2000} 
      enableZoom={false} // Handled by custom wheel listener
      screenSpacePanning={true} // Easier navigation
    />
  );
}

interface Model {
  id: string;
  name: string;
  code: string;
  folderId?: string;
  folderName?: string;
}

export default function App() {
  // State for 3 independent fingers (each is a 3-cable SpiRobs)
  const [fingers, setFingers] = useState([
    { l1: 100, l2: 100, l3: 100 },
    { l1: 100, l2: 100, l3: 100 },
    { l1: 100, l2: 100, l3: 100 },
  ]);

  const [cableDistance, setCableDistance] = useState(15);
  const [isAuto, setIsAuto] = useState(false);
  const [logs, setLogs] = useState<string[]>(["MATLAB-Sim v1.3.0 initialized.", "Ready for simulation."]);
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [editingVar, setEditingVar] = useState<{name: string, value: string} | null>(null);
  const [showManualOverride, setShowManualOverride] = useState(true);
  const [isAddVarModalOpen, setIsAddVarModalOpen] = useState(false);
  const [newVarName, setNewVarName] = useState('');
  const [newVarValue, setNewVarValue] = useState('0.00');
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, modelId: string } | null>(null);
  const [show3DFigure, setShow3DFigure] = useState(true);
  
  // Workspace variables
  const [workspaceVars, setWorkspaceVars] = useState([
    { id: '1', name: 'Finger1_L1', value: '100.00' },
    { id: '2', name: 'Finger1_L2', value: '100.00' },
    { id: '3', name: 'Finger1_L3', value: '100.00' },
    { id: '4', name: 'Finger2_L1', value: '100.00' },
    { id: '5', name: 'Finger2_L2', value: '100.00' },
    { id: '6', name: 'Finger2_L3', value: '100.00' },
    { id: '7', name: 'Finger3_L1', value: '100.00' },
    { id: '8', name: 'Finger3_L2', value: '100.00' },
    { id: '9', name: 'Finger3_L3', value: '100.00' },
  ]);

  // Models/Pages
  const [models, setModels] = useState<Model[]>([
    { id: '1', name: 'SpiRobs Backbone', code: '// Finger 1 Control\nL1 = 100;\nL2 = 100;\nL3 = 100;' },
    { id: '2', name: 'Gripper Config', code: '// Gripper Configuration\nCableDistance = 15;' },
  ]);
  const [activeModelId, setActiveModelId] = useState('1');
  const [cursorPos, setCursorPos] = useState({ lineNumber: 1, column: 1 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const activeModel = useMemo(() => models.find(m => m.id === activeModelId) || models[0], [models, activeModelId]);

  const groupedModels = useMemo(() => {
    const groups: { [key: string]: { name: string, models: typeof models } } = { 
      'root': { name: 'Root', models: [] } 
    };
    models.forEach(m => {
      if (m.folderId && m.folderName) {
        if (!groups[m.folderId]) groups[m.folderId] = { name: m.folderName, models: [] };
        groups[m.folderId].models.push(m);
      } else {
        groups['root'].models.push(m);
      }
    });
    return groups;
  }, [models]);

  // Update finger state when workspace vars change
  useEffect(() => {
    const newFingers = JSON.parse(JSON.stringify(fingers));
    workspaceVars.forEach(v => {
      const match = v.name.match(/Finger(\d)_L(\d)/);
      if (match) {
        const fIdx = parseInt(match[1]) - 1;
        const lIdx = parseInt(match[2]);
        const val = parseFloat(v.value);
        if (!isNaN(val) && fIdx >= 0 && fIdx < 3) {
          if (lIdx === 1) newFingers[fIdx].l1 = val;
          if (lIdx === 2) newFingers[fIdx].l2 = val;
          if (lIdx === 3) newFingers[fIdx].l3 = val;
        }
      }
    });
    setFingers(newFingers);
  }, [workspaceVars]);

  const addWorkspaceVar = () => {
    setNewVarName('');
    setNewVarValue('0.00');
    setIsAddVarModalOpen(true);
  };

  const confirmAddVar = () => {
    if (newVarName.trim()) {
      setWorkspaceVars([...workspaceVars, { id: Date.now().toString(), name: newVarName.trim(), value: newVarValue }]);
      setIsAddVarModalOpen(false);
      addLog(`Variable ${newVarName} added with value ${newVarValue}`);
    }
  };

  const addModel = (name?: string) => {
    const newId = Date.now().toString();
    const newModel = { 
      id: newId, 
      name: name || `script_${models.length + 1}`, 
      code: '// New Model Code\nL1 = 100;\nL2 = 100;\nL3 = 100;\ndelay(500);\nL1 = 120;\ndelay(500);\nL2 = 120;\ndelay(500);\nL3 = 120;' 
    };
    setModels([...models, newModel]);
    setActiveModelId(newId);
    return newModel;
  };

  const handleFileClick = (model: any) => {
    setActiveModelId(model.id);
    // Trigger run sequence for the clicked file
    setTimeout(() => {
      const runBtn = document.getElementById('run-btn');
      if (runBtn) (runBtn as HTMLButtonElement).click();
    }, 100);
  };

  const handleContextMenu = (e: React.MouseEvent, modelId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, modelId });
  };

  const deleteModel = (id: string) => {
    if (models.length <= 1) {
      addLog("Cannot delete the last file.");
      return;
    }
    setModels(prev => prev.filter(m => m.id !== id));
    if (activeModelId === id) {
      setActiveModelId(models.find(m => m.id !== id)?.id || '');
    }
    addLog("File deleted.");
  };

  const renameModel = (id: string) => {
    const model = models.find(m => m.id === id);
    if (!model) return;
    const newName = prompt("Enter new name:", model.name);
    if (newName && newName !== model.name) {
      setModels(prev => prev.map(m => m.id === id ? { ...m, name: newName } : m));
      addLog(`File renamed to ${newName}`);
    }
  };

  const duplicateModel = (id: string) => {
    const model = models.find(m => m.id === id);
    if (!model) return;
    const newModel = {
      ...model,
      id: Date.now().toString(),
      name: `${model.name}_copy`
    };
    setModels(prev => [...prev, newModel]);
    setActiveModelId(newModel.id);
    addLog(`File duplicated: ${newModel.name}`);
  };

  // Close context menu on click anywhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Auto-demo mode
  useEffect(() => {
    if (!isAuto) return;
    const interval = setInterval(() => {
      const time = Date.now() / 1000;
      setFingers(prev => prev.map((f, i) => ({
        l1: 100 + Math.sin(time + i) * 20,
        l2: 100 + Math.sin(time + i + (2 * Math.PI) / 3) * 20,
        l3: 100 + Math.sin(time + i + (4 * Math.PI) / 3) * 20,
      })));
    }, 50);
    return () => clearInterval(interval);
  }, [isAuto]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-100), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const reset = () => {
    setFingers([
      { l1: 100, l2: 100, l3: 100 },
      { l1: 100, l2: 100, l3: 100 },
      { l1: 100, l2: 100, l3: 100 },
    ]);
    setWorkspaceVars(prev => prev.map(v => ({ ...v, value: '100.00' })));
    setCableDistance(15);
    setIsAuto(false);
    setIsPlayingSequence(false);
    addLog("Workspace reset to default values.");
  };

  const saveActiveFile = () => {
    if (!activeModel) return;
    const blob = new Blob([activeModel.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeModel.name}.cpp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`Saved file: ${activeModel.name}.cpp`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
      
      // Create a new model instead of overwriting
      const newId = Date.now().toString();
      const newModel = { id: newId, name: fileName, code: content };
      setModels(prev => [...prev, newModel]);
      setActiveModelId(newId);
      
      addLog(`File imported: ${file.name}`);
      
      // Reset input so same file can be uploaded again if needed
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const folderId = Date.now().toString();
    const folderName = files[0].webkitRelativePath.split('/')[0] || 'Imported Folder';
    
    addLog(`Importing folder "${folderName}" with ${files.length} files...`);
    
    let importedCount = 0;
    const newModels: any[] = [];
    
    const relevantFiles = Array.from(files).filter(f => f.name.endsWith('.cpp') || f.name.endsWith('.txt') || f.name.endsWith('.ino'));
    
    if (relevantFiles.length === 0) {
      addLog("No supported files found in folder.");
      return;
    }

    relevantFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        
        const newId = (Date.now() + Math.random()).toString();
        newModels.push({ 
          id: newId, 
          name: fileName, 
          code: content,
          folderId,
          folderName
        });
        
        importedCount++;
        if (importedCount === relevantFiles.length) {
          setModels(prev => [...prev, ...newModels]);
          addLog(`Successfully imported ${importedCount} files from folder "${folderName}".`);
        }
      };
      reader.readAsText(file);
    });
    
    // Reset input
    e.target.value = '';
  };

  const runSequence = async () => {
    if (isPlayingSequence) return;
    setIsPlayingSequence(true);
    
    // If the active model is part of a folder, run all files in that folder in alphabetical order
    const modelsToRun = activeModel.folderId 
      ? models.filter(m => m.folderId === activeModel.folderId).sort((a, b) => a.name.localeCompare(b.name))
      : [activeModel];

    addLog(`Executing ${modelsToRun.length > 1 ? `folder "${activeModel.folderName}"` : 'script'} sequence...`);

    try {
      for (const model of modelsToRun) {
        if (modelsToRun.length > 1) addLog(`>>> Running file: ${model.name}`);
        
        const lines = model.code.split('\n');
        
        for (const line of lines) {
          // Check if we should stop
          let shouldStop = false;
          setIsPlayingSequence(prev => {
            if (!prev) shouldStop = true;
            return prev;
          });
          if (shouldStop) break;
          
          const cleanLine = line.split('//')[0].trim(); // Remove comments
          if (!cleanLine) continue;

          // Match assignments: L1 = 100;
          const assignmentMatch = cleanLine.match(/^([L123]+)\s*=\s*([0-9.]+);?$/i);
          if (assignmentMatch) {
            const name = assignmentMatch[1].toUpperCase();
            const val = assignmentMatch[2];
            setWorkspaceVars(prev => prev.map(v => v.name === `Finger1_${name}` ? { ...v, value: val } : v));
          }

          // Match delay: delay(1000);
          const delayMatch = cleanLine.match(/delay\s*\(\s*(\d+)\s*\)\s*;?/i);
          if (delayMatch) {
            const ms = parseInt(delayMatch[1]);
            addLog(`Waiting ${ms}ms...`);
            await new Promise(resolve => setTimeout(resolve, ms));
          }
        }
        
        if (!isPlayingSequence) break;
      }
      
      addLog("Execution completed.");
    } catch (e) {
      addLog("Error during execution: " + (e as Error).message);
    } finally {
      setIsPlayingSequence(false);
    }
  };

  const handleVarEdit = (name: string, value: string) => {
    const val = parseFloat(value);
    if (isNaN(val)) return;
    
    setWorkspaceVars(prev => prev.map(v => v.name === name ? { ...v, value: val.toFixed(2) } : v));
    addLog(`Variable ${name} updated to ${val}`);
    setEditingVar(null);
  };

  return (
    <div className="flex flex-col h-screen bg-[#f0f0f0] text-[#333] font-sans overflow-hidden select-none">
      {/* MATLAB Top Ribbon */}
      <div className="h-28 bg-[#f5f5f5] border-b border-[#ccc] flex flex-col">
        <div className="flex bg-[#e1e1e1] px-4 py-1 gap-4 text-[11px] font-medium text-[#555]">
          <span className="text-[#0056b3] border-b-2 border-[#0056b3] pb-0.5 cursor-pointer">HOME</span>
          <span className="hover:text-[#0056b3] cursor-pointer">PLOTS</span>
          <span className="hover:text-[#0056b3] cursor-pointer">APPS</span>
          <span className="hover:text-[#0056b3] cursor-pointer">EDITOR</span>
        </div>
        <div className="flex-1 flex items-center px-4 gap-6 bg-white">
          <RibbonButton 
            id="run-btn"
            icon={<Play size={24} className="text-green-600 fill-green-600/20" />} 
            label={activeModel.folderId ? "Run Folder" : "Run"} 
            onClick={runSequence}
            disabled={isPlayingSequence}
          />
          <RibbonButton 
            icon={<Square size={24} className="text-red-600 fill-red-600/20" />} 
            label="Stop" 
            onClick={() => setIsPlayingSequence(false)}
          />
          <div className="w-[1px] h-12 bg-[#ddd] mx-2" />
          <RibbonButton 
            icon={<Save size={24} className="text-blue-600" />} 
            label="Save File" 
            onClick={saveActiveFile}
          />
          <RibbonButton 
            icon={<Upload size={24} className="text-blue-600" />} 
            label="Import File" 
            onClick={() => fileInputRef.current?.click()}
          />
          <RibbonButton 
            icon={<RefreshCw size={24} className="text-orange-600" />} 
            label="Reset" 
            onClick={reset}
          />
          <div className="w-[1px] h-12 bg-[#ddd] mx-2" />
          <RibbonButton 
            icon={<Sliders size={24} className={cn(showManualOverride ? "text-blue-600" : "text-zinc-400")} />} 
            label="Manual Control" 
            onClick={() => setShowManualOverride(!showManualOverride)}
          />
          <RibbonButton 
            icon={<Layout size={24} className={cn(show3DFigure ? "text-blue-600" : "text-zinc-400")} />} 
            label="3D Figure" 
            onClick={() => setShow3DFigure(!show3DFigure)}
          />
          <div className="w-[1px] h-12 bg-[#ddd] mx-2" />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-[#888] font-bold uppercase">Current Folder</span>
            <div className="flex items-center gap-2 bg-[#f9f9f9] border border-[#ddd] px-2 py-1 rounded text-xs w-96">
              <Database size={12} className="text-[#888]" />
              <span className="truncate">C:\Users\odum\Documents\SpiRobs\Simulations\Project_01</span>
            </div>
          </div>
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
        accept=".txt,.cpp,.ino"
      />

      <input 
        type="file" 
        ref={folderInputRef} 
        onChange={handleFolderUpload} 
        className="hidden" 
        {...({ webkitdirectory: "", directory: "" } as any)}
      />

      {/* Main IDE Layout */}
      <PanelGroup orientation="horizontal" className="flex-1 overflow-hidden">
        {/* Left: Current Folder & Details */}
        <Panel defaultSize={20} minSize={10} className="bg-white flex flex-col shrink-0">
          <PanelGroup orientation="vertical">
            <Panel defaultSize={70} minSize={20} className="flex flex-col border-b border-[#ccc]">
              <div className="h-7 bg-[#f5f5f5] border-b border-[#eee] flex items-center px-3 justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[#666]"><Database size={14} /></span>
                  <span className="text-[11px] font-bold text-[#555] uppercase tracking-tight">Current Folder</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    title="Import File"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Upload size={13} />
                  </button>
                  <button 
                    onClick={() => folderInputRef.current?.click()}
                    title="Import Folder"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Folder size={13} />
                  </button>
                  <button 
                    onClick={() => {
                      const name = prompt("Enter file name (e.g. control.cpp):");
                      if (name) addModel(name.replace('.cpp', ''));
                    }}
                    title="New File"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 text-[11px]">
                {Object.entries(groupedModels).map(([folderId, group]) => (
                  <div key={folderId} className="mb-2">
                    {folderId !== 'root' && (
                      <div className="flex items-center gap-1 p-1 font-bold text-[#666] bg-[#f5f5f5] mb-1 rounded">
                        <ChevronRight size={10} />
                        <Folder size={12} className="text-orange-400" />
                        <span className="truncate">{group.name}</span>
                      </div>
                    )}
                    <div className={folderId !== 'root' ? "pl-3 space-y-0.5" : "space-y-0.5"}>
                      {group.models.map(m => (
                        <div 
                          key={m.id}
                          onClick={() => handleFileClick(m)}
                          onContextMenu={(e) => handleContextMenu(e, m.id)}
                          className={cn(
                            "flex items-center gap-2 p-1 hover:bg-[#f0f7ff] cursor-pointer transition-colors rounded",
                            activeModelId === m.id ? "bg-[#e5f1ff] text-[#0056b3] font-medium" : "text-[#555]"
                          )}
                        >
                          <FileCode size={14} className={activeModelId === m.id ? "text-blue-600" : "text-gray-400"} />
                          <span className="truncate">{m.name}.cpp</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            
            <ResizeHandle vertical />
            
            <Panel defaultSize={30} minSize={10} className="flex flex-col">
              <PanelHeader icon={<Info size={14} />} title="Details" />
              <div className="flex-1 p-3 text-[11px] text-[#555] flex flex-col gap-2 overflow-y-auto">
                {activeModel ? (
                  <>
                    <div className="font-semibold text-[#333] mb-1 text-[12px]">{activeModel.name}.cpp</div>
                    {activeModel.folderName && (
                      <div className="flex justify-between border-b border-[#eee] pb-1">
                        <span className="text-[#888]">Folder:</span>
                        <span className="font-mono">{activeModel.folderName}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-b border-[#eee] pb-1">
                      <span className="text-[#888]">Size:</span>
                      <span className="font-mono">{new Blob([activeModel.code]).size} bytes</span>
                    </div>
                    <div className="flex justify-between border-b border-[#eee] pb-1">
                      <span className="text-[#888]">Lines:</span>
                      <span className="font-mono">{activeModel.code.split('\n').length}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#eee] pb-1">
                      <span className="text-[#888]">Type:</span>
                      <span className="font-mono">C++ Source File</span>
                    </div>
                  </>
                ) : (
                  <div className="text-[#888] italic flex items-center justify-center h-full text-center">
                    Select a file to view details
                  </div>
                )}
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <ResizeHandle />

        {/* Center: 3D Plot & Command Window */}
        <Panel defaultSize={50} minSize={20} className="flex flex-col bg-[#e1e1e1] p-1 gap-1 overflow-hidden">
          <PanelGroup orientation="vertical">
            {/* 3D Visualization Pane - Positioned where the script was */}
            {show3DFigure && (
              <>
                <Panel defaultSize={70} minSize={20} className="bg-white border border-[#ccc] flex flex-col relative shadow-sm overflow-hidden">
                  <PanelHeader 
                    icon={<Layout size={14} />} 
                    title={`3D FIGURE: ${activeModel.name.toUpperCase()}`} 
                    onClose={() => setShow3DFigure(false)}
                  />
              <div className="flex-1 relative bg-[#fcfcfc]" ref={canvasRef}>
                <Canvas shadows>
                  <PerspectiveCamera makeDefault position={[200, 200, 200]} fov={45} />
                  <CustomControls fingers={fingers} cableDistance={cableDistance} />
                  <ambientLight intensity={0.5} />
                  <pointLight position={[100, 100, 100]} intensity={1} castShadow />
                  <SpiRobsModel fingers={fingers} cableDistance={cableDistance} />
                  <Environment preset="city" />
                  <ContactShadows position={[0, -30, 0]} opacity={0.4} scale={40} blur={2} far={10} />
                </Canvas>
                
                {/* Manual Controls Overlay */}
              {showManualOverride && (
                <motion.div 
                  drag
                  dragMomentum={false}
                  className="absolute top-4 right-4 bg-white/90 backdrop-blur border border-[#ccc] p-3 rounded shadow-lg flex flex-col gap-2 w-56 z-10 cursor-move"
                >
                  <div className="flex justify-between items-center border-b border-[#eee] pb-1 mb-1">
                    <span className="text-[10px] font-bold text-[#888] uppercase flex items-center gap-1">
                      <Sliders size={10} />
                      Multi-Finger Control
                    </span>
                    <X size={12} className="text-[#aaa] hover:text-[#666] cursor-pointer" onClick={() => setShowManualOverride(false)} />
                  </div>
                  
                  <div className="max-h-64 overflow-y-auto pr-1">
                    {fingers.map((f, i) => (
                      <div key={i} className="flex flex-col gap-1 border-b border-[#f0f0f0] pb-2 mb-1 last:border-0">
                        <span className="text-[9px] font-bold text-blue-600">Finger {i+1}</span>
                        <div className="flex flex-col gap-1 pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
                          <label className="text-[9px] text-[#666]">L1: {f.l1.toFixed(0)}mm</label>
                          <input type="range" min="50" max="150" value={f.l1} onChange={(e) => {
                            const newF = JSON.parse(JSON.stringify(fingers));
                            newF[i].l1 = parseFloat(e.target.value);
                            setFingers(newF);
                          }} className="h-1 accent-[#0056b3]" />
                        </div>
                        <div className="flex flex-col gap-1 pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
                          <label className="text-[9px] text-[#666]">L2: {f.l2.toFixed(0)}mm</label>
                          <input type="range" min="50" max="150" value={f.l2} onChange={(e) => {
                            const newF = JSON.parse(JSON.stringify(fingers));
                            newF[i].l2 = parseFloat(e.target.value);
                            setFingers(newF);
                          }} className="h-1 accent-[#0056b3]" />
                        </div>
                        <div className="flex flex-col gap-1 pointer-events-auto" onPointerDown={(e) => e.stopPropagation()}>
                          <label className="text-[9px] text-[#666]">L3: {f.l3.toFixed(0)}mm</label>
                          <input type="range" min="50" max="150" value={f.l3} onChange={(e) => {
                            const newF = JSON.parse(JSON.stringify(fingers));
                            newF[i].l3 = parseFloat(e.target.value);
                            setFingers(newF);
                          }} className="h-1 accent-[#0056b3]" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => setIsAuto(!isAuto)}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={cn("mt-2 text-[10px] py-1 rounded border transition-colors pointer-events-auto", isAuto ? "bg-blue-500 text-white border-blue-600" : "bg-white text-blue-600 border-blue-200 hover:bg-blue-50")}
                  >
                    {isAuto ? "Stop Demo" : "Start Demo"}
                  </button>
                </motion.div>
              )}
            </div>
            </Panel>
            {show3DFigure && <ResizeHandle vertical />}
            </>
          )}

          {/* Bottom: Command Window */}
          <Panel defaultSize={show3DFigure ? 30 : 100} minSize={10} className="bg-white border border-[#ccc] flex flex-col shadow-sm overflow-hidden">
            <PanelHeader 
              icon={<Terminal size={14} />} 
              title="Command Window" 
              actions={
                <button onClick={() => setLogs([])} className="text-[#888] hover:text-[#333] p-1 rounded hover:bg-[#eee] transition-colors" title="Clear Console">
                  <Trash2 size={12} />
                </button>
              }
            />
            <div className="flex-1 p-3 font-mono text-[11px] text-[#333] overflow-y-auto bg-white">
              {logs.map((log, i) => (
                <div key={i} className="mb-0.5">
                  <span className="text-[#0056b3] mr-2">&gt;&gt;</span>
                  {log}
                </div>
              ))}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[#0056b3]">&gt;&gt;</span>
                <input 
                  type="text" 
                  className="flex-1 focus:outline-none" 
                  placeholder="Enter command..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const cmd = (e.target as HTMLInputElement).value;
                      addLog(cmd);
                      if (cmd.toLowerCase() === 'clc') setLogs([]);
                      if (cmd.toLowerCase() === 'reset') reset();
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
              </div>
            </div>
          </Panel>
          </PanelGroup>
        </Panel>

        <ResizeHandle />

        {/* Right: Workspace & Editor */}
        <Panel defaultSize={30} minSize={20} className="bg-[#e1e1e1] flex flex-col shrink-0 p-1 gap-1">
          <PanelGroup orientation="vertical">
            {/* Workspace */}
            <Panel defaultSize={40} minSize={10} className="bg-white border border-[#ccc] flex flex-col shadow-sm overflow-hidden">
              <PanelHeader icon={<Database size={14} />} title="Workspace" />
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-[#f5f5f5] text-[#666] border-b border-[#eee]">
                      <th className="text-left p-2 font-medium">Name</th>
                      <th className="text-left p-2 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspaceVars.map(v => (
                      <WorkspaceRow 
                        key={v.id}
                        name={v.name} 
                        value={v.value} 
                        onEdit={() => setEditingVar({ name: v.name, value: v.value })}
                      />
                    ))}
                  </tbody>
                </table>
                <button 
                  onClick={addWorkspaceVar}
                  className="w-full p-2 text-[10px] text-blue-600 hover:bg-blue-50 text-left border-t border-[#eee]"
                >
                  + Add Variable
                </button>
              </div>
            </Panel>

            <ResizeHandle vertical />

            {/* Editor / Script Area - Now in the right sidebar */}
            <Panel defaultSize={60} minSize={20} className="bg-white border border-[#ccc] flex flex-col shadow-sm overflow-hidden">
              <div className="bg-[#f0f0f0] border-b border-[#ccc] px-2 py-1 flex items-center justify-between">
                <div className="flex items-center gap-1 text-[11px] font-bold text-[#555] uppercase">
                  <FileCode size={14} className="text-blue-600" />
                  Editor
                </div>
                <button onClick={() => addModel()} className="px-2 py-1 text-[10px] text-blue-600 hover:bg-blue-50 font-bold">+</button>
              </div>
              <div className="bg-[#f5f5f5] border-b border-[#eee] flex items-center gap-1 overflow-x-auto no-scrollbar px-1">
                {models.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setActiveModelId(m.id)}
                    className={cn(
                      "px-2 py-1 text-[9px] transition-colors whitespace-nowrap border-b-2",
                      activeModelId === m.id 
                        ? "border-blue-600 text-blue-600 font-bold bg-white" 
                        : "border-transparent text-[#666] hover:bg-[#e5e5e5]"
                    )}
                  >
                    {m.name}.m
                  </button>
                ))}
              </div>
              <div className="flex-1 flex overflow-hidden">
                <Editor
                  height="100%"
                  language="cpp"
                  theme="light"
                  value={activeModel.code}
                  onChange={(value) => {
                    setModels(models.map(m => m.id === activeModelId ? { ...m, code: value || '' } : m));
                  }}
                  onMount={(editor) => {
                    editor.onDidChangeCursorPosition((e) => {
                      setCursorPos({ lineNumber: e.position.lineNumber, column: e.position.column });
                    });
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    lineNumbersMinChars: 3,
                    padding: { top: 8 },
                  }}
                />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>

      {/* Status Bar */}
      <div className="h-6 bg-[#f5f5f5] border-t border-[#ccc] flex items-center px-4 justify-between text-[10px] text-[#666] shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <div className={cn("w-2 h-2 rounded-full", isPlayingSequence ? "bg-green-500 animate-pulse" : "bg-zinc-400")} />
            {isPlayingSequence ? "Executing..." : "Ready"}
          </span>
          <span>Ln {cursorPos.lineNumber}, Col {cursorPos.column}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>SpiRobs-Engine v1.3</span>
        </div>
      </div>

      {/* Variable Edit Modal */}
      {editingVar && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white border border-[#ccc] shadow-2xl rounded p-4 w-64">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold text-[#555]">Edit Variable: {editingVar.name}</span>
              <X size={14} className="cursor-pointer text-[#888]" onClick={() => setEditingVar(null)} />
            </div>
            <input 
              autoFocus
              type="number"
              className="w-full border border-[#ddd] p-2 text-sm mb-4 focus:outline-none focus:border-[#0056b3]"
              value={editingVar.value}
              onChange={(e) => setEditingVar({...editingVar, value: e.target.value})}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleVarEdit(editingVar.name, editingVar.value);
                if (e.key === 'Escape') setEditingVar(null);
              }}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingVar(null)} className="px-3 py-1 text-xs text-[#666] hover:bg-[#f5f5f5] rounded">Cancel</button>
              <button onClick={() => handleVarEdit(editingVar.name, editingVar.value)} className="px-3 py-1 text-xs bg-[#0056b3] text-white rounded">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Variable Modal */}
      {isAddVarModalOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white border border-[#ccc] shadow-2xl rounded p-4 w-72">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold text-[#555] uppercase tracking-tight">Add New Variable</span>
              <X size={14} className="cursor-pointer text-[#888]" onClick={() => setIsAddVarModalOpen(false)} />
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[#888] font-bold uppercase block mb-1">Name</label>
                <input 
                  autoFocus
                  type="text"
                  placeholder="e.g. MyVar"
                  className="w-full border border-[#ddd] p-2 text-sm focus:outline-none focus:border-[#0056b3]"
                  value={newVarName}
                  onChange={(e) => setNewVarName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmAddVar();
                    if (e.key === 'Escape') setIsAddVarModalOpen(false);
                  }}
                />
              </div>
              <div>
                <label className="text-[10px] text-[#888] font-bold uppercase block mb-1">Initial Value</label>
                <input 
                  type="text"
                  placeholder="0.00"
                  className="w-full border border-[#ddd] p-2 text-sm focus:outline-none focus:border-[#0056b3]"
                  value={newVarValue}
                  onChange={(e) => setNewVarValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmAddVar();
                    if (e.key === 'Escape') setIsAddVarModalOpen(false);
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button 
                onClick={() => setIsAddVarModalOpen(false)} 
                className="px-4 py-1.5 text-xs text-[#666] hover:bg-[#f5f5f5] rounded border border-[#ddd]"
              >
                Cancel
              </button>
              <button 
                onClick={confirmAddVar} 
                disabled={!newVarName.trim()}
                className="px-4 py-1.5 text-xs bg-[#0056b3] text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Variable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-white border border-[#ccc] shadow-lg rounded py-1 z-[100] min-w-[120px] text-[11px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center gap-2"
            onClick={() => { renameModel(contextMenu.modelId); setContextMenu(null); }}
          >
            <Settings size={12} /> Rename
          </button>
          <button 
            className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center gap-2"
            onClick={() => { duplicateModel(contextMenu.modelId); setContextMenu(null); }}
          >
            <Upload size={12} className="rotate-180" /> Duplicate
          </button>
          <div className="h-[1px] bg-[#eee] my-1" />
          <button 
            className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 flex items-center gap-2"
            onClick={() => { deleteModel(contextMenu.modelId); setContextMenu(null); }}
          >
            <X size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function RibbonButton({ id, icon, label, onClick, disabled }: { id?: string, icon: React.ReactNode, label: string, onClick?: () => void, disabled?: boolean }) {
  return (
    <button 
      id={id}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-1 p-2 rounded hover:bg-[#f0f0f0] transition-colors min-w-[64px]",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

function PanelHeader({ icon, title, onClose, actions }: { icon: React.ReactNode, title: string, onClose?: () => void, actions?: React.ReactNode }) {
  return (
    <div className="h-7 bg-[#f5f5f5] border-b border-[#eee] flex items-center px-3 justify-between shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-[#666]">{icon}</span>
        <span className="text-[11px] font-bold text-[#555] uppercase tracking-tight">{title}</span>
      </div>
      <div className="flex items-center gap-1">
        {actions}
        <Maximize2 size={10} className="text-[#aaa] hover:text-[#666] cursor-pointer" />
        <X size={12} className="text-[#aaa] hover:text-[#666] cursor-pointer" onClick={onClose} />
      </div>
    </div>
  );
}

function WorkspaceRow({ name, value, onEdit }: { name: string, value: string, onEdit?: () => void }) {
  return (
    <tr 
      className={cn(
        "border-b border-[#f9f9f9] hover:bg-[#f0f7ff] transition-colors group",
        onEdit && "cursor-pointer"
      )}
      onDoubleClick={onEdit}
    >
      <td className="p-2 text-[#0056b3] font-mono">{name}</td>
      <td className="p-2 text-[#333] font-mono flex items-center justify-between">
        {value}
        {onEdit && <Settings size={10} className="text-[#ccc] opacity-0 group-hover:opacity-100" />}
      </td>
    </tr>
  );
}

