import React, { useState } from 'react';
import { 
  FileText, 
  Layers, 
  Film, 
  Download, 
  Plus, 
  Trash2, 
  Copy, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Play, 
  Pause, 
  RefreshCw,
  Code,
  Terminal,
  CheckCircle,
  XCircle,
  Info,
  Upload
} from 'lucide-react';
import type { Document, Page, State, Layer, CanvasObject } from '../types';
import { generateCSS } from '../utils/canvasHelper';

interface RightPanelsProps {
  document: Document;
  setDocument: React.Dispatch<React.SetStateAction<Document>>;
  selectedObject: CanvasObject | null;
  selectedObjectIds: string[];
  setSelectedObjectIds: (ids: string[]) => void;
  // Animation state controls
  isPlayingAnimation: boolean;
  setIsPlayingAnimation: (playing: boolean) => void;
  onExportSlice: (sliceId: string) => void;
  onExportAllSlices: () => void;
  onFlattenLayer: (layerId: string) => void;
  showSlicesOverlay: boolean;
  setShowSlicesOverlay: (show: boolean) => void;
  lockSlicesOverlay: boolean;
  setLockSlicesOverlay: (lock: boolean) => void;
  onRunMacro: (json: string) => { success: boolean; message: string };
}

export const RightPanels: React.FC<RightPanelsProps> = ({
  document: doc,
  setDocument,
  selectedObject,
  selectedObjectIds,
  setSelectedObjectIds,
  isPlayingAnimation,
  setIsPlayingAnimation,
  onExportSlice,
  onExportAllSlices,
  onFlattenLayer,
  showSlicesOverlay,
  setShowSlicesOverlay,
  lockSlicesOverlay,
  setLockSlicesOverlay,
  onRunMacro
}) => {
  // Collapsed states
  const [collapsed, setCollapsed] = useState({
    pages: false,
    states: false,
    layers: false,
    export: false,
    macro: false
  });

  const toggleCollapse = (panel: keyof typeof collapsed) => {
    setCollapsed(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  const activePage = doc.pages.find(p => p.id === doc.currentPageId) || doc.pages[0];
  const activeState = activePage?.states.find(s => s.id === doc.currentStateId) || activePage?.states[0];

  // ----------------------------------------------------
  // PAGES HANDLERS
  // ----------------------------------------------------
  const addPage = () => {
    const newPageId = `page-${Date.now()}`;
    const newPage: Page = {
      id: newPageId,
      name: `Page ${doc.pages.length + 1}`,
      width: activePage?.width || 800,
      height: activePage?.height || 600,
      states: [
        {
          id: `state-${Date.now()}`,
          name: 'State 1',
          delay: 100,
          layers: [
            {
              id: `layer-${Date.now()}`,
              name: 'Layer 1',
              visible: true,
              locked: false,
              objects: []
            }
          ]
        }
      ]
    };

    setDocument(prev => ({
      ...prev,
      pages: [...prev.pages, newPage],
      currentPageId: newPageId,
      currentStateId: newPage.states[0].id
    }));
  };

  const deletePage = (pageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (doc.pages.length <= 1) return;
    const remainingPages = doc.pages.filter(p => p.id !== pageId);
    const fallbackPage = remainingPages[0];
    
    setDocument(prev => ({
      ...prev,
      pages: remainingPages,
      currentPageId: prev.currentPageId === pageId ? fallbackPage.id : prev.currentPageId,
      currentStateId: prev.currentPageId === pageId ? fallbackPage.states[0].id : prev.currentStateId
    }));
  };

  const selectPage = (pageId: string) => {
    const page = doc.pages.find(p => p.id === pageId);
    if (!page) return;
    
    setDocument(prev => ({
      ...prev,
      currentPageId: pageId,
      currentStateId: page.states[0].id
    }));
    setSelectedObjectIds([]);
  };

  // ----------------------------------------------------
  // STATES (FRAMES) HANDLERS
  // ----------------------------------------------------
  const addState = () => {
    if (!activePage) return;
    const newStateId = `state-${Date.now()}`;
    
    // Copy layers from active state to make animation framing easy
    const copiedLayers = activeState ? JSON.parse(JSON.stringify(activeState.layers)) : [
      {
        id: `layer-${Date.now()}`,
        name: 'Layer 1',
        visible: true,
        locked: false,
        objects: []
      }
    ];

    const newState: State = {
      id: newStateId,
      name: `State ${activePage.states.length + 1}`,
      delay: activeState?.delay || 100,
      layers: copiedLayers
    };

    setDocument(prev => {
      const pages = prev.pages.map(p => {
        if (p.id === prev.currentPageId) {
          return { ...p, states: [...p.states, newState] };
        }
        return p;
      });
      return { ...prev, pages, currentStateId: newStateId };
    });
  };

  const deleteState = (stateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activePage || activePage.states.length <= 1) return;
    const remainingStates = activePage.states.filter(s => s.id !== stateId);
    const fallbackState = remainingStates[0];

    setDocument(prev => {
      const pages = prev.pages.map(p => {
        if (p.id === prev.currentPageId) {
          return { ...p, states: remainingStates };
        }
        return p;
      });
      return { 
        ...prev, 
        pages, 
        currentStateId: prev.currentStateId === stateId ? fallbackState.id : prev.currentStateId 
      };
    });
  };

  const selectState = (stateId: string) => {
    setDocument(prev => ({ ...prev, currentStateId: stateId }));
    setSelectedObjectIds([]);
  };

  const updateStateDelay = (stateId: string, delay: number) => {
    setDocument(prev => {
      const pages = prev.pages.map(p => {
        if (p.id === prev.currentPageId) {
          const states = p.states.map(s => {
            if (s.id === stateId) return { ...s, delay };
            return s;
          });
          return { ...p, states };
        }
        return p;
      });
      return { ...prev, pages };
    });
  };

  // ----------------------------------------------------
  // LAYERS HANDLERS
  // ----------------------------------------------------
  const addLayer = () => {
    if (!activePage || !activeState) return;
    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name: `Layer ${activeState.layers.length + 1}`,
      visible: true,
      locked: false,
      objects: []
    };

    setDocument(prev => {
      const pages = prev.pages.map(p => {
        if (p.id === prev.currentPageId) {
          const states = p.states.map(s => {
            if (s.id === prev.currentStateId) {
              return { ...s, layers: [newLayer, ...s.layers] }; // Add to top
            }
            return s;
          });
          return { ...p, states };
        }
        return p;
      });
      return { ...prev, pages };
    });
  };

  const deleteLayer = (layerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeState || activeState.layers.length <= 1) return;

    setDocument(prev => {
      const pages = prev.pages.map(p => {
        if (p.id === prev.currentPageId) {
          const states = p.states.map(s => {
            if (s.id === prev.currentStateId) {
              return { ...s, layers: s.layers.filter(l => l.id !== layerId) };
            }
            return s;
          });
          return { ...p, states };
        }
        return p;
      });
      return { ...prev, pages };
    });
    setSelectedObjectIds([]);
  };

  const toggleLayerVisibility = (layerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDocument(prev => {
      const pages = prev.pages.map(p => {
        if (p.id === prev.currentPageId) {
          const states = p.states.map(s => {
            if (s.id === prev.currentStateId) {
              const layers = s.layers.map(l => {
                if (l.id === layerId) return { ...l, visible: !l.visible };
                return l;
              });
              return { ...s, layers };
            }
            return s;
          });
          return { ...p, states };
        }
        return p;
      });
      return { ...prev, pages };
    });
  };

  const toggleLayerLock = (layerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDocument(prev => {
      const pages = prev.pages.map(p => {
        if (p.id === prev.currentPageId) {
          const states = p.states.map(s => {
            if (s.id === prev.currentStateId) {
              const layers = s.layers.map(l => {
                if (l.id === layerId) return { ...l, locked: !l.locked };
                return l;
              });
              return { ...s, layers };
            }
            return s;
          });
          return { ...p, states };
        }
        return p;
      });
      return { ...prev, pages };
    });
  };

  // Get active slices for the slices export list
  const activeSlices: CanvasObject[] = [];
  activeState?.layers.forEach(layer => {
    layer.objects.forEach(obj => {
      if (obj.type === 'slice') activeSlices.push(obj);
    });
  });

  return (
    <div className="right-sidebar">
      {/* 1. PAGES PANEL */}
      <div className="sidebar-panel">
        <div className="sidebar-panel-header" onClick={() => toggleCollapse('pages')}>
          <span className="sidebar-panel-title">
            <FileText size={16} /> Pages ({doc.pages.length})
          </span>
          <button className="icon-action-btn" onClick={(e) => { e.stopPropagation(); addPage(); }}>
            <Plus size={16} />
          </button>
        </div>
        
        {!collapsed.pages && (
          <div className="sidebar-panel-content">
            {doc.pages.map(p => (
              <div 
                key={p.id} 
                className={`panel-list-item ${p.id === doc.currentPageId ? 'selected-active' : ''}`}
                onClick={() => selectPage(p.id)}
              >
                <span className="item-name-section">
                  <FileText size={14} className="text-secondary" />
                  {p.name}
                </span>
                <span className="item-actions">
                  <button 
                    className="icon-action-btn" 
                    disabled={doc.pages.length <= 1}
                    onClick={(e) => deletePage(p.id, e)}
                  >
                    <Trash2 size={12} className={doc.pages.length <= 1 ? 'opacity-30' : ''} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. STATES (FRAMES) PANEL */}
      <div className="sidebar-panel">
        <div className="sidebar-panel-header" onClick={() => toggleCollapse('states')}>
          <span className="sidebar-panel-title">
            <Film size={16} /> States / Frames ({activePage?.states.length || 0})
          </span>
          <div className="item-actions" style={{ gap: '2px' }}>
            <button 
              className={`icon-action-btn ${isPlayingAnimation ? 'active text-gold' : ''}`} 
              onClick={(e) => { e.stopPropagation(); setIsPlayingAnimation(!isPlayingAnimation); }}
              title={isPlayingAnimation ? "Pause Preview" : "Play Preview"}
            >
              {isPlayingAnimation ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button className="icon-action-btn" onClick={(e) => { e.stopPropagation(); addState(); }}>
              <Plus size={16} />
            </button>
          </div>
        </div>

        {!collapsed.states && activePage && (
          <div className="sidebar-panel-content">
            {activePage.states.map((s) => (
              <div 
                key={s.id} 
                className={`panel-list-item ${s.id === doc.currentStateId ? 'selected-active' : ''}`}
                onClick={() => selectState(s.id)}
              >
                <span className="item-name-section" style={{ fontStyle: isPlayingAnimation ? 'italic' : 'normal' }}>
                  <Film size={14} className="text-secondary" />
                  {s.name}
                </span>
                <span className="item-actions" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    style={{ width: '45px', background: 'var(--bg-control)', border: '1px solid var(--border-light)', borderRadius: '3px', color: 'white', fontSize: '11px', textAlign: 'center', padding: '1px' }}
                    value={s.delay}
                    onChange={(e) => updateStateDelay(s.id, Math.max(10, Number(e.target.value)))}
                    title="Delay in ms"
                  />
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>ms</span>
                  <button 
                    className="icon-action-btn" 
                    disabled={activePage.states.length <= 1}
                    onClick={(e) => deleteState(s.id, e)}
                  >
                    <Trash2 size={12} className={activePage.states.length <= 1 ? 'opacity-30' : ''} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. LAYERS PANEL */}
      <div className="sidebar-panel" style={{ flex: 1 }}>
        <div className="sidebar-panel-header" onClick={() => toggleCollapse('layers')}>
          <span className="sidebar-panel-title">
            <Layers size={16} /> Layers ({activeState?.layers.length || 0})
          </span>
          <button className="icon-action-btn" onClick={(e) => { e.stopPropagation(); addLayer(); }}>
            <Plus size={16} />
          </button>
        </div>

        {!collapsed.layers && activeState && (
          <div className="sidebar-panel-content">
            {activeState.layers.map(layer => (
              <div key={layer.id} style={{ marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '6px' }}>
                <div 
                  className="panel-list-item" 
                  style={{ fontWeight: 600, background: 'rgba(255,255,255,0.02)' }}
                >
                  <span className="item-name-section">
                    <Layers size={13} style={{ color: 'var(--accent-gold)' }} />
                    {layer.name}
                  </span>
                  
                  <span className="item-actions">
                    {/* Flatten layer option */}
                    {layer.objects.length > 0 && (
                      <button
                        className="icon-action-btn"
                        style={{ fontSize: '10px', padding: '1px 4px', width: 'auto' }}
                        title="Flatten vectors/bitmaps into a single raster bitmap"
                        onClick={() => onFlattenLayer(layer.id)}
                      >
                        <RefreshCw size={11} style={{ marginRight: '2px' }} /> Flat
                      </button>
                    )}
                    
                    <button className="icon-action-btn" onClick={(e) => toggleLayerVisibility(layer.id, e)}>
                      {layer.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-muted" />}
                    </button>
                    
                    <button className="icon-action-btn" onClick={(e) => toggleLayerLock(layer.id, e)}>
                      {layer.locked ? <Lock size={13} className="text-gold" /> : <Unlock size={13} />}
                    </button>
                    
                    <button 
                      className="icon-action-btn" 
                      disabled={activeState.layers.length <= 1}
                      onClick={(e) => deleteLayer(layer.id, e)}
                    >
                      <Trash2 size={12} className={activeState.layers.length <= 1 ? 'opacity-30' : ''} />
                    </button>
                  </span>
                </div>

                {/* Sub-list of objects inside this layer */}
                <div style={{ paddingLeft: '16px', marginTop: '2px' }}>
                  {layer.objects.map(obj => {
                    const isSelected = selectedObjectIds.includes(obj.id);
                    return (
                      <div
                        key={obj.id}
                        className={`panel-list-item ${isSelected ? 'active text-gold' : ''}`}
                        style={{ padding: '3px 6px', fontSize: '12px' }}
                        onClick={() => setSelectedObjectIds([obj.id])}
                      >
                        <span className="item-name-section">
                          <span style={{ fontSize: '9px', textTransform: 'uppercase', background: 'rgba(255,255,255,0.07)', padding: '1px 4px', borderRadius: '3px', color: 'var(--text-secondary)' }}>
                            {obj.type}
                          </span>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                            {obj.type === 'slice' ? obj.name : obj.type === 'text' ? obj.text.slice(0, 15) : obj.id.slice(0, 8)}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                  {layer.objects.length === 0 && (
                    <div style={{ padding: '4px 6px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Layer is empty
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. WEB EXPORT & CSS CODES PANEL */}
      <div className="sidebar-panel">
        <div className="sidebar-panel-header" onClick={() => toggleCollapse('export')}>
          <span className="sidebar-panel-title">
            <Download size={16} /> Slice & Code Export
          </span>
          <div className="item-actions" onClick={(e) => e.stopPropagation()} style={{ gap: '2px', display: 'flex', alignItems: 'center' }}>
            <button 
              className={`icon-action-btn ${showSlicesOverlay ? 'active' : ''}`}
              onClick={() => setShowSlicesOverlay(!showSlicesOverlay)}
              title={showSlicesOverlay ? "Hide Slices on Canvas" : "Show Slices on Canvas"}
            >
              {showSlicesOverlay ? <Eye size={13} /> : <EyeOff size={13} className="text-muted" />}
            </button>
            <button 
              className={`icon-action-btn ${lockSlicesOverlay ? 'active text-gold' : ''}`}
              onClick={() => setLockSlicesOverlay(!lockSlicesOverlay)}
              title={lockSlicesOverlay ? "Unlock Slices (Selectable)" : "Lock Slices (Unselectable)"}
            >
              {lockSlicesOverlay ? <Lock size={13} className="text-gold" /> : <Unlock size={13} />}
            </button>
          </div>
        </div>

        {!collapsed.export && (
          <div className="sidebar-panel-content" style={{ gap: '8px', display: 'flex', flexDirection: 'column' }}>
            
            {/* Slice Export Buttons */}
            <div>
              <span className="control-label" style={{ display: 'block', marginBottom: '6px' }}>Slices in design ({activeSlices.length})</span>
              {activeSlices.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto', marginBottom: '8px' }}>
                  {activeSlices.map(slice => (
                    <div key={slice.id} className="panel-list-item" style={{ padding: '4px 8px' }}>
                      <span className="item-name-section" style={{ fontSize: '12px', color: 'var(--accent-green)' }}>
                        #{slice.type === 'slice' ? slice.name : ''} ({'format' in slice ? slice.format.toUpperCase() : ''})
                      </span>
                      <button 
                        className="btn-primary" 
                        style={{ padding: '2px 6px', fontSize: '10px' }}
                        onClick={() => onExportSlice(slice.id)}
                      >
                        Export
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '8px' }}>
                  No slices defined. Use Slice Tool (Y) to cut export areas.
                </div>
              )}

              {activeSlices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  <button 
                    className="btn-primary" 
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={onExportAllSlices}
                  >
                    <Download size={13} /> Export All Slices
                  </button>
                </div>
              )}
            </div>

            {/* CSS Live Code Panel */}
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '8px', marginTop: '4px' }}>
              <span className="control-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <Code size={13} /> CSS Properties (Live)
              </span>
              
              {selectedObject ? (
                <>
                  <div className="css-code-panel">
                    {generateCSS(selectedObject)}
                  </div>
                  <button 
                    className="btn-secondary" 
                    style={{ width: '100%', marginTop: '6px', justifyContent: 'center' }}
                    onClick={() => {
                      navigator.clipboard.writeText(generateCSS(selectedObject));
                      alert('CSS copied to clipboard!');
                    }}
                  >
                    <Copy size={13} /> Copy CSS Styles
                  </button>
                </>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Select a shape or text element to view automatically generated CSS code.
                </div>
              )}
            </div>
            
          </div>
        )}
      </div>

      {/* ── MACRO PANEL ────────────────────────── */}
      <div className="sidebar-panel">
        <div className="sidebar-panel-header" onClick={() => toggleCollapse('macro')}>
          <span className="sidebar-panel-title">
            <Terminal size={13} style={{ marginRight: 6 }} />
            マクロ実行 (Macro Runner)
          </span>
          <span style={{ fontSize: '10px', opacity: 0.5 }}>{collapsed.macro ? '▶' : '▼'}</span>
        </div>
        {!collapsed.macro && (
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <MacroPanel onRunMacro={onRunMacro} document={doc} />
          </div>
        )}
      </div>

    </div>
  );
};


// ─────────────────────────────────────────────────────────
// Macro export: convert Document state → JSON macro commands
// ─────────────────────────────────────────────────────────

function documentToMacro(doc: Document): object {
  const page = doc.pages.find(p => p.id === doc.currentPageId) || doc.pages[0];
  const isMultiState = page.states.length > 1;
  const commands: object[] = [];

  // 1. Set canvas size
  commands.push({ command: 'set_canvas', width: page.width, height: page.height, name: page.name });
  commands.push({ command: 'clear_canvas' });

  // Helper: convert a single CanvasObject to one or more macro commands
  function objToCommands(obj: CanvasObject): object[] {
    switch (obj.type) {
      case 'rect': {
        const cmd: Record<string, unknown> = {
          command: 'add_rect',
          x: obj.x, y: obj.y, width: obj.width, height: obj.height,
        };
        if (obj.fill && obj.fill !== 'none') cmd.fill = obj.fill;
        if (obj.stroke && obj.stroke !== 'none') { cmd.stroke = obj.stroke; cmd.strokeWidth = obj.strokeWidth; }
        if (obj.rx) cmd.rx = obj.rx;
        if (obj.opacity !== 100) cmd.opacity = obj.opacity;
        if (obj.blendMode && obj.blendMode !== 'source-over') cmd.blendMode = obj.blendMode;
        if (obj.shadowBlur) { cmd.shadowColor = obj.shadowColor; cmd.shadowBlur = obj.shadowBlur; cmd.shadowOffsetX = obj.shadowOffsetX; cmd.shadowOffsetY = obj.shadowOffsetY; }
        return [cmd];
      }
      case 'ellipse': {
        const cmd: Record<string, unknown> = {
          command: 'add_ellipse',
          cx: obj.cx, cy: obj.cy, rx: obj.rx, ry: obj.ry,
        };
        if (obj.fill && obj.fill !== 'none') cmd.fill = obj.fill;
        if (obj.stroke && obj.stroke !== 'none') { cmd.stroke = obj.stroke; cmd.strokeWidth = obj.strokeWidth; }
        if (obj.opacity !== 100) cmd.opacity = obj.opacity;
        if (obj.blendMode && obj.blendMode !== 'source-over') cmd.blendMode = obj.blendMode;
        if (obj.shadowBlur) { cmd.shadowColor = obj.shadowColor; cmd.shadowBlur = obj.shadowBlur; cmd.shadowOffsetX = obj.shadowOffsetX; cmd.shadowOffsetY = obj.shadowOffsetY; }
        return [cmd];
      }
      case 'line': {
        const cmd: Record<string, unknown> = {
          command: 'add_line',
          x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2,
          stroke: obj.stroke, strokeWidth: obj.strokeWidth,
        };
        if (obj.opacity !== 100) cmd.opacity = obj.opacity;
        if (obj.blendMode && obj.blendMode !== 'source-over') cmd.blendMode = obj.blendMode;
        return [cmd];
      }
      case 'text': {
        const cmd: Record<string, unknown> = {
          command: 'add_text',
          x: obj.x, y: obj.y, width: obj.width, height: obj.height,
          text: obj.text, fontSize: obj.fontSize,
        };
        if (obj.fontFamily && obj.fontFamily !== 'Outfit') cmd.fontFamily = obj.fontFamily;
        if (obj.fontWeight !== 'normal') cmd.fontWeight = obj.fontWeight;
        if (obj.fontStyle !== 'normal') cmd.fontStyle = obj.fontStyle;
        if (obj.fill) cmd.fill = obj.fill;
        if (obj.textAlign !== 'left') cmd.textAlign = obj.textAlign;
        if (obj.opacity !== 100) cmd.opacity = obj.opacity;
        if (obj.shadowBlur) { cmd.shadowColor = obj.shadowColor; cmd.shadowBlur = obj.shadowBlur; cmd.shadowOffsetX = obj.shadowOffsetX; cmd.shadowOffsetY = obj.shadowOffsetY; }
        return [cmd];
      }
      case 'slice': {
        const cmd: Record<string, unknown> = {
          command: 'add_slice',
          x: obj.x, y: obj.y, width: obj.width, height: obj.height,
          name: obj.name, format: obj.format,
        };
        if (obj.quality !== 90) cmd.quality = obj.quality;
        return [cmd];
      }
      // bitmap and path are not representable in macro format
      default:
        return [];
    }
  }

  // 2. Emit states / layers / objects
  page.states.forEach((state, stateIdx) => {
    if (isMultiState && stateIdx > 0) {
      // Insert add_state command for frames 2+
      commands.push({ command: 'add_state', name: state.name, delay: state.delay });
    } else if (isMultiState && stateIdx === 0 && state.delay !== 100) {
      // First state delay customisation is stored separately (runner reads it from first state)
    }

    // Layers are drawn bottom-to-top; in the document they are stored top-to-bottom (index 0 = top).
    // Reverse so we emit background layers first.
    const orderedLayers = [...state.layers].reverse();
    orderedLayers.forEach(layer => {
      if (!layer.visible) return; // skip hidden layers
      layer.objects.forEach(obj => {
        objToCommands(obj).forEach(cmd => commands.push(cmd));
      });
    });
  });

  return {
    schema: '1.0',
    title: page.name,
    description: `Exported from Pyrotechnic — ${new Date().toISOString().slice(0, 10)}`,
    commands,
  };
}

// ─────────────────────────────────────────────────────────
// MacroPanel sub-component
// ─────────────────────────────────────────────────────────

interface MacroPanelProps {
  onRunMacro: (json: string) => { success: boolean; message: string };
  document: Document;
}

const MacroPanel: React.FC<MacroPanelProps> = ({ onRunMacro, document: doc }) => {
  const [macroText, setMacroText] = useState('');
  const [status, setStatus] = useState<{ success: boolean; message: string; info?: boolean } | null>(null);

  const handleRun = () => {
    if (!macroText.trim()) {
      setStatus({ success: false, message: 'マクロが空です。JSONを貼り付けてください。' });
      return;
    }
    const result = onRunMacro(macroText);
    setStatus(result);
  };

  const handleClear = () => {
    setMacroText('');
    setStatus(null);
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(macroText);
      setMacroText(JSON.stringify(parsed, null, 2));
      setStatus(null);
    } catch (e) {
      setStatus({ success: false, message: `JSON整形エラー: ${(e as Error).message}` });
    }
  };

  const handleLoadExample = () => {
    const example = {
      schema: "1.0",
      title: "Pyrotechnic Official OGP Image (with Fireworks)",
      description: "Pyrotechnicツール自身で作成する、花火装飾つき公式OGPイメージです。",
      commands: [
        {
          command: "set_canvas",
          width: 1200,
          height: 630,
          name: "Pyrotechnic OGP"
        },
        {
          command: "clear_canvas"
        },
        {
          command: "add_rect",
          x: 0,
          y: 0,
          width: 1200,
          height: 630,
          fill: "#05070f"
        },
        
        // --- SLEEK BACKGROUND GLOWS ---
        {
          command: "add_ellipse",
          cx: 300,
          cy: 300,
          rx: 250,
          ry: 250,
          fill: "#3b0764",
          opacity: 25
        },
        {
          command: "add_ellipse",
          cx: 900,
          cy: 300,
          rx: 300,
          ry: 300,
          fill: "#1e1b4b",
          opacity: 35
        },
        {
          command: "add_ellipse",
          cx: 600,
          cy: 100,
          rx: 150,
          ry: 150,
          fill: "#eab308",
          opacity: 8
        },

        // --- SUBTLE DESIGN GRID ---
        { "command": "add_line", "x1": 100, "y1": 0, "x2": 100, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 200, "y1": 0, "x2": 200, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 300, "y1": 0, "x2": 300, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 400, "y1": 0, "x2": 400, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 500, "y1": 0, "x2": 500, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 600, "y1": 0, "x2": 600, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 700, "y1": 0, "x2": 700, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 800, "y1": 0, "x2": 800, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 900, "y1": 0, "x2": 900, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 1000, "y1": 0, "x2": 1000, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 1100, "y1": 0, "x2": 1100, "y2": 630, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },

        { "command": "add_line", "x1": 0, "y1": 100, "x2": 1200, "y2": 100, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 0, "y1": 200, "x2": 1200, "y2": 200, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 0, "y1": 300, "x2": 1200, "y2": 300, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 0, "y1": 400, "x2": 1200, "y2": 400, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 0, "y1": 500, "x2": 1200, "y2": 500, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },
        { "command": "add_line", "x1": 0, "y1": 600, "x2": 1200, "y2": 600, "stroke": "#ffffff", "strokeWidth": 1, "opacity": 4 },

        // --- GRID INTERSECTION DOTS ---
        { "command": "add_ellipse", "cx": 300, "cy": 200, "rx": 3, "ry": 3, "fill": "#38bdf8", "opacity": 25 },
        { "command": "add_ellipse", "cx": 600, "cy": 200, "rx": 3, "ry": 3, "fill": "#38bdf8", "opacity": 25 },
        { "command": "add_ellipse", "cx": 900, "cy": 200, "rx": 3, "ry": 3, "fill": "#38bdf8", "opacity": 25 },
        { "command": "add_ellipse", "cx": 300, "cy": 400, "rx": 3, "ry": 3, "fill": "#38bdf8", "opacity": 25 },
        { "command": "add_ellipse", "cx": 600, "cy": 400, "rx": 3, "ry": 3, "fill": "#38bdf8", "opacity": 25 },
        { "command": "add_ellipse", "cx": 900, "cy": 400, "rx": 3, "ry": 3, "fill": "#38bdf8", "opacity": 25 },

        // --- FIREWORKS: GOLD (Center: 920, 220) ---
        {
          "command": "add_ellipse",
          "cx": 920,
          "cy": 220,
          "rx": 33,
          "ry": 33,
          "fill": "#fbbf24",
          "opacity": 25
        },
        {
          "command": "add_ellipse",
          "cx": 920,
          "cy": 220,
          "rx": 5,
          "ry": 5,
          "fill": "#ffffff"
        },
        {
          "command": "add_line",
          "x1": 937,
          "y1": 220,
          "x2": 1008,
          "y2": 220,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 1008,
          "cy": 220,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 1008,
          "cy": 220,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 934,
          "y1": 228,
          "x2": 996,
          "y2": 264,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 996,
          "cy": 264,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 996,
          "cy": 264,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 928,
          "y1": 234,
          "x2": 964,
          "y2": 296,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 964,
          "cy": 296,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 964,
          "cy": 296,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 920,
          "y1": 237,
          "x2": 920,
          "y2": 308,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 920,
          "cy": 308,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 920,
          "cy": 308,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 912,
          "y1": 234,
          "x2": 876,
          "y2": 296,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 876,
          "cy": 296,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 876,
          "cy": 296,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 906,
          "y1": 228,
          "x2": 844,
          "y2": 264,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 844,
          "cy": 264,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 844,
          "cy": 264,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 904,
          "y1": 220,
          "x2": 832,
          "y2": 220,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 832,
          "cy": 220,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 832,
          "cy": 220,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 906,
          "y1": 212,
          "x2": 844,
          "y2": 176,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 844,
          "cy": 176,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 844,
          "cy": 176,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 912,
          "y1": 206,
          "x2": 876,
          "y2": 144,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 876,
          "cy": 144,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 876,
          "cy": 144,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 920,
          "y1": 204,
          "x2": 920,
          "y2": 132,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 920,
          "cy": 132,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 920,
          "cy": 132,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 928,
          "y1": 206,
          "x2": 964,
          "y2": 144,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 964,
          "cy": 144,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 964,
          "cy": 144,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 934,
          "y1": 212,
          "x2": 996,
          "y2": 176,
          "stroke": "#fbbf24",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 996,
          "cy": 176,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 996,
          "cy": 176,
          "rx": 7,
          "ry": 7,
          "fill": "#fbbf24",
          "opacity": 30
        },

        // --- FIREWORKS: PURPLE (Center: 1050, 390) ---
        {
          "command": "add_ellipse",
          "cx": 1050,
          "cy": 390,
          "rx": 24,
          "ry": 24,
          "fill": "#a78bfa",
          "opacity": 25
        },
        {
          "command": "add_ellipse",
          "cx": 1050,
          "cy": 390,
          "rx": 5,
          "ry": 5,
          "fill": "#ffffff"
        },
        {
          "command": "add_line",
          "x1": 1062,
          "y1": 390,
          "x2": 1114,
          "y2": 390,
          "stroke": "#a78bfa",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 1114,
          "cy": 390,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 1114,
          "cy": 390,
          "rx": 7,
          "ry": 7,
          "fill": "#a78bfa",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 1060,
          "y1": 397,
          "x2": 1102,
          "y2": 428,
          "stroke": "#a78bfa",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 1102,
          "cy": 428,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 1102,
          "cy": 428,
          "rx": 7,
          "ry": 7,
          "fill": "#a78bfa",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 1054,
          "y1": 401,
          "x2": 1070,
          "y2": 451,
          "stroke": "#a78bfa",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 1070,
          "cy": 451,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 1070,
          "cy": 451,
          "rx": 7,
          "ry": 7,
          "fill": "#a78bfa",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 1046,
          "y1": 401,
          "x2": 1030,
          "y2": 451,
          "stroke": "#a78bfa",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 1030,
          "cy": 451,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 1030,
          "cy": 451,
          "rx": 7,
          "ry": 7,
          "fill": "#a78bfa",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 1040,
          "y1": 397,
          "x2": 998,
          "y2": 428,
          "stroke": "#a78bfa",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 998,
          "cy": 428,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 998,
          "cy": 428,
          "rx": 7,
          "ry": 7,
          "fill": "#a78bfa",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 1038,
          "y1": 390,
          "x2": 986,
          "y2": 390,
          "stroke": "#a78bfa",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 986,
          "cy": 390,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 986,
          "cy": 390,
          "rx": 7,
          "ry": 7,
          "fill": "#a78bfa",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 1040,
          "y1": 383,
          "x2": 998,
          "y2": 352,
          "stroke": "#a78bfa",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 998,
          "cy": 352,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 998,
          "cy": 352,
          "rx": 7,
          "ry": 7,
          "fill": "#a78bfa",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 1046,
          "y1": 379,
          "x2": 1030,
          "y2": 329,
          "stroke": "#a78bfa",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 1030,
          "cy": 329,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 1030,
          "cy": 329,
          "rx": 7,
          "ry": 7,
          "fill": "#a78bfa",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 1054,
          "y1": 379,
          "x2": 1070,
          "y2": 329,
          "stroke": "#a78bfa",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 1070,
          "cy": 329,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 1070,
          "cy": 329,
          "rx": 7,
          "ry": 7,
          "fill": "#a78bfa",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 1060,
          "y1": 383,
          "x2": 1102,
          "y2": 352,
          "stroke": "#a78bfa",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 1102,
          "cy": 352,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 1102,
          "cy": 352,
          "rx": 7,
          "ry": 7,
          "fill": "#a78bfa",
          "opacity": 30
        },

        // --- FIREWORKS: TEAL (Center: 740, 160) ---
        {
          "command": "add_ellipse",
          "cx": 740,
          "cy": 160,
          "rx": 20,
          "ry": 20,
          "fill": "#2dd4bf",
          "opacity": 25
        },
        {
          "command": "add_ellipse",
          "cx": 740,
          "cy": 160,
          "rx": 5,
          "ry": 5,
          "fill": "#ffffff"
        },
        {
          "command": "add_line",
          "x1": 750,
          "y1": 160,
          "x2": 792,
          "y2": 160,
          "stroke": "#2dd4bf",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 792,
          "cy": 160,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 792,
          "cy": 160,
          "rx": 7,
          "ry": 7,
          "fill": "#2dd4bf",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 747,
          "y1": 167,
          "x2": 777,
          "y2": 197,
          "stroke": "#2dd4bf",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 777,
          "cy": 197,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 777,
          "cy": 197,
          "rx": 7,
          "ry": 7,
          "fill": "#2dd4bf",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 740,
          "y1": 170,
          "x2": 740,
          "y2": 212,
          "stroke": "#2dd4bf",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 740,
          "cy": 212,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 740,
          "cy": 212,
          "rx": 7,
          "ry": 7,
          "fill": "#2dd4bf",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 733,
          "y1": 167,
          "x2": 703,
          "y2": 197,
          "stroke": "#2dd4bf",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 703,
          "cy": 197,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 703,
          "cy": 197,
          "rx": 7,
          "ry": 7,
          "fill": "#2dd4bf",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 730,
          "y1": 160,
          "x2": 688,
          "y2": 160,
          "stroke": "#2dd4bf",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 688,
          "cy": 160,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 688,
          "cy": 160,
          "rx": 7,
          "ry": 7,
          "fill": "#2dd4bf",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 733,
          "y1": 153,
          "x2": 703,
          "y2": 123,
          "stroke": "#2dd4bf",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 703,
          "cy": 123,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 703,
          "cy": 123,
          "rx": 7,
          "ry": 7,
          "fill": "#2dd4bf",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 740,
          "y1": 150,
          "x2": 740,
          "y2": 108,
          "stroke": "#2dd4bf",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 740,
          "cy": 108,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 740,
          "cy": 108,
          "rx": 7,
          "ry": 7,
          "fill": "#2dd4bf",
          "opacity": 30
        },
        {
          "command": "add_line",
          "x1": 747,
          "y1": 153,
          "x2": 777,
          "y2": 123,
          "stroke": "#2dd4bf",
          "strokeWidth": 2,
          "opacity": 80
        },
        {
          "command": "add_ellipse",
          "cx": 777,
          "cy": 123,
          "rx": 3,
          "ry": 3,
          "fill": "#ffffff"
        },
        {
          "command": "add_ellipse",
          "cx": 777,
          "cy": 123,
          "rx": 7,
          "ry": 7,
          "fill": "#2dd4bf",
          "opacity": 30
        },

        // --- CONTAINER BORDER & BRANDING ---
        {
          "command": "add_rect",
          "x": 30,
          "y": 30,
          "width": 1140,
          "height": 570,
          "fill": "none",
          "stroke": "#ffffff",
          "strokeWidth": 1,
          "rx": 16,
          "opacity": 12
        },
        {
          "command": "add_text",
          "x": 80,
          "y": 75,
          "width": 500,
          "height": 25,
          "text": "THE BROWSER DESIGN CANVAS",
          "fontSize": 15,
          "fontFamily": "Outfit",
          "fontWeight": "bold",
          "fill": "#fbbf24"
        },
        {
          "command": "add_text",
          "x": 80,
          "y": 105,
          "width": 800,
          "height": 110,
          "text": "Pyrotechnic",
          "fontSize": 96,
          "fontFamily": "Outfit",
          "fontWeight": "bold",
          "fill": "#f8fafc"
        },
        {
          "command": "add_text",
          "x": 85,
          "y": 215,
          "width": 800,
          "height": 35,
          "text": "Spiritual successor to Adobe® Fireworks®",
          "fontSize": 22,
          "fontFamily": "sans-serif",
          "fontWeight": "normal",
          "fill": "#94a3b8"
        },
        {
          "command": "add_line",
          "x1": 80,
          "y1": 270,
          "x2": 500,
          "y2": 270,
          "stroke": "#8b5cf6",
          "strokeWidth": 2,
          "opacity": 60
        },

        // --- CORE FEATURE TEXT LIST ---
        {
          "command": "add_text",
          "x": 80,
          "y": 315,
          "width": 800,
          "height": 35,
          "text": "✓ Design visually, export JSON macros instantly",
          "fontSize": 22,
          "fontFamily": "sans-serif",
          "fontWeight": "normal",
          "fill": "#cbd5e1"
        },
        {
          "command": "add_text",
          "x": 80,
          "y": 365,
          "width": 800,
          "height": 35,
          "text": "✓ Generative AI-friendly JSON macro system",
          "fontSize": 22,
          "fontFamily": "sans-serif",
          "fontWeight": "normal",
          "fill": "#cbd5e1"
        },
        {
          "command": "add_text",
          "x": 80,
          "y": 415,
          "width": 800,
          "height": 35,
          "text": "✓ Vector shapes, arrows, and multi-frame animation",
          "fontSize": 22,
          "fontFamily": "sans-serif",
          "fontWeight": "normal",
          "fill": "#cbd5e1"
        },
        {
          "command": "add_text",
          "x": 80,
          "y": 520,
          "width": 600,
          "height": 35,
          "text": "Created with Pyrotechnic Canvas Engine",
          "fontSize": 16,
          "fontFamily": "Outfit",
          "fontWeight": "normal",
          "fill": "#64748b"
        },
        {
          "command": "add_text",
          "x": 800,
          "y": 518,
          "width": 320,
          "height": 35,
          "text": "Py • Pyrotechnic",
          "fontSize": 20,
          "fontFamily": "Outfit",
          "fontWeight": "bold",
          "fill": "#fbbf24",
          "textAlign": "right"
        },
        {
          "command": "add_slice",
          "x": 0,
          "y": 0,
          "width": 1200,
          "height": 630,
          "name": "pyrotechnic_ogp",
          "format": "png"
        }
      ]
    };
    setMacroText(JSON.stringify(example, null, 2));
    setStatus(null);
  };

  const handleLoadBouncingBall = () => {
    const bouncingBall = {
      schema: "1.0",
      title: "Bouncing Ball",
      description: "Squash & Stretch and motion blur bouncing ball animation",
      commands: [
        { command: "clear_all_states" },
        { command: "set_canvas", width: 800, height: 600 },
        
        // Frame 1: Peak
        { command: "add_rect", x: 0, y: 0, width: 800, height: 600, fill: "#0c0d12" },
        { command: "add_rect", x: 100, y: 500, width: 600, height: 12, fill: "#3c4159", rx: 6 },
        { command: "add_ellipse", cx: 400, cy: 140, rx: 25, ry: 25, fill: "#ffc600" },

        // Frame 2: Start falling
        { command: "add_state", name: "Frame 2", delay: 70 },
        { command: "add_rect", x: 0, y: 0, width: 800, height: 600, fill: "#0c0d12" },
        { command: "add_rect", x: 100, y: 500, width: 600, height: 12, fill: "#3c4159", rx: 6 },
        { command: "add_ellipse", cx: 400, cy: 180, rx: 24, ry: 26, fill: "#ffc600" },

        // Frame 3: Falling faster
        { command: "add_state", name: "Frame 3", delay: 70 },
        { command: "add_rect", x: 0, y: 0, width: 800, height: 600, fill: "#0c0d12" },
        { command: "add_rect", x: 100, y: 500, width: 600, height: 12, fill: "#3c4159", rx: 6 },
        { command: "add_ellipse", cx: 400, cy: 180, rx: 24, ry: 25, fill: "#ffc600", opacity: 30 },
        { command: "add_ellipse", cx: 400, cy: 250, rx: 23, ry: 28, fill: "#ffc600" },

        // Frame 4: High speed fall
        { command: "add_state", name: "Frame 4", delay: 70 },
        { command: "add_rect", x: 0, y: 0, width: 800, height: 600, fill: "#0c0d12" },
        { command: "add_rect", x: 100, y: 500, width: 600, height: 12, fill: "#3c4159", rx: 6 },
        { command: "add_ellipse", cx: 400, cy: 250, rx: 23, ry: 27, fill: "#ffc600", opacity: 20 },
        { command: "add_ellipse", cx: 400, cy: 300, rx: 22, ry: 28, fill: "#ffc600", opacity: 40 },
        { command: "add_ellipse", cx: 400, cy: 350, rx: 22, ry: 30, fill: "#ffc600" },

        // Frame 5: Maximum speed fall
        { command: "add_state", name: "Frame 5", delay: 70 },
        { command: "add_rect", x: 0, y: 0, width: 800, height: 600, fill: "#0c0d12" },
        { command: "add_rect", x: 100, y: 500, width: 600, height: 12, fill: "#3c4159", rx: 6 },
        { command: "add_ellipse", cx: 400, cy: 350, rx: 22, ry: 28, fill: "#ffc600", opacity: 20 },
        { command: "add_ellipse", cx: 400, cy: 410, rx: 21, ry: 29, fill: "#ffd43f", opacity: 50 },
        { command: "add_ellipse", cx: 400, cy: 470, rx: 20, ry: 32, fill: "#ffd43f" },

        // Frame 6: IMPACT!
        { command: "add_state", name: "Frame 6", delay: 70 },
        { command: "add_rect", x: 0, y: 0, width: 800, height: 600, fill: "#0c0d12" },
        { command: "add_rect", x: 100, y: 500, width: 600, height: 12, fill: "#3c4159", rx: 6 },
        { command: "add_ellipse", cx: 400, cy: 490, rx: 34, ry: 14, fill: "#ff9f00" },

        // Frame 7: Rebound launch
        { command: "add_state", name: "Frame 7", delay: 70 },
        { command: "add_rect", x: 0, y: 0, width: 800, height: 600, fill: "#0c0d12" },
        { command: "add_rect", x: 100, y: 500, width: 600, height: 12, fill: "#3c4159", rx: 6 },
        { command: "add_ellipse", cx: 400, cy: 490, rx: 30, ry: 16, fill: "#ff9f00", opacity: 40 },
        { command: "add_ellipse", cx: 400, cy: 440, rx: 22, ry: 30, fill: "#ffc600" },

        // Frame 8: Rising fast
        { command: "add_state", name: "Frame 8", delay: 70 },
        { command: "add_rect", x: 0, y: 0, width: 800, height: 600, fill: "#0c0d12" },
        { command: "add_rect", x: 100, y: 500, width: 600, height: 12, fill: "#3c4159", rx: 6 },
        { command: "add_ellipse", cx: 400, cy: 440, rx: 22, ry: 28, fill: "#ffc600", opacity: 30 },
        { command: "add_ellipse", cx: 400, cy: 340, rx: 23, ry: 28, fill: "#ffc600" },

        // Frame 9: Decelerating
        { command: "add_state", name: "Frame 9", delay: 70 },
        { command: "add_rect", x: 0, y: 0, width: 800, height: 600, fill: "#0c0d12" },
        { command: "add_rect", x: 100, y: 500, width: 600, height: 12, fill: "#3c4159", rx: 6 },
        { command: "add_ellipse", cx: 400, cy: 340, rx: 23, ry: 27, fill: "#ffc600", opacity: 20 },
        { command: "add_ellipse", cx: 400, cy: 240, rx: 24, ry: 26, fill: "#ffc600" },

        // Frame 10: Near peak
        { command: "add_state", name: "Frame 10", delay: 70 },
        { command: "add_rect", x: 0, y: 0, width: 800, height: 600, fill: "#0c0d12" },
        { command: "add_rect", x: 100, y: 500, width: 600, height: 12, fill: "#3c4159", rx: 6 },
        { command: "add_ellipse", cx: 400, cy: 170, rx: 25, ry: 25, fill: "#ffc600" }
      ]
    };
    setMacroText(JSON.stringify(bouncingBall, null, 2));
    setStatus(null);
  };

  // ── Export current canvas as macro ────────────────────
  const handleExportMacro = () => {
    try {
      const macro = documentToMacro(doc);
      const json = JSON.stringify(macro, null, 2);
      setMacroText(json);
      setStatus({ success: true, message: 'キャンバスをマクロに変換しました。テキストエリアを確認してください。' });
    } catch (e) {
      setStatus({ success: false, message: `書き出しエラー: ${(e as Error).message}` });
    }
  };

  const handleDownloadMacro = () => {
    try {
      const macro = documentToMacro(doc);
      const json = JSON.stringify(macro, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      const page = doc.pages.find(p => p.id === doc.currentPageId) || doc.pages[0];
      a.href = url;
      a.download = `${page.name.replace(/\s+/g, '_').toLowerCase() || 'macro'}_macro.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ success: true, message: 'マクロをダウンロードしました。' });
    } catch (e) {
      setStatus({ success: false, message: `ダウンロードエラー: ${(e as Error).message}` });
    }
  };

  return (
    <>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        外部AI（ChatGPT・Claude・Gemini等）が生成したJSONマクロをここに貼り付けて実行します。
      </div>

      {/* ── Macro Export buttons ── */}
      <div style={{
        display: 'flex', gap: 4,
        padding: '8px 10px',
        background: 'rgba(234,179,8,0.06)',
        border: '1px solid rgba(234,179,8,0.2)',
        borderRadius: 6,
      }}>
        <span style={{ fontSize: '10px', color: 'var(--accent-gold)', flex: 1, alignSelf: 'center', fontWeight: 600 }}>
          📤 キャンバス → マクロ
        </span>
        <button
          onClick={handleExportMacro}
          style={{
            background: 'rgba(234,179,8,0.15)',
            border: '1px solid rgba(234,179,8,0.4)',
            color: '#fbbf24',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: '10px',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3,
            fontWeight: 600,
          }}
          title="現在のキャンバスをJSONマクロに変換してテキストエリアに展開"
        >
          <Upload size={11} /> 展開
        </button>
        <button
          onClick={handleDownloadMacro}
          style={{
            background: 'rgba(234,179,8,0.15)',
            border: '1px solid rgba(234,179,8,0.4)',
            color: '#fbbf24',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: '10px',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3,
            fontWeight: 600,
          }}
          title="JSONマクロファイルとしてダウンロード"
        >
          <Download size={11} /> 保存
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px dashed var(--border-light)',
            color: 'var(--text-secondary)',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: '10px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          onClick={handleLoadExample}
        >
          📋 OGP画像テンプレート
        </button>
        <button
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px dashed var(--border-light)',
            color: 'var(--text-secondary)',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: '10px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          onClick={handleLoadBouncingBall}
        >
          🏀 弾むボール (アニメ)
        </button>
      </div>

      <textarea
        value={macroText}
        onChange={(e) => { setMacroText(e.target.value); setStatus(null); }}
        placeholder={'{\n  "schema": "1.0",\n  "commands": [...]\n}'}
        style={{
          width: '100%',
          height: 200,
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid var(--border-light)',
          borderRadius: 4,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          padding: '8px',
          resize: 'vertical',
          outline: 'none',
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
        spellCheck={false}
        onMouseDown={(e) => e.stopPropagation()}
      />

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleRun}
          style={{
            flex: 1,
            background: 'var(--accent-green)',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          ▶ 実行
        </button>
        <button
          onClick={handleFormat}
          className="btn-secondary"
          style={{ fontSize: '11px', padding: '4px 8px' }}
          title="JSONを整形する"
        >
          整形
        </button>
        <button
          onClick={handleClear}
          className="btn-secondary"
          style={{ fontSize: '11px', padding: '4px 8px' }}
          title="クリア"
        >
          クリア
        </button>
      </div>

      {status && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
          padding: '8px 10px',
          borderRadius: 4,
          background: status.info
            ? 'rgba(59,130,246,0.12)'
            : status.success ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
          border: `1px solid ${
            status.info
              ? 'rgba(59,130,246,0.35)'
              : status.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'
          }`,
          fontSize: '11px',
          lineHeight: 1.5,
          color: status.info ? '#93c5fd' : status.success ? '#6ee7b7' : '#fca5a5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {status.info
            ? <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            : status.success
              ? <CheckCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              : <XCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          }
          <span>{status.message}</span>
        </div>
      )}
    </>
  );
};
