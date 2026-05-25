import { useState, useEffect, useRef } from 'react';
import { 
  Undo2, 
  Redo2, 
  Trash2, 
  RotateCcw,
  Sparkles
} from 'lucide-react';
import type { Document, ToolType, CanvasObject, BitmapObject, Page } from './types';
import { Toolbar } from './components/Toolbar';
import { CanvasArea } from './components/CanvasArea';
import { PropertiesPanel } from './components/PropertiesPanel';
import { RightPanels } from './components/RightPanels';
import { getOrCreateBitmapCanvas, getBoundingBox, drawArrowhead } from './utils/canvasHelper';
import { parseMacro, runMacro } from './utils/macroRunner';

// Define initial empty document setup
const createInitialDocument = (): Document => {
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

export default function App() {
  const [doc, setDoc] = useState<Document>(createInitialDocument());
  const [activeTool, setActiveTool] = useState<ToolType>('pointer');
  
  // Workspace properties
  const [fillColor, setFillColor] = useState<string>('#3b82f6');
  const [strokeColor, setStrokeColor] = useState<string>('#1e293b');
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  
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
  // Macro text pre-loaded from URL hash — passed to the macro panel
  const [urlMacroText, setUrlMacroText] = useState<string>('');

  const activePage = doc.pages.find(p => p.id === doc.currentPageId) || doc.pages[0];
  const activeState = activePage?.states.find(s => s.id === doc.currentStateId) || activePage?.states[0];

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
      const freshDoc = createInitialDocument();
      setDoc(freshDoc);
      setHistory([freshDoc]);
      setHistoryIndex(0);
      setSelectedObjectIds([]);
    }
  };

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
      if (key === 'h') setActiveTool('hotspot');
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
      // Skip slices/hotspots
      if (obj.type === 'slice' || obj.type === 'hotspot') return;
      
      offCtx.save();
      offCtx.globalAlpha = obj.opacity / 100;
      
      // Basic shapes rendering for rasterizing
      if (obj.type === 'rect') {
        offCtx.fillStyle = obj.fill === 'none' ? 'transparent' : obj.fill;
        offCtx.strokeStyle = obj.stroke;
        offCtx.lineWidth = obj.strokeWidth;
        offCtx.beginPath();
        if (obj.rx > 0) offCtx.roundRect(obj.x, obj.y, obj.width, obj.height, obj.rx);
        else offCtx.rect(obj.x, obj.y, obj.width, obj.height);
        offCtx.fill();
        if (obj.strokeWidth > 0) offCtx.stroke();
      } else if (obj.type === 'ellipse') {
        offCtx.fillStyle = obj.fill === 'none' ? 'transparent' : obj.fill;
        offCtx.strokeStyle = obj.stroke;
        offCtx.lineWidth = obj.strokeWidth;
        offCtx.beginPath();
        offCtx.ellipse(obj.cx, obj.cy, obj.rx, obj.ry, 0, 0, 2*Math.PI);
        offCtx.fill();
        if (obj.strokeWidth > 0) offCtx.stroke();
      } else if (obj.type === 'line') {
        offCtx.strokeStyle = obj.stroke;
        offCtx.lineWidth = obj.strokeWidth;
        offCtx.lineCap = 'round';

        const dx = obj.x2 - obj.x1;
        const dy = obj.y2 - obj.y1;
        const L = Math.sqrt(dx * dx + dy * dy);
        let x1Line = obj.x1;
        let y1Line = obj.y1;
        let x2Line = obj.x2;
        let y2Line = obj.y2;

        if (L > 0) {
          const ux = dx / L;
          const uy = dy / L;
          const arrowWidthAngle = Math.PI / 6;
          const arrowLength = Math.max(10, obj.strokeWidth * 4);
          const arrowHeight = arrowLength * Math.cos(arrowWidthAngle);
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

        offCtx.beginPath();
        offCtx.moveTo(x1Line, y1Line);
        offCtx.lineTo(x2Line, y2Line);
        offCtx.stroke();

        if (obj.arrowStart) {
          drawArrowhead(offCtx, obj.x2, obj.y2, obj.x1, obj.y1, obj.strokeWidth, obj.stroke);
        }
        if (obj.arrowEnd) {
          drawArrowhead(offCtx, obj.x1, obj.y1, obj.x2, obj.y2, obj.strokeWidth, obj.stroke);
        }
      } else if (obj.type === 'text') {
        offCtx.fillStyle = obj.fill;
        offCtx.font = `${obj.fontStyle} ${obj.fontWeight} ${obj.fontSize}px ${obj.fontFamily}`;
        offCtx.fillText(obj.text, obj.x, obj.y);
      } else if (obj.type === 'bitmap') {
        const bmpCanvas = getOrCreateBitmapCanvas(obj.id, obj.width, obj.height, obj.dataUrl);
        offCtx.drawImage(bmpCanvas, obj.x, obj.y, obj.width, obj.height);
      }
      
      offCtx.restore();
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

      // Keep slices and hotspots, replace others with flattened image
      const webOverlays = dLayer.objects.filter(o => o.type === 'slice' || o.type === 'hotspot');
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
          if (obj.type === 'slice' || obj.type === 'hotspot') return;

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
        if (obj.type === 'slice' || obj.type === 'hotspot') return;
        
        // Custom simple canvas drawing
        sCtx.save();
        sCtx.globalAlpha = obj.opacity / 100;
        
        if (obj.type === 'rect') {
          sCtx.fillStyle = obj.fill === 'none' ? 'transparent' : obj.fill;
          sCtx.strokeStyle = obj.stroke;
          sCtx.lineWidth = obj.strokeWidth;
          sCtx.beginPath();
          if (obj.rx > 0) sCtx.roundRect(obj.x, obj.y, obj.width, obj.height, obj.rx);
          else sCtx.rect(obj.x, obj.y, obj.width, obj.height);
          sCtx.fill();
          if (obj.strokeWidth > 0) sCtx.stroke();
        } else if (obj.type === 'ellipse') {
          sCtx.fillStyle = obj.fill === 'none' ? 'transparent' : obj.fill;
          sCtx.strokeStyle = obj.stroke;
          sCtx.lineWidth = obj.strokeWidth;
          sCtx.beginPath();
          sCtx.ellipse(obj.cx, obj.cy, obj.rx, obj.ry, 0, 0, 2*Math.PI);
          sCtx.fill();
          if (obj.strokeWidth > 0) sCtx.stroke();
        } else if (obj.type === 'line') {
          sCtx.strokeStyle = obj.stroke;
          sCtx.lineWidth = obj.strokeWidth;
          sCtx.lineCap = 'round';

          const dx = obj.x2 - obj.x1;
          const dy = obj.y2 - obj.y1;
          const L = Math.sqrt(dx * dx + dy * dy);
          let x1Line = obj.x1;
          let y1Line = obj.y1;
          let x2Line = obj.x2;
          let y2Line = obj.y2;

          if (L > 0) {
            const ux = dx / L;
            const uy = dy / L;
            const arrowWidthAngle = Math.PI / 6;
            const arrowLength = Math.max(10, obj.strokeWidth * 4);
            const arrowHeight = arrowLength * Math.cos(arrowWidthAngle);
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

          sCtx.beginPath();
          sCtx.moveTo(x1Line, y1Line);
          sCtx.lineTo(x2Line, y2Line);
          sCtx.stroke();

          if (obj.arrowStart) {
            drawArrowhead(sCtx, obj.x2, obj.y2, obj.x1, obj.y1, obj.strokeWidth, obj.stroke);
          }
          if (obj.arrowEnd) {
            drawArrowhead(sCtx, obj.x1, obj.y1, obj.x2, obj.y2, obj.strokeWidth, obj.stroke);
          }
        } else if (obj.type === 'text') {
          sCtx.fillStyle = obj.fill;
          sCtx.font = `${obj.fontStyle} ${obj.fontWeight} ${obj.fontSize}px ${obj.fontFamily}`;
          sCtx.textAlign = obj.textAlign;
          sCtx.textBaseline = 'top';
          // Shadow
          if (obj.shadowBlur > 0 || obj.shadowOffsetX !== 0 || obj.shadowOffsetY !== 0) {
            sCtx.shadowColor = obj.shadowColor;
            sCtx.shadowBlur = obj.shadowBlur;
            sCtx.shadowOffsetX = obj.shadowOffsetX;
            sCtx.shadowOffsetY = obj.shadowOffsetY;
          }
          const textStartX =
            obj.textAlign === 'left'   ? obj.x :
            obj.textAlign === 'center' ? obj.x + obj.width / 2 :
                                         obj.x + obj.width;
          // Split on newlines and draw each line
          const exportLines = obj.text.split('\n');
          exportLines.forEach((line, lineIdx) => {
            sCtx.fillText(line, textStartX, obj.y + lineIdx * (obj.fontSize * 1.2), obj.width);
          });
          sCtx.shadowColor = 'transparent';
          sCtx.shadowBlur = 0;
          sCtx.shadowOffsetX = 0;
          sCtx.shadowOffsetY = 0;
        } else if (obj.type === 'bitmap') {
          const bmpCanvas = getOrCreateBitmapCanvas(obj.id, obj.width, obj.height, obj.dataUrl);
          sCtx.drawImage(bmpCanvas, obj.x, obj.y, obj.width, obj.height);
        }
        sCtx.restore();
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

  // Generate and export absolute-positioned HTML & Hotspots Layout
  const handleExportHTML = () => {
    if (!activeState || !activePage) return;

    // Get slices and hotspots
    const slices: any[] = [];
    const hotspots: any[] = [];

    activeState.layers.forEach(l => {
      l.objects.forEach(o => {
        if (o.type === 'slice') slices.push(o);
        if (o.type === 'hotspot') hotspots.push(o);
      });
    });

    // Generate HTML markup
    let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${doc.name || 'Pyrotechnic Export'}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0f172a; /* Slate dark bg */
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .web-container {
      position: relative;
      width: ${activePage.width}px;
      height: ${activePage.height}px;
      background-color: #ffffff;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    .exported-slice {
      position: absolute;
      border: none;
      display: block;
    }
    .exported-hotspot {
      position: absolute;
      display: block;
      z-index: 100;
      text-decoration: none;
    }
    .exported-hotspot:hover {
      background-color: rgba(6, 182, 212, 0.15); /* Subtle highlight on hover */
    }
  </style>
</head>
<body>

  <div class="web-container">
`;

    // Render slices
    slices.forEach(slice => {
      const fileName = `${slice.name || 'slice'}.${slice.format}`;
      htmlContent += `    <img 
      src="${fileName}" 
      alt="${slice.name}" 
      class="exported-slice" 
      style="left: ${slice.x}px; top: ${slice.y}px; width: ${slice.width}px; height: ${slice.height}px;"
    />\n`;
    });

    // Render hotspots
    hotspots.forEach(hs => {
      htmlContent += `    <a 
      href="${hs.url}" 
      target="${hs.target}" 
      title="${hs.alt || ''}" 
      class="exported-hotspot" 
      style="left: ${hs.x}px; top: ${hs.y}px; width: ${hs.width}px; height: ${hs.height}px;"
    ></a>\n`;
    });

    htmlContent += `  </div>

</body>
</html>`;

    // Trigger download of index.html
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'index.html';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
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
        message: `✓ マクロを実行しました: ${macro.commands.length} コマンド完了${ macro.title ? ` (${macro.title})` : '' }`
      };
    } catch (e) {
      return {
        success: false,
        message: `✗ エラー: ${(e as Error).message}`
      };
    }
  };

  // On mount: check URL hash for #macro=BASE64_JSON and auto-execute
  useEffect(() => {
    const hash = window.location.hash; // e.g. "#macro=eyJzY2hlbWEi..."
    if (!hash.startsWith('#macro=')) return;

    const encoded = hash.slice('#macro='.length);
    let jsonString: string;
    try {
      jsonString = decodeURIComponent(atob(encoded));
    } catch {
      console.warn('[Pyrotechnic] URL hash のマクロをデコードできませんでした');
      return;
    }

    let macro: ReturnType<typeof parseMacro>;
    try {
      macro = parseMacro(jsonString);
    } catch (e) {
      console.warn('[Pyrotechnic] URL hash のマクロが無効です:', (e as Error).message);
      return;
    }

    // Always load the JSON into the macro panel textarea
    const prettyJson = JSON.stringify(macro, null, 2);
    setUrlMacroText(prettyJson);

    const title = macro.title ? `「${macro.title}」` : '';
    const confirmed = window.confirm(
      `URLにマクロ${title}が含まれています。\n` +
      `コマンド数: ${macro.commands.length}\n\n` +
      `実行しますか？（現在のキャンバスに反映されます）`
    );

    if (confirmed) {
      const newDoc = runMacro(macro, doc);
      setDoc(newDoc);
      pushHistory(newDoc);
    }

    // Remove hash from URL without page reload
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="app-container">
      {/* App Main Top Header */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">Py</div>
          <span className="logo-title">Pyrotechnic</span>
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

          <button 
            className="btn-secondary" 
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={handleReset}
          >
            <RotateCcw size={13} /> Reset Layout
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
          />
        </div>

        {/* Sidebar panels */}
        <RightPanels
          document={doc}
          setDocument={setDoc}
          selectedObject={selectedObj}
          selectedObjectIds={selectedObjectIds}
          setSelectedObjectIds={setSelectedObjectIds}
          isPlayingAnimation={isPlayingAnimation}
          setIsPlayingAnimation={setIsPlayingAnimation}
          onExportSlice={handleExportSlice}
          onExportAllSlices={handleExportAllSlices}
          onExportHTML={handleExportHTML}
          onFlattenLayer={handleFlattenLayer}
          showSlicesOverlay={showSlicesOverlay}
          setShowSlicesOverlay={setShowSlicesOverlay}
          lockSlicesOverlay={lockSlicesOverlay}
          setLockSlicesOverlay={setLockSlicesOverlay}
          onRunMacro={handleRunMacro}
          initialMacroText={urlMacroText}
        />
      </div>
    </div>
  );
}
