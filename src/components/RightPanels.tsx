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
  Link
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
  /** JSON text pre-loaded from URL hash to populate the macro panel */
  initialMacroText?: string;
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
  onRunMacro,
  initialMacroText = ''
}) => {
  // Collapsed states
  const [collapsed, setCollapsed] = useState({
    pages: false,
    states: false,
    layers: false,
    export: false,
    macro: false
  });

  // Auto-expand macro panel when a URL macro is loaded
  const prevInitialMacroText = React.useRef('');
  React.useEffect(() => {
    if (initialMacroText && initialMacroText !== prevInitialMacroText.current) {
      prevInitialMacroText.current = initialMacroText;
      setCollapsed(prev => ({ ...prev, macro: false }));
    }
  }, [initialMacroText]);

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
            <MacroPanel onRunMacro={onRunMacro} initialMacroText={initialMacroText} />
          </div>
        )}
      </div>

    </div>
  );
};

// ─────────────────────────────────────────────────────────
// MacroPanel sub-component
// ─────────────────────────────────────────────────────────

interface MacroPanelProps {
  onRunMacro: (json: string) => { success: boolean; message: string };
  initialMacroText?: string;
}

const MacroPanel: React.FC<MacroPanelProps> = ({ onRunMacro, initialMacroText = '' }) => {
  const [macroText, setMacroText] = useState(initialMacroText);
  const [status, setStatus] = useState<{ success: boolean; message: string; info?: boolean } | null>(null);

  // Sync textarea when initialMacroText changes (e.g. loaded from URL)
  React.useEffect(() => {
    if (initialMacroText) {
      setMacroText(initialMacroText);
      setStatus({ success: true, info: true, message: 'URLからマクロを読み込みました。内容を確認して「▶ 実行」してください。' });
    }
  }, [initialMacroText]);

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
      title: "OGPデフォルト画像",
      description: "1200x630のOGP画像テンプレート",
      commands: [
        { command: "set_canvas", width: 1200, height: 630 },
        { command: "clear_canvas" },
        { command: "add_rect", x: 0, y: 0, width: 1200, height: 630, fill: "#0f172a" },
        { command: "add_ellipse", cx: 1050, cy: 150, rx: 280, ry: 280, fill: "#1e1b4b", opacity: 60 },
        { command: "add_text", x: 80, y: 220, width: 1040, height: 100,
          text: "キャッチコピーをここに入力", fontSize: 64, fontFamily: "Outfit",
          fontWeight: "bold", fill: "#f59e0b", textAlign: "center" },
        { command: "add_text", x: 80, y: 360, width: 1040, height: 60,
          text: "サブタイトルやドメイン名など", fontSize: 32, fontFamily: "Outfit",
          fill: "#94a3b8", textAlign: "center" },
        { command: "add_slice", x: 0, y: 0, width: 1200, height: 630,
          name: "ogp_image", format: "png" }
      ]
    };
    setMacroText(JSON.stringify(example, null, 2));
    setStatus(null);
  };

  const handleShareUrl = () => {
    if (!macroText.trim()) {
      setStatus({ success: false, message: 'マクロが空です。共有するJSONを入力してください。' });
      return;
    }
    try {
      // Validate JSON first
      JSON.parse(macroText);
      const encoded = btoa(encodeURIComponent(macroText));
      const url = `${window.location.origin}${window.location.pathname}#macro=${encoded}`;
      navigator.clipboard.writeText(url).then(() => {
        setStatus({ success: true, info: true, message: `🔗 URLをクリップボードにコピーしました！\n${url.length > 80 ? url.slice(0, 77) + '...' : url}` });
      }).catch(() => {
        // Fallback: display URL for manual copy
        setStatus({ success: true, info: true, message: `🔗 このURLをコピーしてください:\n${url}` });
      });
    } catch (e) {
      setStatus({ success: false, message: `JSON解析エラー: ${(e as Error).message}` });
    }
  };

  return (
    <>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        外部AI（ChatGPT・Claude・Gemini等）が生成したJSONマクロをここに貼り付けて実行します。
      </div>

      <button
        style={{
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
        📋 サンプルを読み込む (OGP画像テンプレート)
      </button>

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

      <button
        onClick={handleShareUrl}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          width: '100%',
          background: 'transparent',
          border: '1px solid var(--border-light)',
          color: 'var(--text-secondary)',
          borderRadius: 4,
          padding: '5px 10px',
          fontSize: '11px',
          cursor: 'pointer',
          justifyContent: 'center',
        }}
        title="マクロをBase64エンコードしてURLに埋め込み、クリップボードにコピーします"
      >
        <Link size={12} /> URLで共有
      </button>

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
            ? <Link size={13} style={{ flexShrink: 0, marginTop: 1 }} />
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
