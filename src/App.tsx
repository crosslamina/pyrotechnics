import { useState, useEffect, useRef } from 'react';
import { 
  Undo2, 
  Redo2, 
  Trash2, 
  RotateCcw,
  Sparkles,
  Save,
  DatabaseZap
} from 'lucide-react';
import type { Document, ToolType, CanvasObject, BitmapObject, Page } from './types';
import { Toolbar } from './components/Toolbar';
import { CanvasArea } from './components/CanvasArea';
import { PropertiesPanel } from './components/PropertiesPanel';
import { RightPanels } from './components/RightPanels';
import { getBoundingBox, drawObject } from './utils/canvasHelper';
import { parseMacro, runMacro } from './utils/macroRunner';
import { saveDocument, loadDocument, clearDocument } from './utils/storage';

import ogpMacro from './utils/pyrotechnics_ogp_macro.json';

// Define initial empty document setup (blank)
const createBlankDocument = (): Document => {
  const pageId = `page-${Date.now()}`;
  const stateId = `state-${Date.now()}`;
  const layerId = `layer-${Date.now()}`;

  const initialPage: Page = {
    id: pageId,
    name: 'Page 1',
    width: 800,
    height: 600,
    states: [
      {
        id: stateId,
        name: 'State 1',
        delay: 150,
        layers: [
          {
            id: layerId,
            name: 'Layer 1',
            visible: true,
            locked: false,
            objects: []
          }
        ]
      }
    ]
  };

  return {
    name: 'Untitled Fireworks Project',
    pages: [initialPage],
    currentPageId: pageId,
    currentStateId: stateId
  };
};

// Define initial document with preloaded template
const createInitialDocument = (): Document => {
  const baseDoc = createBlankDocument();
  try {
    return runMacro(ogpMacro as any, baseDoc);
  } catch (e) {
    console.error('Failed to run initial OGP macro:', e);
    return baseDoc;
  }
};

export default function App() {
  const [doc, setDoc] = useState<Document>(createInitialDocument());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const saveTimerRef = useRef<number | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>('pointer');
  
  const [showGuide, setShowGuide] = useState<boolean>(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('pyrotechnics_guide_dismissed');
    if (!dismissed) {
      setShowGuide(true);
    }
  }, []);

  const activePage = doc.pages.find(p => p.id === doc.currentPageId) || doc.pages[0];
  const activeState = activePage?.states.find(s => s.id === doc.currentStateId) || activePage?.states[0];
  
  // Workspace properties
  const [fillColor, setFillColor] = useState<string>('#3b82f6');
  const [strokeColor, setStrokeColor] = useState<string>('#1e293b');
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

  // Sync activeLayerId with current page/state layers
  useEffect(() => {
    if (activeState) {
      const exists = activeState.layers.some(l => l.id === activeLayerId);
      if (!exists && activeState.layers.length > 0) {
        setActiveLayerId(activeState.layers[0].id);
      }
    }
  }, [doc.currentPageId, doc.currentStateId, doc, activeLayerId, activeState]);
  
  // Brush/Eraser setups
  const [brushSettings, setBrushSettings] = useState({ size: 10, hardness: 80, opacity: 100, color: '#f59e0b' });
  const [eraserSettings, setEraserSettings] = useState({ size: 15, opacity: 100 });

  // Undo/Redo History Stack
  const [history, setHistory] = useState<Document[]>([doc]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Animation player variables
  const [isPlayingAnimation, setIsPlayingAnimation] = useState<boolean>(false);
  const [previewStateId, setPreviewStateId] = useState<string | undefined>(undefined);
  const animationTimerRef = useRef<number | null>(null);

  const [zoom, setZoom] = useState<number>(1);
  const [showSlicesOverlay, setShowSlicesOverlay] = useState<boolean>(true);
  const [lockSlicesOverlay, setLockSlicesOverlay] = useState<boolean>(false);

  // Helper to push history
  const pushHistory = (updatedDoc: Document) => {
    const newHistory = history.slice(0, historyIndex + 1);
    // Limit history stack size to 50
    if (newHistory.length > 50) newHistory.shift();
    
    setHistory([...newHistory, updatedDoc]);
    setHistoryIndex(newHistory.length);
  };

  // Perform document changes & push undo state
  const mutateDocument = (updater: (draft: Document) => void) => {
    const updated = JSON.parse(JSON.stringify(doc)) as Document;
    updater(updated);
    setDoc(updated);
    pushHistory(updated);
  };

  // Flatten nested objects list to search/edit
  const getActiveObjects = (documentState: Document): CanvasObject[] => {
    const page = documentState.pages.find(p => p.id === documentState.currentPageId);
    const state = page?.states.find(s => s.id === documentState.currentStateId);
    if (!state) return [];
    
    const objs: CanvasObject[] = [];
    for (let i = state.layers.length - 1; i >= 0; i--) {
      if (state.layers[i].visible && !state.layers[i].locked) {
        objs.push(...state.layers[i].objects);
      }
    }
    return objs;
  };

  // Undo / Redo triggers
  const handleUndo = () => {
    if (historyIndex > 0) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      setDoc(JSON.parse(JSON.stringify(history[idx])));
      setSelectedObjectIds([]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      setDoc(JSON.parse(JSON.stringify(history[idx])));
      setSelectedObjectIds([]);
    }
  };

  // Reset Document
  const handleReset = () => {
    if (window.confirm('Are you sure you want to clear the entire project canvas?')) {
      const freshDoc = createBlankDocument();
      setDoc(freshDoc);
      setHistory([freshDoc]);
      setHistoryIndex(0);
      setSelectedObjectIds([]);
    }
  };

  // Clear saved data from IndexedDB and reset
  const handleClearSaved = async () => {
    if (window.confirm('Clear saved data from IndexedDB and start fresh?')) {
      await clearDocument();
      const freshDoc = createBlankDocument();
      setDoc(freshDoc);
      setHistory([freshDoc]);
      setHistoryIndex(0);
      setSelectedObjectIds([]);
      setSaveStatus('unsaved');
    }
  };

  // Load document from IndexedDB on mount
  useEffect(() => {
    loadDocument().then((saved) => {
      if (saved) {
        setDoc(saved);
        setHistory([saved]);
        setHistoryIndex(0);
      }
    }).catch((err) => {
      console.warn('IndexedDB load failed:', err);
    }).finally(() => {
      setIsLoading(false);
    });
  }, []);

  // Auto-save to IndexedDB whenever doc changes (debounced 1s)
  useEffect(() => {
    if (isLoading) return;
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveDocument(doc);
        setSaveStatus('saved');
      } catch (err) {
        console.warn('IndexedDB save failed:', err);
        setSaveStatus('unsaved');
      }
    }, 1000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [doc, isLoading]);

  // Nudge selection objects with arrow keys
  const nudgeSelectedObjects = (dx: number, dy: number) => {
    if (selectedObjectIds.length === 0) return;
    
    const updated = JSON.parse(JSON.stringify(doc)) as Document;
    const page = updated.pages.find(p => p.id === updated.currentPageId)!;
    const state = page.states.find(s => s.id === updated.currentStateId)!;
    
    state.layers.forEach(l => {
      l.objects.forEach(obj => {
        if (selectedObjectIds.includes(obj.id)) {
          if ('x' in obj) {
            obj.x += dx;
            obj.y += dy;
          } else if ('cx' in obj && obj.type === 'ellipse') {
            obj.cx += dx;
            obj.cy += dy;
          } else if (obj.type === 'line') {
            obj.x1 += dx;
            obj.x2 += dx;
            obj.y1 += dy;
            obj.y2 += dy;
          }
        }
      });
    });

    setDoc(updated);
    pushHistory(updated);
  };

  // Delete active selection
  const handleDeleteSelection = () => {
    if (selectedObjectIds.length === 0) return;

    const updated = JSON.parse(JSON.stringify(doc)) as Document;
    const page = updated.pages.find(p => p.id === updated.currentPageId)!;
    const state = page.states.find(s => s.id === updated.currentStateId)!;

    state.layers.forEach(l => {
      l.objects = l.objects.filter(obj => !selectedObjectIds.includes(obj.id));
    });

    setDoc(updated);
    pushHistory(updated);
    setSelectedObjectIds([]);
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Ignore key shortcuts if user is typing in inputs or textarea
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA' || 
        document.activeElement?.tagName === 'SELECT'
      ) return;

      const key = e.key.toLowerCase();

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        handleRedo();
      }

      // Delete Object
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelection();
      }

      // Nudging objects
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const nudgeAmount = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -nudgeAmount : e.key === 'ArrowRight' ? nudgeAmount : 0;
        const dy = e.key === 'ArrowUp' ? -nudgeAmount : e.key === 'ArrowDown' ? nudgeAmount : 0;
        nudgeSelectedObjects(dx, dy);
      }

      // Tool switching short keys
      if (key === 'v') setActiveTool('pointer');
      if (key === 'a') setActiveTool('subpointer');
      if (key === 'y') setActiveTool('slice');
      if (key === 'p') setActiveTool('pen');
      if (key === 't') setActiveTool('text');
      if (key === 'l') setActiveTool('line');
      if (key === 'w') setActiveTool('arrow');
      if (key === 'u') setActiveTool('rect');
      if (key === 'o') setActiveTool('ellipse');
      if (key === 'b') setActiveTool('brush');
      if (key === 'e') setActiveTool('eraser');
      if (key === 'g') setActiveTool('bucket');
    };

    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [doc, selectedObjectIds, historyIndex, history]);

  // Handle image import logic
  const handleImportImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const imgWidth = img.width;
        const imgHeight = img.height;

        // Position image center of screen/canvas
        const posX = Math.max(0, (activePage.width - imgWidth) / 2);
        const posY = Math.max(0, (activePage.height - imgHeight) / 2);

        const newBitmapId = `bitmap-${Date.now()}`;
        const newBitmap: BitmapObject = {
          type: 'bitmap',
          id: newBitmapId,
          x: posX,
          y: posY,
          width: imgWidth,
          height: imgHeight,
          opacity: 100,
          dataUrl: event.target?.result as string, // base64 URL
          filters: { blur: 0, brightness: 100, contrast: 100, grayscale: 0, sepia: 0 },
          blendMode: 'source-over'
        };

        const updated = JSON.parse(JSON.stringify(doc)) as Document;
        const page = updated.pages.find(p => p.id === updated.currentPageId)!;
        const state = page.states.find(s => s.id === updated.currentStateId)!;
        
        let layer = state.layers.find(l => l.id === activeLayerId) || state.layers[0];
        if (!layer) {
          layer = {
            id: `layer-${Date.now()}`,
            name: 'Layer 1',
            visible: true,
            locked: false,
            objects: []
          };
          state.layers.push(layer);
        }
        
        layer.objects.push(newBitmap);
        setDoc(updated);
        pushHistory(updated);
        setSelectedObjectIds([newBitmapId]);
        setActiveTool('pointer');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Flatten active layer vectors & images to a single raster bitmap
  const handleFlattenLayer = (layerId: string) => {
    if (!activeState) return;
    const layer = activeState.layers.find(l => l.id === layerId);
    if (!layer || layer.objects.length === 0) return;

    if (!window.confirm('Flattening this layer will merge all shapes and text into a raster image, and they will no longer be editable as vectors. Continue?')) {
      return;
    }

    // 1. Create a canvas covering page bounds
    const page = activePage;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = page.width;
    offCanvas.height = page.height;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;

    // Draw objects of this layer sequentially
    layer.objects.forEach(obj => {
      if (obj.type === 'slice') return;
      drawObject(offCtx, obj);
    });

    // 2. Create the unified bitmap object
    const newBitmapId = `bitmap-flat-${Date.now()}`;
    const flattenedBitmap: BitmapObject = {
      type: 'bitmap',
      id: newBitmapId,
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
      opacity: 100,
      dataUrl: offCanvas.toDataURL(),
      filters: { blur: 0, brightness: 100, contrast: 100, grayscale: 0, sepia: 0 },
      blendMode: 'source-over'
    };

    // 3. Mutate document state
    mutateDocument(draft => {
      const dPage = draft.pages.find(p => p.id === draft.currentPageId)!;
      const dState = dPage.states.find(s => s.id === draft.currentStateId)!;
      const dLayer = dState.layers.find(l => l.id === layerId)!;

      // Keep slices, replace others with flattened image
      const webOverlays = dLayer.objects.filter(o => o.type === 'slice');
      dLayer.objects = [flattenedBitmap, ...webOverlays];
    });

    setSelectedObjectIds([newBitmapId]);
  };

  const escapeXml = (unsafe: string): string => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  };

  // Slice individual image exports
  const handleExportSlice = (sliceId: string) => {
    if (!activeState) return;

    // Get slice properties
    let targetSlice: any = null;
    activeState.layers.forEach(l => {
      const s = l.objects.find(obj => obj.id === sliceId);
      if (s && s.type === 'slice') targetSlice = s;
    });

    if (!targetSlice) return;

    // If format is SVG, perform vector XML generation
    if (targetSlice.format === 'svg') {
      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${targetSlice.width}" height="${targetSlice.height}" viewBox="0 0 ${targetSlice.width} ${targetSlice.height}">\n`;

      const dx = -targetSlice.x;
      const dy = -targetSlice.y;

      activeState.layers.forEach(l => {
        if (!l.visible) return;
        l.objects.forEach(obj => {
          if (obj.type === 'slice') return;

          // Simple bounding box intersection check to only include overlapping elements
          const box = getBoundingBox(obj);
          const intersects = !(
            box.x + box.w < targetSlice.x ||
            box.x > targetSlice.x + targetSlice.width ||
            box.y + box.h < targetSlice.y ||
            box.y > targetSlice.y + targetSlice.height
          );
          if (!intersects) return;

          const opacity = obj.opacity !== undefined ? obj.opacity / 100 : 1;
          const opacityAttr = opacity < 1 ? ` opacity="${opacity}"` : '';

          if (obj.type === 'rect') {
            const rxAttr = obj.rx > 0 ? ` rx="${obj.rx}" ry="${obj.rx}"` : '';
            const fillAttr = obj.fill === 'none' ? 'none' : obj.fill;
            const strokeAttr = obj.strokeWidth > 0 ? ` stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"` : '';
            svgContent += `  <rect x="${obj.x + dx}" y="${obj.y + dy}" width="${obj.width}" height="${obj.height}" fill="${fillAttr}"${rxAttr}${strokeAttr}${opacityAttr} />\n`;
          } else if (obj.type === 'ellipse') {
            const fillAttr = obj.fill === 'none' ? 'none' : obj.fill;
            const strokeAttr = obj.strokeWidth > 0 ? ` stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"` : '';
            svgContent += `  <ellipse cx="${obj.cx + dx}" cy="${obj.cy + dy}" rx="${obj.rx}" ry="${obj.ry}" fill="${fillAttr}"${strokeAttr}${opacityAttr} />\n`;
          } else if (obj.type === 'line') {
            const ldx = obj.x2 - obj.x1;
            const ldy = obj.y2 - obj.y1;
            const L = Math.sqrt(ldx * ldx + ldy * ldy);
            let x1Line = obj.x1;
            let y1Line = obj.y1;
            let x2Line = obj.x2;
            let y2Line = obj.y2;

            const arrowWidthAngle = Math.PI / 6;
            const arrowLength = Math.max(10, obj.strokeWidth * 4);
            const arrowHeight = arrowLength * Math.cos(arrowWidthAngle);

            if (L > 0) {
              const ux = ldx / L;
              const uy = ldy / L;
              let startShorten = obj.arrowStart ? arrowHeight : 0;
              let endShorten = obj.arrowEnd ? arrowHeight : 0;

              if (startShorten + endShorten > L) {
                const ratio = L / (startShorten + endShorten);
                startShorten *= ratio;
                endShorten *= ratio;
              }

              x1Line = obj.x1 + ux * startShorten;
              y1Line = obj.y1 + uy * startShorten;
              x2Line = obj.x2 - ux * endShorten;
              y2Line = obj.y2 - uy * endShorten;
            }

            svgContent += `  <line x1="${x1Line + dx}" y1="${y1Line + dy}" x2="${x2Line + dx}" y2="${y2Line + dy}" stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}" stroke-linecap="round"${opacityAttr} />\n`;

            if (obj.arrowStart && L > 0) {
              const angle = Math.atan2(obj.y1 - obj.y2, obj.x1 - obj.x2);
              const xLeft = (obj.x1 + dx) - arrowLength * Math.cos(angle - arrowWidthAngle);
              const yLeft = (obj.y1 + dy) - arrowLength * Math.sin(angle - arrowWidthAngle);
              const xRight = (obj.x1 + dx) - arrowLength * Math.cos(angle + arrowWidthAngle);
              const yRight = (obj.y1 + dy) - arrowLength * Math.sin(angle + arrowWidthAngle);
              svgContent += `  <polygon points="${obj.x1 + dx},${obj.y1 + dy} ${xLeft},${yLeft} ${xRight},${yRight}" fill="${obj.stroke}"${opacityAttr} />\n`;
            }
            if (obj.arrowEnd && L > 0) {
              const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
              const xLeft = (obj.x2 + dx) - arrowLength * Math.cos(angle - arrowWidthAngle);
              const yLeft = (obj.y2 + dy) - arrowLength * Math.sin(angle - arrowWidthAngle);
              const xRight = (obj.x2 + dx) - arrowLength * Math.cos(angle + arrowWidthAngle);
              const yRight = (obj.y2 + dy) - arrowLength * Math.sin(angle + arrowWidthAngle);
              svgContent += `  <polygon points="${obj.x2 + dx},${obj.y2 + dy} ${xLeft},${yLeft} ${xRight},${yRight}" fill="${obj.stroke}"${opacityAttr} />\n`;
            }
          } else if (obj.type === 'path') {
            if (obj.points.length >= 2) {
              let d = `M ${obj.points[0].x + dx} ${obj.points[0].y + dy}`;
              for (let idx = 1; idx < obj.points.length; idx++) {
                const pt = obj.points[idx];
                if (pt.cp1x !== undefined && pt.cp1y !== undefined && pt.cp2x !== undefined && pt.cp2y !== undefined) {
                  d += ` C ${pt.cp1x + dx} ${pt.cp1y + dy}, ${pt.cp2x + dx} ${pt.cp2y + dy}, ${pt.x + dx} ${pt.y + dy}`;
                } else {
                  d += ` L ${pt.x + dx} ${pt.y + dy}`;
                }
              }
              if (obj.closed) d += ' Z';
              const fillAttr = obj.fill === 'none' ? 'none' : obj.fill;
              const strokeAttr = obj.strokeWidth > 0 ? ` stroke="${obj.stroke}" stroke-width="${obj.strokeWidth}"` : '';
              svgContent += `  <path d="${d}" fill="${fillAttr}"${strokeAttr} stroke-linejoin="round" stroke-linecap="round"${opacityAttr} />\n`;
            }
          } else if (obj.type === 'text') {
            const fillAttr = obj.fill;
            const fontStyleAttr = obj.fontStyle !== 'normal' ? ` font-style="${obj.fontStyle}"` : '';
            const fontWeightAttr = obj.fontWeight !== 'normal' ? ` font-weight="${obj.fontWeight}"` : '';
            const textAnchorAttr = obj.textAlign === 'center' ? ' text-anchor="middle"' : obj.textAlign === 'right' ? ' text-anchor="end"' : '';
            const startX = obj.textAlign === 'left' ? obj.x : obj.textAlign === 'center' ? obj.x + obj.width / 2 : obj.x + obj.width;

            const lines = obj.text.split('\n');
            lines.forEach((line, lineIdx) => {
              const yPos = obj.y + lineIdx * (obj.fontSize * 1.2) + obj.fontSize;
              svgContent += `  <text x="${startX + dx}" y="${yPos + dy}" fill="${fillAttr}" font-family="${obj.fontFamily}" font-size="${obj.fontSize}"${fontStyleAttr}${fontWeightAttr}${textAnchorAttr}${opacityAttr}>${escapeXml(line)}</text>\n`;
            });
          } else if (obj.type === 'bitmap') {
            svgContent += `  <image href="${obj.dataUrl}" x="${obj.x + dx}" y="${obj.y + dy}" width="${obj.width}" height="${obj.height}"${opacityAttr} />\n`;
          }
        });
      });

      svgContent += `</svg>`;

      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${targetSlice.name || 'slice'}.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    // 1. Create a canvas covering the slice size
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = targetSlice.width;
    sliceCanvas.height = targetSlice.height;
    const sCtx = sliceCanvas.getContext('2d');
    if (!sCtx) return;

    // Render page contents clipped to slice area
    sCtx.save();
    sCtx.translate(-targetSlice.x, -targetSlice.y);

    // Draw all non-slice elements
    activeState.layers.forEach(l => {
      if (!l.visible) return;
      l.objects.forEach(obj => {
        if (obj.type === 'slice') return;
        drawObject(sCtx, obj);
      });
    });

    sCtx.restore();

    // Trigger browser download
    const format = targetSlice.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = targetSlice.quality ? targetSlice.quality / 100 : 0.9;
    const dataUrl = sliceCanvas.toDataURL(format, quality);

    const link = document.createElement('a');
    link.download = `${targetSlice.name || 'slice'}.${targetSlice.format}`;
    link.href = dataUrl;
    link.click();
  };

  // Export all slices sequentially
  const handleExportAllSlices = () => {
    const slices: string[] = [];
    activeState?.layers.forEach(l => {
      l.objects.forEach(o => {
        if (o.type === 'slice') slices.push(o.id);
      });
    });

    if (slices.length === 0) {
      alert('No slices found in current state.');
      return;
    }

    slices.forEach((id, index) => {
      setTimeout(() => {
        handleExportSlice(id);
      }, index * 300); // Stagger downloads to prevent browser blockages
    });
  };



  // Create slice object exactly matching selected object bounds
  const handleCreateSliceFromSelection = () => {
    if (selectedObjectIds.length === 0 || !activeState) return;

    const selectedObjs = getActiveObjects(doc).filter(o => selectedObjectIds.includes(o.id));
    if (selectedObjs.length === 0) return;

    // Find bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedObjs.forEach(obj => {
      const box = getBoundingBox(obj);
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    });

    const x = Math.round(minX);
    const y = Math.round(minY);
    const w = Math.round(maxX - minX);
    const h = Math.round(maxY - minY);

    // Get slices count
    let sliceCount = 0;
    activeState.layers.forEach(l => {
      l.objects.forEach(obj => {
        if (obj.type === 'slice') sliceCount++;
      });
    });

    const newSliceId = `slice-${Date.now()}`;
    const newSlice: CanvasObject = {
      type: 'slice',
      id: newSliceId,
      x,
      y,
      width: w,
      height: h,
      name: `slice_${sliceCount + 1}`,
      format: 'png',
      quality: 90
    };

    mutateDocument(draft => {
      const page = draft.pages.find(p => p.id === draft.currentPageId)!;
      const state = page.states.find(s => s.id === draft.currentStateId)!;
      let layer = state.layers[0];
      if (!layer) {
        layer = {
          id: `layer-${Date.now()}`,
          name: 'Layer 1',
          visible: true,
          locked: false,
          objects: []
        };
        state.layers.push(layer);
      }
      layer.objects.push(newSlice);
    });

    setSelectedObjectIds([newSliceId]);
  };

  // Execute a JSON macro string against the current document
  const handleRunMacro = (jsonString: string): { success: boolean; message: string } => {
    try {
      const macro = parseMacro(jsonString);
      const newDoc = runMacro(macro, doc);
      setDoc(newDoc);
      pushHistory(newDoc);
      return {
        success: true,
        message: `✓ Macro executed: ${macro.commands.length} command${macro.commands.length !== 1 ? 's' : ''} completed${ macro.title ? ` (${macro.title})` : '' }`
      };
    } catch (e) {
      return {
        success: false,
        message: `✗ Error: ${(e as Error).message}`
      };
    }
  };

  // On mount: check URL hash for #macro=BASE64_JSON and auto-execute
  // Manage Animation playback frame loop

  useEffect(() => {
    if (isPlayingAnimation && activePage && activePage.states.length > 1) {
      let stateIndex = activePage.states.findIndex(s => s.id === doc.currentStateId);
      if (stateIndex === -1) stateIndex = 0;

      const playNextFrame = () => {
        stateIndex = (stateIndex + 1) % activePage.states.length;
        const nextState = activePage.states[stateIndex];
        setPreviewStateId(nextState.id);
        
        // Schedule next frame based on delay
        animationTimerRef.current = window.setTimeout(playNextFrame, nextState.delay || 150);
      };

      // Start loop
      animationTimerRef.current = window.setTimeout(playNextFrame, activePage.states[stateIndex].delay || 150);
    } else {
      // Pause
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
      setPreviewStateId(undefined);
    }

    return () => {
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, [isPlayingAnimation, doc.currentStateId, doc.currentPageId]);

  // Update object property values
  const updateSelectedObjectProps = (props: Partial<CanvasObject>) => {
    if (selectedObjectIds.length === 0) return;

    const updated = JSON.parse(JSON.stringify(doc)) as Document;
    const page = updated.pages.find(p => p.id === updated.currentPageId)!;
    const state = page.states.find(s => s.id === updated.currentStateId)!;

    state.layers.forEach(l => {
      l.objects = l.objects.map(obj => {
        if (selectedObjectIds.includes(obj.id)) {
          return { ...obj, ...props } as CanvasObject;
        }
        return obj;
      });
    });

    setDoc(updated);
    pushHistory(updated);
  };

  const shiftObject = (obj: any, dx: number, dy: number) => {
    if ('x' in obj) {
      obj.x += dx;
      obj.y += dy;
    } else if ('cx' in obj && obj.type === 'ellipse') {
      obj.cx += dx;
      obj.cy += dy;
    } else if (obj.type === 'line') {
      obj.x1 += dx;
      obj.x2 += dx;
      obj.y1 += dy;
      obj.y2 += dy;
    } else if (obj.type === 'path') {
      obj.points.forEach((pt: any) => {
        pt.x += dx;
        pt.y += dy;
        if (pt.cp1x !== undefined) {
          pt.cp1x += dx;
          pt.cp1y += dy;
        }
        if (pt.cp2x !== undefined) {
          pt.cp2x += dx;
          pt.cp2y += dy;
        }
      });
    }
  };

  const handleUpdateMultipleObjects = (props: Partial<CanvasObject>) => {
    if (selectedObjectIds.length === 0) return;

    const updated = JSON.parse(JSON.stringify(doc)) as Document;
    const page = updated.pages.find(p => p.id === updated.currentPageId)!;
    const state = page.states.find(s => s.id === updated.currentStateId)!;

    // Get all selected objects
    const allActiveObjs = getActiveObjects(updated);
    const selectedObjs = allActiveObjs.filter(o => selectedObjectIds.includes(o.id));
    if (selectedObjs.length === 0) return;

    // Calculate group bounding box
    let groupMinX = Infinity, groupMinY = Infinity;
    let groupMaxX = -Infinity, groupMaxY = -Infinity;
    selectedObjs.forEach(o => {
      const box = getBoundingBox(o);
      groupMinX = Math.min(groupMinX, box.x);
      groupMinY = Math.min(groupMinY, box.y);
      groupMaxX = Math.max(groupMaxX, box.x + box.w);
      groupMaxY = Math.max(groupMaxY, box.y + box.h);
    });

    let shiftX = 0;
    let shiftY = 0;
    if ('x' in props && props.x !== undefined) {
      shiftX = Math.round(props.x - groupMinX);
    }
    if ('y' in props && props.y !== undefined) {
      shiftY = Math.round(props.y - groupMinY);
    }

    state.layers.forEach(l => {
      l.objects = l.objects.map(obj => {
        if (selectedObjectIds.includes(obj.id)) {
          const newObj = { ...obj } as any;

          // 1. Shift position if X/Y changed (relative shift)
          if (shiftX !== 0 || shiftY !== 0) {
            shiftObject(newObj, shiftX, shiftY);
          }

          // 2. Update width if changed (absolute scale/set)
          if ('width' in props && props.width !== undefined) {
            const w = props.width;
            if (obj.type === 'ellipse') {
              newObj.rx = w / 2;
            } else if (obj.type === 'line') {
              const currentW = Math.abs(obj.x2 - obj.x1);
              if (currentW > 0) {
                const scaleW = w / currentW;
                if (obj.x2 >= obj.x1) {
                  newObj.x2 = obj.x1 + (obj.x2 - obj.x1) * scaleW;
                } else {
                  newObj.x1 = obj.x2 + (obj.x1 - obj.x2) * scaleW;
                }
              } else {
                newObj.x2 = obj.x1 + w;
              }
            } else if (obj.type === 'path') {
              const box = getBoundingBox(obj);
              if (box.w > 0) {
                const scaleW = w / box.w;
                newObj.points.forEach((pt: any) => {
                  pt.x = box.x + (pt.x - box.x) * scaleW;
                  if (pt.cp1x !== undefined) pt.cp1x = box.x + (pt.cp1x - box.x) * scaleW;
                  if (pt.cp2x !== undefined) pt.cp2x = box.x + (pt.cp2x - box.x) * scaleW;
                });
              }
            } else {
              newObj.width = w;
            }
          }

          // 3. Update height if changed (absolute scale/set)
          if ('height' in props && props.height !== undefined) {
            const h = props.height;
            if (obj.type === 'ellipse') {
              newObj.ry = h / 2;
            } else if (obj.type === 'line') {
              const currentH = Math.abs(obj.y2 - obj.y1);
              if (currentH > 0) {
                const scaleH = h / currentH;
                if (obj.y2 >= obj.y1) {
                  newObj.y2 = obj.y1 + (obj.y2 - obj.y1) * scaleH;
                } else {
                  newObj.y1 = obj.y2 + (obj.y1 - obj.y2) * scaleH;
                }
              } else {
                newObj.y2 = obj.y1 + h;
              }
            } else if (obj.type === 'path') {
              const box = getBoundingBox(obj);
              if (box.h > 0) {
                const scaleH = h / box.h;
                newObj.points.forEach((pt: any) => {
                  pt.y = box.y + (pt.y - box.y) * scaleH;
                  if (pt.cp1y !== undefined) pt.cp1y = box.y + (pt.cp1y - box.y) * scaleH;
                  if (pt.cp2y !== undefined) pt.cp2y = box.y + (pt.cp2y - box.y) * scaleH;
                });
              }
            } else {
              newObj.height = h;
            }
          }

          // 4. Update other properties (opacity, color, etc.)
          Object.keys(props).forEach(k => {
            if (k !== 'width' && k !== 'height' && k !== 'x' && k !== 'y') {
              newObj[k] = (props as any)[k];
            }
          });

          return newObj as CanvasObject;
        }
        return obj;
      });
    });

    setDoc(updated);
    pushHistory(updated);
  };

  const handleAlign = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedObjectIds.length === 0) return;

    const updated = JSON.parse(JSON.stringify(doc)) as Document;
    const page = updated.pages.find(p => p.id === updated.currentPageId)!;
    const state = page.states.find(s => s.id === updated.currentStateId)!;
    
    const allActiveObjs = getActiveObjects(updated);
    const selectedObjs = allActiveObjs.filter(o => selectedObjectIds.includes(o.id));
    if (selectedObjs.length === 0) return;

    const boxes = selectedObjs.map(obj => ({ obj, box: getBoundingBox(obj) }));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    boxes.forEach(({ box }) => {
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w);
      maxY = Math.max(maxY, box.y + box.h);
    });

    const alignToPage = selectedObjectIds.length === 1;

    let targetVal = 0;
    if (alignment === 'left') {
      targetVal = alignToPage ? 0 : minX;
    } else if (alignment === 'center') {
      targetVal = alignToPage ? page.width / 2 : (minX + maxX) / 2;
    } else if (alignment === 'right') {
      targetVal = alignToPage ? page.width : maxX;
    } else if (alignment === 'top') {
      targetVal = alignToPage ? 0 : minY;
    } else if (alignment === 'middle') {
      targetVal = alignToPage ? page.height / 2 : (minY + maxY) / 2;
    } else if (alignment === 'bottom') {
      targetVal = alignToPage ? page.height : maxY;
    }

    state.layers.forEach(l => {
      l.objects = l.objects.map(obj => {
        if (selectedObjectIds.includes(obj.id)) {
          const newObj = { ...obj } as any;
          const box = getBoundingBox(obj);
          
          if (alignment === 'left') {
            const dx = targetVal - box.x;
            shiftObject(newObj, dx, 0);
          } else if (alignment === 'center') {
            const dx = targetVal - (box.x + box.w / 2);
            shiftObject(newObj, dx, 0);
          } else if (alignment === 'right') {
            const dx = targetVal - (box.x + box.w);
            shiftObject(newObj, dx, 0);
          } else if (alignment === 'top') {
            const dy = targetVal - box.y;
            shiftObject(newObj, 0, dy);
          } else if (alignment === 'middle') {
            const dy = targetVal - (box.y + box.h / 2);
            shiftObject(newObj, 0, dy);
          } else if (alignment === 'bottom') {
            const dy = targetVal - (box.y + box.h);
            shiftObject(newObj, 0, dy);
          }
          return newObj;
        }
        return obj;
      });
    });

    setDoc(updated);
    pushHistory(updated);
  };

  const handleDistribute = (direction: 'horizontal' | 'vertical') => {
    if (selectedObjectIds.length < 3) return;

    const updated = JSON.parse(JSON.stringify(doc)) as Document;
    const page = updated.pages.find(p => p.id === updated.currentPageId)!;
    const state = page.states.find(s => s.id === updated.currentStateId)!;

    const allActiveObjs = getActiveObjects(updated);
    const selectedObjs = allActiveObjs.filter(o => selectedObjectIds.includes(o.id));
    if (selectedObjs.length < 3) return;

    const boxes = selectedObjs.map(obj => ({ obj, box: getBoundingBox(obj) }));

    if (direction === 'horizontal') {
      boxes.sort((a, b) => a.box.x - b.box.x);
    } else {
      boxes.sort((a, b) => a.box.y - b.box.y);
    }

    const first = boxes[0];
    const last = boxes[boxes.length - 1];

    if (direction === 'horizontal') {
      const minX = first.box.x;
      const maxX = last.box.x + last.box.w;
      const totalAvailableWidth = maxX - minX;

      const spanWidth = totalAvailableWidth - first.box.w - last.box.w;
      const middleWidths = boxes.slice(1, -1).reduce((sum, item) => sum + item.box.w, 0);
      const spacing = (spanWidth - middleWidths) / (boxes.length - 1);

      let currentX = minX + first.box.w + spacing;
      for (let i = 1; i < boxes.length - 1; i++) {
        const item = boxes[i];
        const dx = currentX - item.box.x;
        state.layers.forEach(l => {
          l.objects.forEach(obj => {
            if (obj.id === item.obj.id) {
              shiftObject(obj, dx, 0);
            }
          });
        });
        currentX += item.box.w + spacing;
      }
    } else {
      const minY = first.box.y;
      const maxY = last.box.y + last.box.h;
      const totalAvailableHeight = maxY - minY;

      const spanHeight = totalAvailableHeight - first.box.h - last.box.h;
      const middleHeights = boxes.slice(1, -1).reduce((sum, item) => sum + item.box.h, 0);
      const spacing = (spanHeight - middleHeights) / (boxes.length - 1);

      let currentY = minY + first.box.h + spacing;
      for (let i = 1; i < boxes.length - 1; i++) {
        const item = boxes[i];
        const dy = currentY - item.box.y;
        state.layers.forEach(l => {
          l.objects.forEach(obj => {
            if (obj.id === item.obj.id) {
              shiftObject(obj, 0, dy);
            }
          });
        });
        currentY += item.box.h + spacing;
      }
    }

    setDoc(updated);
    pushHistory(updated);
  };

  const handleMatchSize = (dimension: 'width' | 'height') => {
    if (selectedObjectIds.length <= 1) return;

    const allActiveObjs = getActiveObjects(doc);
    const primary = allActiveObjs.find(o => o.id === selectedObjectIds[0]);
    if (!primary) return;

    const primaryBox = getBoundingBox(primary);
    const targetSize = dimension === 'width' ? primaryBox.w : primaryBox.h;

    const updated = JSON.parse(JSON.stringify(doc)) as Document;
    const page = updated.pages.find(p => p.id === updated.currentPageId)!;
    const state = page.states.find(s => s.id === updated.currentStateId)!;

    state.layers.forEach(l => {
      l.objects = l.objects.map(obj => {
        if (selectedObjectIds.slice(1).includes(obj.id)) {
          const newObj = { ...obj } as any;
          if (dimension === 'width') {
            if (obj.type === 'ellipse') {
              newObj.rx = targetSize / 2;
            } else if (obj.type !== 'line' && obj.type !== 'path') {
              newObj.width = targetSize;
            }
          } else {
            if (obj.type === 'ellipse') {
              newObj.ry = targetSize / 2;
            } else if (obj.type !== 'line' && obj.type !== 'path') {
              newObj.height = targetSize;
            }
          }
          return newObj;
        }
        return obj;
      });
    });

    setDoc(updated);
    pushHistory(updated);
  };

  // Update Page sizes
  const handleUpdateDocumentSize = (w: number, h: number) => {
    mutateDocument(draft => {
      const page = draft.pages.find(p => p.id === draft.currentPageId);
      if (page) {
        page.width = w;
        page.height = h;
      }
    });
  };

  // Find currently selected object object
  const getSelectedObject = (): CanvasObject | null => {
    if (selectedObjectIds.length !== 1) return null;
    const objs = getActiveObjects(doc);
    return objs.find((o: CanvasObject) => o.id === selectedObjectIds[0]) || null;
  };

  const selectedObj = getSelectedObject();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', flexDirection: 'column', gap: '12px' }}>
        <div className="logo-icon" style={{ fontSize: '28px', width: '56px', height: '56px' }}>Py</div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Restoring your project…</span>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* App Main Top Header */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">Py</div>
          <span className="logo-title">Pyrotechnics</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            - spiritual successor of Fireworks
          </span>
        </div>

        {/* Undo/Redo & Utility buttons */}
        <div className="menu-items" style={{ margin: 0, gap: '8px' }}>
          <button 
            className="icon-action-btn" 
            disabled={historyIndex <= 0}
            onClick={handleUndo} 
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} className={historyIndex <= 0 ? 'opacity-30' : ''} />
          </button>
          
          <button 
            className="icon-action-btn" 
            disabled={historyIndex >= history.length - 1}
            onClick={handleRedo} 
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={16} className={historyIndex >= history.length - 1 ? 'opacity-30' : ''} />
          </button>
          
          <button 
            className="icon-action-btn text-red" 
            onClick={handleDeleteSelection}
            disabled={selectedObjectIds.length === 0}
            title="Delete Selected (Backspace)"
          >
            <Trash2 size={16} className={selectedObjectIds.length === 0 ? 'opacity-30' : ''} />
          </button>
          
          <div style={{ width: '1px', height: '20px', background: 'var(--border-light)', margin: '0 4px' }} />

          {/* Save status indicator */}
          <div
            id="save-status-indicator"
            title="Auto-save status (IndexedDB)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '11px',
              padding: '3px 8px',
              borderRadius: '6px',
              background: saveStatus === 'saved' ? 'rgba(34,197,94,0.1)' : saveStatus === 'saving' ? 'rgba(234,179,8,0.1)' : 'rgba(148,163,184,0.08)',
              color: saveStatus === 'saved' ? '#4ade80' : saveStatus === 'saving' ? '#facc15' : 'var(--text-muted)',
              transition: 'all 0.3s ease',
              minWidth: '80px',
              justifyContent: 'center',
            }}
          >
            {saveStatus === 'saved'   && <><Save size={11} /> Saved</>}
            {saveStatus === 'saving'  && <><DatabaseZap size={11} /> Saving…</>}
            {saveStatus === 'unsaved' && <><Save size={11} /> Unsaved</>}
          </div>

          <div style={{ width: '1px', height: '20px', background: 'var(--border-light)', margin: '0 4px' }} />

          <button 
            className="btn-secondary" 
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={handleReset}
          >
            <RotateCcw size={13} /> Reset Layout
          </button>

          <button
            id="clear-saved-data-btn"
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--text-muted)' }}
            onClick={handleClearSaved}
            title="Clear IndexedDB saved data and start fresh"
          >
            <Trash2 size={13} /> Clear Saved
          </button>
        </div>
      </header>

      {/* Main Panels Workspace Area */}
      <div className="workspace-layout">
        {/* Left Toolbar */}
        <Toolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          fillColor={fillColor}
          setFillColor={setFillColor}
          strokeColor={strokeColor}
          setStrokeColor={setStrokeColor}
          onImportImage={handleImportImage}
        />

        {/* Main interactive center area */}
        <div className="center-column">
          {/* Active play preview banner alert */}
          {isPlayingAnimation && (
            <div className="animation-banner">
              <Sparkles size={14} className="text-gold" style={{ color: 'var(--accent-gold)' }} />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>Playing Animation Frame Loop (Preview Mode)</span>
            </div>
          )}

          {/* Guide Card (Floating) */}
          {showGuide && (
            <div className="welcome-guide-card">
              <div className="guide-header">
                <span className="guide-title">
                  <Sparkles size={14} style={{ color: 'var(--accent-gold)' }} />
                  Pyrotechnicsへようこそ！
                </span>
                <button 
                  className="guide-close-btn" 
                  onClick={() => {
                    setShowGuide(false);
                    localStorage.setItem('pyrotechnics_guide_dismissed', 'true');
                  }}
                  title="ガイドを閉じる"
                >
                  &times;
                </button>
              </div>
              <div className="guide-body">
                <p className="guide-intro">
                  Vite + Reactで動作するブラウザ型ベクターデザインキャンバスです。使い方がすぐ分かるように、公式OGP画像テンプレートをあらかじめ展開しています！
                </p>
                <ul className="guide-steps">
                  <li>
                    <span className="step-badge">1</span>
                    <div>
                      <strong>クリック＆スタイル編集</strong>
                      <p>キャンバス上の任意の文字や図形をクリックして動かしたり、画面下部のプロパティパネルで色・透明度・影を変更できます。</p>
                    </div>
                  </li>
                  <li>
                    <span className="step-badge">2</span>
                    <div>
                      <strong>AI JSONマクロの実行</strong>
                      <p>右側の <strong>Macro Runner</strong> パネルから、AIが生成したデザインJSONコードを実行して自動描画できます。</p>
                    </div>
                  </li>
                  <li>
                    <span className="step-badge">3</span>
                    <div>
                      <strong>スライスの書き出し</strong>
                      <p>ツールバーの <strong>Slice Tool (Y)</strong> で書き出したい領域を囲み、右側パネルから個別にPNG/JPEG/SVGとして出力できます。</p>
                    </div>
                  </li>
                </ul>
                <button 
                  className="btn-primary guide-dismiss-btn"
                  onClick={() => {
                    setShowGuide(false);
                    localStorage.setItem('pyrotechnics_guide_dismissed', 'true');
                  }}
                >
                  はじめる！
                </button>
              </div>
            </div>
          )}

          <CanvasArea
            document={doc}
            setDocument={setDoc}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            fillColor={fillColor}
            strokeColor={strokeColor}
            selectedObjectIds={selectedObjectIds}
            setSelectedObjectIds={setSelectedObjectIds}
            brushSettings={brushSettings}
            eraserSettings={eraserSettings}
            pushHistory={pushHistory}
            isPlayingAnimation={isPlayingAnimation}
            previewAnimationStateId={previewStateId}
            zoom={zoom}
            setZoom={setZoom}
            showSlicesOverlay={showSlicesOverlay}
            lockSlicesOverlay={lockSlicesOverlay}
            activeLayerId={activeLayerId}
          />

          {/* Bottom Property Panel inspector */}
          <PropertiesPanel
            selectedObject={selectedObj}
            selectedObjectIds={selectedObjectIds}
            activeTool={activeTool}
            updateSelectedObject={updateSelectedObjectProps}
            brushSettings={brushSettings}
            setBrushSettings={setBrushSettings}
            eraserSettings={eraserSettings}
            setEraserSettings={setEraserSettings}
            document={doc}
            updateDocumentSize={handleUpdateDocumentSize}
            onCreateSliceFromSelection={handleCreateSliceFromSelection}
            onAlign={handleAlign}
            onDistribute={handleDistribute}
            onMatchSize={handleMatchSize}
            onUpdateMultipleObjects={handleUpdateMultipleObjects}
          />
        </div>

        {/* Sidebar panels */}
        <RightPanels
          document={doc}
          setDocument={setDoc}
          selectedObjectIds={selectedObjectIds}
          setSelectedObjectIds={setSelectedObjectIds}
          isPlayingAnimation={isPlayingAnimation}
          setIsPlayingAnimation={setIsPlayingAnimation}
          onExportSlice={handleExportSlice}
          onExportAllSlices={handleExportAllSlices}
          onFlattenLayer={handleFlattenLayer}
          showSlicesOverlay={showSlicesOverlay}
          setShowSlicesOverlay={setShowSlicesOverlay}
          lockSlicesOverlay={lockSlicesOverlay}
          setLockSlicesOverlay={setLockSlicesOverlay}
          onRunMacro={handleRunMacro}
          activeLayerId={activeLayerId}
          setActiveLayerId={setActiveLayerId}
        />
      </div>
    </div>
  );
}
