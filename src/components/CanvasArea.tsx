import React, { useRef, useEffect, useState } from 'react';
import type { 
  Document, 
  CanvasObject, 
  ToolType, 
  EditMode, 
  Point, 
  RectObject, 
  EllipseObject, 
  LineObject,
  TextObject,
  PathObject,
  BitmapObject,
  SliceObject,
  State
} from '../types';
import { 
  renderDocument, 
  hitTestObjects, 
  checkTransformHandles, 
  getBoundingBox, 
  getOrCreateBitmapCanvas,
  drawArrowhead
} from '../utils/canvasHelper';

interface CanvasAreaProps {
  document: Document;
  setDocument: React.Dispatch<React.SetStateAction<Document>>;
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  fillColor: string;
  strokeColor: string;
  selectedObjectIds: string[];
  setSelectedObjectIds: React.Dispatch<React.SetStateAction<string[]>>;
  brushSettings: { size: number; hardness: number; opacity: number; color: string };
  eraserSettings: { size: number; opacity: number };
  pushHistory: (doc: Document) => void;
  isPlayingAnimation: boolean;
  previewAnimationStateId?: string;
  zoom: number;
  setZoom: (z: number) => void;
  showSlicesOverlay: boolean;
  lockSlicesOverlay: boolean;
  activeLayerId: string | null;
}

const shiftObjectLocal = (obj: any, dx: number, dy: number) => {
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

export const CanvasArea: React.FC<CanvasAreaProps> = ({
  document: doc,
  setDocument,
  activeTool,
  setActiveTool,
  fillColor,
  strokeColor,
  selectedObjectIds,
  setSelectedObjectIds,
  brushSettings,
  eraserSettings,
  pushHistory,
  isPlayingAnimation,
  previewAnimationStateId,
  zoom,
  setZoom,
  showSlicesOverlay,
  lockSlicesOverlay,
  activeLayerId
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Canvas offset (pan state)
  const [offset, setOffset] = useState({ x: 50, y: 50 });
  const [editMode, setEditMode] = useState<EditMode>({ type: 'idle' });
  const [tempPoints, setTempPoints] = useState<Point[]>([]); // For Pen tool
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  
  // Custom smart guides lines to draw
  const [smartGuides, setSmartGuides] = useState<{ x?: number; y?: number } | null>(null);

  // Right-click context menu overlay state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    objectId: string;
  } | null>(null);

  // Text editor overlay state
  const [textEditState, setTextEditState] = useState<{
    objectId: string;
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const activePage = doc.pages.find(p => p.id === doc.currentPageId) || doc.pages[0];
  const activeState = activePage?.states.find(s => s.id === doc.currentStateId) || activePage?.states[0];

  // Force render triggers
  const [renderCount, setRenderCount] = useState(0);
  const triggerRender = () => setRenderCount(c => c + 1);

  // Center the page canvas on mount
  useEffect(() => {
    if (containerRef.current && activePage) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;
      setOffset({
        x: (cw - activePage.width * zoom) / 2,
        y: (ch - activePage.height * zoom) / 2
      });
    }
  }, [doc.currentPageId]);

  // Main Render Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.parentElement?.clientWidth || 800;
    canvas.height = canvas.parentElement?.clientHeight || 600;
    
    // Draw document elements
    renderDocument(
      ctx,
      doc,
      zoom,
      offset,
      selectedObjectIds,
      showSlicesOverlay, // Show slices globally
      previewAnimationStateId,
      textEditState?.objectId,
      triggerRender
    );

    // Render pen tool temp points
    if (activeTool === 'pen' && tempPoints.length > 0) {
      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);

      ctx.strokeStyle = '#ffc600';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.moveTo(tempPoints[0].x, tempPoints[0].y);
      for (let i = 1; i < tempPoints.length; i++) {
        ctx.lineTo(tempPoints[i].x, tempPoints[i].y);
      }
      ctx.stroke();

      // Render dots
      ctx.fillStyle = '#ffc600';
      tempPoints.forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4 / zoom, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      });

      ctx.restore();
    }

    // Draw smart guides overlays
    if (smartGuides) {
      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);
      ctx.strokeStyle = '#a855f7'; // Purple guidelines
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);

      if (smartGuides.x !== undefined) {
        ctx.beginPath();
        ctx.moveTo(smartGuides.x, -5000);
        ctx.lineTo(smartGuides.x, 5000);
        ctx.stroke();
      }
      if (smartGuides.y !== undefined) {
        ctx.beginPath();
        ctx.moveTo(-5000, smartGuides.y);
        ctx.lineTo(5000, smartGuides.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    // Draw marquee selection overlays
    if (editMode.type === 'marquee_selecting') {
      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      const x = Math.min(editMode.startX, editMode.curX);
      const y = Math.min(editMode.startY, editMode.curY);
      const w = Math.abs(editMode.curX - editMode.startX);
      const h = Math.abs(editMode.curY - editMode.startY);
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

  }, [doc, zoom, offset, selectedObjectIds, activeTool, tempPoints, smartGuides, renderCount, previewAnimationStateId, textEditState, editMode, showSlicesOverlay]);

  // Convert mouse screen coordinates to canvas workspace coordinates
  const getCanvasCoords = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    
    // Position inside the canvas viewport
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Apply offset and zoom inversion
    return {
      x: (mouseX - offset.x) / zoom,
      y: (mouseY - offset.y) / zoom
    };
  };

  // Perform document changes & push undo state
  const mutateDocument = (updater: (draft: Document) => void) => {
    const updated = JSON.parse(JSON.stringify(doc)) as Document;
    updater(updated);
    setDocument(updated);
    pushHistory(updated);
  };

  // Perform high-performance shallow-copy immutable updates for drag/resize frames (no history push)
  const updateObjectsInDocumentTemp = (updates: { [id: string]: Partial<CanvasObject> }) => {
    setDocument(prev => {
      return {
        ...prev,
        pages: prev.pages.map(page => {
          if (page.id !== prev.currentPageId) return page;
          return {
            ...page,
            states: page.states.map(state => {
              if (state.id !== prev.currentStateId) return state;
              return {
                ...state,
                layers: state.layers.map(layer => {
                  const hasAny = layer.objects.some(o => updates[o.id] !== undefined);
                  if (!hasAny) return layer;
                  return {
                    ...layer,
                    objects: layer.objects.map(obj => {
                      const props = updates[obj.id];
                      if (!props) return obj;
                      return { ...obj, ...props } as CanvasObject;
                    })
                  };
                })
              };
            })
          };
        })
      };
    });
  };

  // Flatten nested objects list to search/edit
  const getActiveObjects = (documentState: Document): CanvasObject[] => {
    const page = documentState.pages.find(p => p.id === documentState.currentPageId);
    const state = page?.states.find(s => s.id === documentState.currentStateId);
    if (!state) return [];
    
    // Return all objects in reverse order (top layer objects first)
    const objs: CanvasObject[] = [];
    for (let i = state.layers.length - 1; i >= 0; i--) {
      if (state.layers[i].visible && !state.layers[i].locked) {
        objs.push(...state.layers[i].objects);
      }
    }
    return objs;
  };


  const getTargetLayer = (state: State) => {
    return state.layers.find(l => l.id === activeLayerId) || state.layers[0];
  };

  // Ensure active bitmap object is created / selected for painting tools
  const ensureActiveBitmapObject = (): { bitmapId: string } => {
    const activeObjs = getActiveObjects(doc);
    const selectedBitmap = activeObjs.find(o => o.type === 'bitmap' && selectedObjectIds.includes(o.id)) as BitmapObject;
    
    if (selectedBitmap) {
      return { bitmapId: selectedBitmap.id };
    }

    // Create a new full-page bitmap layer
    const newId = `bitmap-${Date.now()}`;
    const newBitmap: BitmapObject = {
      type: 'bitmap',
      id: newId,
      x: 0,
      y: 0,
      width: activePage.width,
      height: activePage.height,
      opacity: 100,
      filters: { blur: 0, brightness: 100, contrast: 100, grayscale: 0, sepia: 0 },
      blendMode: 'source-over'
    };

    mutateDocument(draft => {
      const page = draft.pages.find(p => p.id === draft.currentPageId)!;
      const state = page.states.find(s => s.id === draft.currentStateId)!;
      
      let targetLayer = state.layers.find(l => l.id === activeLayerId) || state.layers[0];
      if (!targetLayer) {
        targetLayer = {
          id: `layer-${Date.now()}`,
          name: 'Layer 1',
          visible: true,
          locked: false,
          objects: []
        };
        state.layers.push(targetLayer);
      }

      // Add to target layer list
      targetLayer.objects.push(newBitmap);
    });

    setSelectedObjectIds([newId]);
    return { bitmapId: newId };
  };

  // ----------------------------------------------------
  // EVENT HANDLERS
  // ----------------------------------------------------

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPlayingAnimation) return;

    if (contextMenu) {
      setContextMenu(null);
    }

    // Pan with middle click or if Spacebar is held
    if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
      setEditMode({ type: 'dragging_canvas' });
      return;
    }

    if (e.button !== 0) return; // Left clicks only

    const coords = getCanvasCoords(e);
    
    // Select Text Overlay closes on outside tap
    if (textEditState) {
      commitTextEdit();
    }

    // 1. BRUSH / ERASER / BUCKET (Bitmap Layer Editing)
    if (activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'bucket') {
      const { bitmapId } = ensureActiveBitmapObject();
      const bitmap = getActiveObjects(doc).find(o => o.id === bitmapId) as BitmapObject;
      if (!bitmap) return;

      const canvas = getOrCreateBitmapCanvas(bitmap.id, bitmap.width, bitmap.height, bitmap.dataUrl);
      const bCtx = canvas.getContext('2d');
      if (!bCtx) return;

      // Translate click relative to bitmap coordinates
      const paintX = coords.x - bitmap.x;
      const paintY = coords.y - bitmap.y;

      if (activeTool === 'bucket') {
        floodFill(canvas, Math.round(paintX), Math.round(paintY), brushSettings.color);
        mutateDocument(draft => {
          const page = draft.pages.find(p => p.id === draft.currentPageId)!;
          const state = page.states.find(s => s.id === draft.currentStateId)!;
          state.layers.forEach(l => {
            const o = l.objects.find(obj => obj.id === bitmap.id) as BitmapObject;
            if (o) o.dataUrl = canvas.toDataURL();
          });
        });
        triggerRender();
      } else {
        // Start brush stroke
        bCtx.save();
        bCtx.beginPath();
        bCtx.lineCap = 'round';
        bCtx.lineJoin = 'round';

        if (activeTool === 'brush') {
          bCtx.globalCompositeOperation = 'source-over';
          bCtx.strokeStyle = brushSettings.color;
          bCtx.globalAlpha = brushSettings.opacity / 100;
          bCtx.lineWidth = brushSettings.size;
        } else {
          // Eraser
          bCtx.globalCompositeOperation = 'destination-out';
          bCtx.lineWidth = eraserSettings.size;
        }

        bCtx.moveTo(paintX, paintY);
        bCtx.lineTo(paintX, paintY);
        bCtx.stroke();

        setEditMode({
          type: 'painting',
          bufferCanvas: canvas,
          ctx: bCtx,
          activeBitmapId: bitmapId
        });
      }
      return;
    }

    // 2. VECTOR PEN TOOL NODE PLOTTING
    if (activeTool === 'pen') {
      const clickPt: Point = { x: Math.round(coords.x), y: Math.round(coords.y) };
      setTempPoints(prev => [...prev, clickPt]);
      return;
    }

    // 3. TEXT LAYER INSERTION
    if (activeTool === 'text') {
      const textId = `text-${Date.now()}`;
      const newTextObj: TextObject = {
        type: 'text',
        id: textId,
        x: Math.round(coords.x),
        y: Math.round(coords.y),
        width: 200,
        height: 50,
        text: 'Type text...',
        fontSize: 24,
        fontFamily: 'Outfit',
        fill: fillColor === 'none' ? '#333333' : fillColor,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        opacity: 100,
        shadowColor: 'transparent',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        blendMode: 'source-over'
      };

      mutateDocument(draft => {
        const page = draft.pages.find(p => p.id === draft.currentPageId)!;
        const state = page.states.find(s => s.id === draft.currentStateId)!;
        const layer = getTargetLayer(state);
        if (layer) layer.objects.push(newTextObj);
      });

      setSelectedObjectIds([textId]);
      setActiveTool('pointer');
      
      // Open overlay editor
      setTextEditState({
        objectId: textId,
        text: 'Type text...',
        x: coords.x,
        y: coords.y,
        w: 200,
        h: 50
      });
      return;
    }

    // 4. SHAPE / BOX CREATION
    if (['rect', 'ellipse', 'line', 'arrow', 'slice'].includes(activeTool)) {
      setEditMode({
        type: 'creating_shape',
        startX: coords.x,
        startY: coords.y
      });
      return;
    }

    // 5. POINTER SELECTION / RESIZE / ROTATION
    if (activeTool === 'pointer') {
      // First check if user clicked on resize handles of active selection
      if (selectedObjectIds.length === 1) {
        const selObj = getActiveObjects(doc).find(o => o.id === selectedObjectIds[0]);
        if (selObj) {
          const handle = checkTransformHandles(selObj, coords.x, coords.y, zoom);
          if (handle) {
            setEditMode({
              type: 'transforming',
              handle,
              startX: coords.x,
              startY: coords.y,
              initialObjectState: JSON.parse(JSON.stringify(selObj))
            });
            return;
          }
        }
      }

      // Perform standard object selection click
      const hit = hitTestObjects(getActiveObjects(doc), coords.x, coords.y, showSlicesOverlay && !lockSlicesOverlay);
      if (hit) {
        let nextSelectedIds: string[];
        if (e.shiftKey) {
          // Toggle selection (Shift+Click)
          nextSelectedIds = selectedObjectIds.includes(hit.objectId)
            ? selectedObjectIds.filter(id => id !== hit.objectId)
            : [...selectedObjectIds, hit.objectId];
        } else {
          // Select single: if already selected, keep group selection so they can drag move. Otherwise, select only the clicked one.
          nextSelectedIds = selectedObjectIds.includes(hit.objectId)
            ? selectedObjectIds
            : [hit.objectId];
        }
        setSelectedObjectIds(nextSelectedIds);

        // Setup moving objects mode (only if the clicked object remains selected)
        if (nextSelectedIds.includes(hit.objectId)) {
          const selObjs = getActiveObjects(doc).filter(o => nextSelectedIds.includes(o.id));
          setEditMode({
            type: 'moving_objects',
            startX: coords.x,
            startY: coords.y,
            initialPositions: selObjs.map(o => ({
              id: o.id,
              initialObject: JSON.parse(JSON.stringify(o))
            }))
          });
        }
      } else {
        // Clicked on empty space: start marquee selection
        if (!e.shiftKey) {
          setSelectedObjectIds([]); // Clear selection if Shift is not held
        }
        setEditMode({
          type: 'marquee_selecting',
          startX: coords.x,
          startY: coords.y,
          curX: coords.x,
          curY: coords.y
        });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);

    // Dynamic Cursor Update Feedback
    if (canvasRef.current) {
      let targetCursor = 'default';
      if (isSpacePressed) {
        targetCursor = editMode.type === 'dragging_canvas' ? 'grabbing' : 'grab';
      } else if (editMode.type === 'dragging_canvas') {
        targetCursor = 'grabbing';
      } else if (editMode.type === 'moving_objects') {
        targetCursor = 'move';
      } else if (editMode.type === 'creating_shape') {
        targetCursor = 'crosshair';
      } else if (editMode.type === 'painting') {
        targetCursor = 'crosshair';
      } else if (editMode.type === 'transforming') {
        const handle = editMode.handle;
        if (handle === 'tl' || handle === 'br') targetCursor = 'nwse-resize';
        else if (handle === 'tr' || handle === 'bl') targetCursor = 'nesw-resize';
        else if (handle === 't' || handle === 'b') targetCursor = 'ns-resize';
        else if (handle === 'l' || handle === 'r') targetCursor = 'ew-resize';
        else if (handle === 'radius') targetCursor = 'pointer';
      } else if (editMode.type === 'idle') {
        if (activeTool === 'text') {
          targetCursor = 'text';
        } else if (['brush', 'eraser', 'bucket', 'pen', 'rect', 'ellipse', 'line', 'arrow', 'slice'].includes(activeTool)) {
          targetCursor = 'crosshair';
        } else if (activeTool === 'pointer') {
          let isOverHandle = false;
          if (selectedObjectIds.length === 1) {
            const selObj = getActiveObjects(doc).find(o => o.id === selectedObjectIds[0]);
            if (selObj) {
              const handle = checkTransformHandles(selObj, coords.x, coords.y, zoom);
              if (handle) {
                isOverHandle = true;
                if (handle === 'tl' || handle === 'br') targetCursor = 'nwse-resize';
                else if (handle === 'tr' || handle === 'bl') targetCursor = 'nesw-resize';
                else if (handle === 't' || handle === 'b') targetCursor = 'ns-resize';
                else if (handle === 'l' || handle === 'r') targetCursor = 'ew-resize';
                else if (handle === 'radius') targetCursor = 'pointer';
              }
            }
          }
          if (!isOverHandle) {
            const hit = hitTestObjects(getActiveObjects(doc), coords.x, coords.y, showSlicesOverlay && !lockSlicesOverlay);
            if (hit) {
              targetCursor = 'move';
            } else {
              targetCursor = 'grab';
            }
          }
        }
      }
      canvasRef.current.style.cursor = targetCursor;
    }

    // 1. DRAG CANVAS PANNING
    if (editMode.type === 'dragging_canvas') {
      setOffset(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
      return;
    }

    // 2. RASTER BUFFER PAINTING
    if (editMode.type === 'painting') {
      const bitmap = getActiveObjects(doc).find(o => o.id === editMode.activeBitmapId) as BitmapObject;
      if (!bitmap) return;

      const paintX = coords.x - bitmap.x;
      const paintY = coords.y - bitmap.y;

      editMode.ctx.lineTo(paintX, paintY);
      editMode.ctx.stroke();
      triggerRender();
      return;
    }

    // 3. VECTOR RESIZING / TRANSFORMING
    if (editMode.type === 'transforming') {
      const handle = editMode.handle;
      const dx = coords.x - editMode.startX;
      const dy = coords.y - editMode.startY;
      const init = editMode.initialObjectState;

      const props: any = {};

      if (handle === 'radius' && init.type === 'rect') {
        const radiusOffset = dx + dy;
        props.rx = Math.max(0, Math.min(Math.min(init.width, init.height) / 2, init.rx + radiusOffset));
      } else if (init.type === 'rect' || init.type === 'text' || init.type === 'bitmap' || init.type === 'slice') {
        const initBox = init as any;
        const isConstrained = init.type === 'bitmap' && e.shiftKey;

        if (isConstrained) {
          const initW = initBox.width;
          const initH = initBox.height;

          if (handle === 'br') {
            const scale = Math.max(0.01, Math.max((initW + dx) / initW, (initH + dy) / initH));
            props.width = Math.round(initW * scale);
            props.height = Math.round(initH * scale);
          } else if (handle === 'tr') {
            const scale = Math.max(0.01, Math.max((initW + dx) / initW, (initH - dy) / initH));
            props.width = Math.round(initW * scale);
            props.height = Math.round(initH * scale);
            props.y = Math.round(initBox.y + initH - props.height);
          } else if (handle === 'bl') {
            const scale = Math.max(0.01, Math.max((initW - dx) / initW, (initH + dy) / initH));
            props.width = Math.round(initW * scale);
            props.height = Math.round(initH * scale);
            props.x = Math.round(initBox.x + initW - props.width);
          } else if (handle === 'tl') {
            const scale = Math.max(0.01, Math.max((initW - dx) / initW, (initH - dy) / initH));
            props.width = Math.round(initW * scale);
            props.height = Math.round(initH * scale);
            props.x = Math.round(initBox.x + initW - props.width);
            props.y = Math.round(initBox.y + initH - props.height);
          } else if (handle === 'r') {
            props.width = Math.max(4, initW + dx);
          } else if (handle === 'b') {
            props.height = Math.max(4, initH + dy);
          } else if (handle === 'l') {
            props.x = initBox.x + dx;
            props.width = Math.max(4, initW - dx);
          } else if (handle === 't') {
            props.y = initBox.y + dy;
            props.height = Math.max(4, initH - dy);
          }
        } else {
          if (handle === 'r') props.width = Math.max(4, initBox.width + dx);
          if (handle === 'b') props.height = Math.max(4, initBox.height + dy);
          if (handle === 'l') {
            props.x = initBox.x + dx;
            props.width = Math.max(4, initBox.width - dx);
          }
          if (handle === 't') {
            props.y = initBox.y + dy;
            props.height = Math.max(4, initBox.height - dy);
          }

          // Diagonal corner handles
          if (handle === 'br') {
            props.width = Math.max(4, initBox.width + dx);
            props.height = Math.max(4, initBox.height + dy);
          }
          if (handle === 'tl') {
            props.x = initBox.x + dx;
            props.y = initBox.y + dy;
            props.width = Math.max(4, initBox.width - dx);
            props.height = Math.max(4, initBox.height - dy);
          }
          if (handle === 'tr') {
            props.y = initBox.y + dy;
            props.width = Math.max(4, initBox.width + dx);
            props.height = Math.max(4, initBox.height - dy);
          }
          if (handle === 'bl') {
            props.x = initBox.x + dx;
            props.width = Math.max(4, initBox.width - dx);
            props.height = Math.max(4, initBox.height + dy);
          }
        }
      } else if (init.type === 'ellipse') {
        const left = init.cx - init.rx;
        const right = init.cx + init.rx;
        const top = init.cy - init.ry;
        const bottom = init.cy + init.ry;

        // X-axis adjustments
        if (handle === 'r' || handle === 'tr' || handle === 'br') {
          const newRight = Math.max(left + 4, right + dx);
          props.rx = (newRight - left) / 2;
          props.cx = left + props.rx;
        } else if (handle === 'l' || handle === 'tl' || handle === 'bl') {
          const newLeft = Math.min(right - 4, left + dx);
          props.rx = (right - newLeft) / 2;
          props.cx = newLeft + props.rx;
        }

        // Y-axis adjustments
        if (handle === 'b' || handle === 'bl' || handle === 'br') {
          const newBottom = Math.max(top + 4, bottom + dy);
          props.ry = (newBottom - top) / 2;
          props.cy = top + props.ry;
        } else if (handle === 't' || handle === 'tl' || handle === 'tr') {
          const newTop = Math.min(bottom - 4, top + dy);
          props.ry = (bottom - newTop) / 2;
          props.cy = newTop + props.ry;
        }
      } else if (init.type === 'line') {
        if (handle === 'tl') {
          props.x1 = init.x1 + dx;
          props.y1 = init.y1 + dy;
        } else if (handle === 'br') {
          props.x2 = init.x2 + dx;
          props.y2 = init.y2 + dy;
        }
      } else if (init.type === 'path') {
        const initBox = getBoundingBox(init);
        let newX = initBox.x;
        let newY = initBox.y;
        let newW = initBox.w;
        let newH = initBox.h;

        // X-axis adjustments
        if (handle === 'r' || handle === 'tr' || handle === 'br') {
          newW = Math.max(4, initBox.w + dx);
        } else if (handle === 'l' || handle === 'tl' || handle === 'bl') {
          newX = initBox.x + dx;
          newW = Math.max(4, initBox.w - dx);
        }

        // Y-axis adjustments
        if (handle === 'b' || handle === 'bl' || handle === 'br') {
          newH = Math.max(4, initBox.h + dy);
        } else if (handle === 't' || handle === 'tl' || handle === 'tr') {
          newY = initBox.y + dy;
          newH = Math.max(4, initBox.h - dy);
        }

        props.points = init.points.map(pt => {
          const ratioX = (pt.x - initBox.x) / initBox.w;
          const ratioY = (pt.y - initBox.y) / initBox.h;
          const newPt: any = {
            x: newX + ratioX * newW,
            y: newY + ratioY * newH
          };

          if (pt.cp1x !== undefined && pt.cp1y !== undefined) {
            const ratioCp1x = (pt.cp1x - initBox.x) / initBox.w;
            const ratioCp1y = (pt.cp1y - initBox.y) / initBox.h;
            newPt.cp1x = newX + ratioCp1x * newW;
            newPt.cp1y = newY + ratioCp1y * newH;
          }
          if (pt.cp2x !== undefined && pt.cp2y !== undefined) {
            const ratioCp2x = (pt.cp2x - initBox.x) / initBox.w;
            const ratioCp2y = (pt.cp2y - initBox.y) / initBox.h;
            newPt.cp2x = newX + ratioCp2x * newW;
            newPt.cp2y = newY + ratioCp2y * newH;
          }

          return newPt;
        });
      }

      updateObjectsInDocumentTemp({ [init.id]: props });
      return;
    }

    // 4. OBJECT MOVING WITH ALIGNMENT SNAPPING (RIGID BODY)
    if (editMode.type === 'moving_objects') {
      const dx = coords.x - editMode.startX;
      const dy = coords.y - editMode.startY;

      // Smart Snapping calculations
      let snapX: number | undefined;
      let snapY: number | undefined;

      const itemsToSnap = editMode.initialPositions;
      const otherObjects = getActiveObjects(doc).filter(o => !selectedObjectIds.includes(o.id));
      const activeObjs = getActiveObjects(doc);

      // Calculate collective bounding box of the group at initial state
      let groupMinX = Infinity, groupMinY = Infinity;
      let groupMaxX = -Infinity, groupMaxY = -Infinity;
      itemsToSnap.forEach(pos => {
        const box = getBoundingBox(pos.initialObject);
        groupMinX = Math.min(groupMinX, box.x);
        groupMinY = Math.min(groupMinY, box.y);
        groupMaxX = Math.max(groupMaxX, box.x + box.w);
        groupMaxY = Math.max(groupMaxY, box.y + box.h);
      });
      const groupW = groupMaxX - groupMinX;
      const groupH = groupMaxY - groupMinY;

      let targetGroupX = groupMinX + dx;
      let targetGroupY = groupMinY + dy;

      const snapThreshold = 6;
      otherObjects.forEach(other => {
        const otherBox = getBoundingBox(other);

        // Snap group left/right edges to other box left/right edges
        if (Math.abs(targetGroupX - otherBox.x) < snapThreshold) {
          targetGroupX = otherBox.x;
          snapX = otherBox.x;
        } else if (Math.abs(targetGroupX - (otherBox.x + otherBox.w)) < snapThreshold) {
          targetGroupX = otherBox.x + otherBox.w;
          snapX = otherBox.x + otherBox.w;
        }
        if (Math.abs((targetGroupX + groupW) - otherBox.x) < snapThreshold) {
          targetGroupX = otherBox.x - groupW;
          snapX = otherBox.x;
        } else if (Math.abs((targetGroupX + groupW) - (otherBox.x + otherBox.w)) < snapThreshold) {
          targetGroupX = otherBox.x + otherBox.w - groupW;
          snapX = otherBox.x + otherBox.w;
        }

        // Snap group top/bottom edges to other box top/bottom edges
        if (Math.abs(targetGroupY - otherBox.y) < snapThreshold) {
          targetGroupY = otherBox.y;
          snapY = otherBox.y;
        } else if (Math.abs(targetGroupY - (otherBox.y + otherBox.h)) < snapThreshold) {
          targetGroupY = otherBox.y + otherBox.h;
          snapY = otherBox.y + otherBox.h;
        }
        if (Math.abs((targetGroupY + groupH) - otherBox.y) < snapThreshold) {
          targetGroupY = otherBox.y - groupH;
          snapY = otherBox.y;
        } else if (Math.abs((targetGroupY + groupH) - (otherBox.y + otherBox.h)) < snapThreshold) {
          targetGroupY = otherBox.y + otherBox.h - groupH;
          snapY = otherBox.y + otherBox.h;
        }
      });

      const finalShiftX = Math.round(targetGroupX - groupMinX);
      const finalShiftY = Math.round(targetGroupY - groupMinY);

      const updates: { [id: string]: Partial<CanvasObject> } = {};

      itemsToSnap.forEach(pos => {
        const obj = activeObjs.find(o => o.id === pos.id);
        if (!obj) return;

        const shiftedObj = JSON.parse(JSON.stringify(pos.initialObject));
        shiftObjectLocal(shiftedObj, finalShiftX, finalShiftY);
        updates[obj.id] = shiftedObj;
      });

      updateObjectsInDocumentTemp(updates);

      // Show guidelines
      if (snapX !== undefined || snapY !== undefined) {
        setSmartGuides({ x: snapX, y: snapY });
      } else {
        setSmartGuides(null);
      }
      return;
    }

    // Marquee selection dragging
    if (editMode.type === 'marquee_selecting') {
      setEditMode(prev => {
        if (prev.type !== 'marquee_selecting') return prev;
        return {
          ...prev,
          curX: coords.x,
          curY: coords.y
        };
      });
      triggerRender();
      return;
    }

    // 5. SHAPE CREATION SHADOW RECT
    if (editMode.type === 'creating_shape') {
      const startX = editMode.startX;
      const startY = editMode.startY;
      let curX = coords.x;
      let curY = coords.y;

      let sliceSnapGuide: { x?: number; y?: number } | null = null;

      if (activeTool === 'slice') {
        const snapThreshold = 8; // snap threshold
        const otherObjects = getActiveObjects(doc);
        
        let bestDiffX = snapThreshold;
        let bestDiffY = snapThreshold;
        let snappedX = curX;
        let snappedY = curY;

        otherObjects.forEach(obj => {
          if (obj.type === 'slice') return; // skip other slices
          const box = getBoundingBox(obj);
          const edgesX = [box.x, box.x + box.w];
          const edgesY = [box.y, box.y + box.h];

          edgesX.forEach(ex => {
            const diff = Math.abs(curX - ex);
            if (diff < bestDiffX) {
              bestDiffX = diff;
              snappedX = ex;
            }
          });

          edgesY.forEach(ey => {
            const diff = Math.abs(curY - ey);
            if (diff < bestDiffY) {
              bestDiffY = diff;
              snappedY = ey;
            }
          });
        });

        const guide: { x?: number; y?: number } = {};
        let snapped = false;

        if (bestDiffX < snapThreshold) {
          curX = snappedX;
          guide.x = snappedX;
          snapped = true;
        }
        if (bestDiffY < snapThreshold) {
          curY = snappedY;
          guide.y = snappedY;
          snapped = true;
        }

        if (snapped) {
          sliceSnapGuide = guide;
        }

        setSmartGuides(sliceSnapGuide);
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      triggerRender(); // Force redraw to clear old shadow lines

      // Overlay shape creation wireframe preview
      ctx.save();
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);

      if (activeTool === 'rect' || activeTool === 'slice') {
        ctx.strokeRect(startX, startY, curX - startX, curY - startY);
      } else if (activeTool === 'ellipse') {
        ctx.beginPath();
        const rx = Math.abs(curX - startX) / 2;
        const ry = Math.abs(curY - startY) / 2;
        ctx.ellipse(startX + (curX - startX) / 2, startY + (curY - startY) / 2, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (activeTool === 'line' || activeTool === 'arrow') {
        const dx = curX - startX;
        const dy = curY - startY;
        const L = Math.sqrt(dx * dx + dy * dy);
        let drawEndX = curX;
        let drawEndY = curY;

        if (activeTool === 'arrow' && L > 0) {
          const ux = dx / L;
          const uy = dy / L;
          const arrowWidthAngle = Math.PI / 6;
          const arrowLength = Math.max(10, 2 * 4); // Default preview stroke width is 2
          const arrowHeight = arrowLength * Math.cos(arrowWidthAngle);
          const shorten = Math.min(L, arrowHeight);
          drawEndX = curX - ux * shorten;
          drawEndY = curY - uy * shorten;
        }

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(drawEndX, drawEndY);
        ctx.stroke();

        if (activeTool === 'arrow') {
          drawArrowhead(ctx, startX, startY, curX, curY, 2, strokeColor === 'none' ? '#3b82f6' : strokeColor);
        }
      }

      ctx.restore();
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (editMode.type === 'dragging_canvas') {
      setEditMode({ type: 'idle' });
      return;
    }

    // Save bitmap changes to state on mouseUp
    if (editMode.type === 'painting') {
      const canvas = editMode.bufferCanvas;
      const bitmapId = editMode.activeBitmapId;

      mutateDocument(draft => {
        const page = draft.pages.find(p => p.id === draft.currentPageId)!;
        const state = page.states.find(s => s.id === draft.currentStateId)!;
        state.layers.forEach(l => {
          const o = l.objects.find(obj => obj.id === bitmapId) as BitmapObject;
          if (o) o.dataUrl = canvas.toDataURL(); // Persist image state
        });
      });

      setEditMode({ type: 'idle' });
      return;
    }

    if (editMode.type === 'transforming' || editMode.type === 'moving_objects') {
      pushHistory(doc); // Push final drag state to undo history
      setEditMode({ type: 'idle' });
      setSmartGuides(null);
      return;
    }

    if (editMode.type === 'marquee_selecting') {
      const x = Math.min(editMode.startX, editMode.curX);
      const y = Math.min(editMode.startY, editMode.curY);
      const w = Math.abs(editMode.curX - editMode.startX);
      const h = Math.abs(editMode.curY - editMode.startY);

      const intersectingIds: string[] = [];
      if (w > 0.5 || h > 0.5) { // Only select if drag is non-trivial
        const activeObjs = getActiveObjects(doc);
        activeObjs.forEach(obj => {
          if (obj.type === 'slice' && (lockSlicesOverlay || !showSlicesOverlay)) return; // Skip locked or hidden slices
          const objBox = getBoundingBox(obj);
          const intersects = 
            x < objBox.x + objBox.w &&
            x + w > objBox.x &&
            y < objBox.y + objBox.h &&
            y + h > objBox.y;
          if (intersects) {
            intersectingIds.push(obj.id);
          }
        });
      }

      if (e.shiftKey) {
        // Toggle selection (Shift-drag adds)
        setSelectedObjectIds((prev: string[]) => {
          const next = [...prev];
          intersectingIds.forEach(id => {
            if (!next.includes(id)) next.push(id);
          });
          return next;
        });
      } else {
        // Set selection
        setSelectedObjectIds(intersectingIds);
      }

      setEditMode({ type: 'idle' });
      triggerRender();
      return;
    }

    if (editMode.type === 'creating_shape') {
      const startX = editMode.startX;
      const startY = editMode.startY;
      const endCoords = getCanvasCoords(e);
      let endX = endCoords.x;
      let endY = endCoords.y;

      // Apply snap on MouseUp to lock coordinates
      if (activeTool === 'slice') {
        const snapThreshold = 8;
        const otherObjects = getActiveObjects(doc);
        let bestDiffX = snapThreshold;
        let bestDiffY = snapThreshold;

        otherObjects.forEach(obj => {
          if (obj.type === 'slice') return;
          const box = getBoundingBox(obj);
          const edgesX = [box.x, box.x + box.w];
          const edgesY = [box.y, box.y + box.h];

          edgesX.forEach(ex => {
            if (Math.abs(endX - ex) < bestDiffX) {
              bestDiffX = Math.abs(endX - ex);
              endX = ex;
            }
          });
          edgesY.forEach(ey => {
            if (Math.abs(endY - ey) < bestDiffY) {
              bestDiffY = Math.abs(endY - ey);
              endY = ey;
            }
          });
        });
      }
      
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const w = Math.max(4, Math.abs(endX - startX));
      const h = Math.max(4, Math.abs(endY - startY));

      const newId = `${activeTool}-${Date.now()}`;
      let newObj: CanvasObject | null = null;

      if (activeTool === 'rect') {
        newObj = {
          type: 'rect',
          id: newId,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          height: Math.round(h),
          rx: 0,
          fill: fillColor === 'none' ? 'none' : fillColor,
          stroke: strokeColor === 'none' ? '#000000' : strokeColor,
          strokeWidth: strokeColor === 'none' ? 0 : 2,
          opacity: 100,
          shadowColor: 'transparent',
          shadowBlur: 0,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          blendMode: 'source-over'
        } as RectObject;
      } else if (activeTool === 'ellipse') {
        newObj = {
          type: 'ellipse',
          id: newId,
          cx: Math.round(startX + (endCoords.x - startX) / 2),
          cy: Math.round(startY + (endCoords.y - startY) / 2),
          rx: Math.round(w / 2),
          ry: Math.round(h / 2),
          fill: fillColor === 'none' ? 'none' : fillColor,
          stroke: strokeColor === 'none' ? '#000000' : strokeColor,
          strokeWidth: strokeColor === 'none' ? 0 : 2,
          opacity: 100,
          shadowColor: 'transparent',
          shadowBlur: 0,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          blendMode: 'source-over'
        } as EllipseObject;
      } else if (activeTool === 'line' || activeTool === 'arrow') {
        newObj = {
          type: 'line',
          id: newId,
          x1: Math.round(startX),
          y1: Math.round(startY),
          x2: Math.round(endCoords.x),
          y2: Math.round(endCoords.y),
          stroke: strokeColor === 'none' ? '#000000' : strokeColor,
          strokeWidth: 2,
          opacity: 100,
          shadowColor: 'transparent',
          shadowBlur: 0,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          blendMode: 'source-over',
          arrowEnd: activeTool === 'arrow' ? true : undefined
        } as LineObject;
      } else if (activeTool === 'slice') {
        newObj = {
          type: 'slice',
          id: newId,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          height: Math.round(h),
          name: `slice_${activeSlicesCount() + 1}`,
          format: 'png',
          quality: 90
        } as SliceObject;
      }

      if (newObj) {
        mutateDocument(draft => {
          const page = draft.pages.find(p => p.id === draft.currentPageId)!;
          const state = page.states.find(s => s.id === draft.currentStateId)!;
          let layer = getTargetLayer(state);
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
          
          layer.objects.push(newObj!);
        });

        setSelectedObjectIds([newId]);
      }

      setEditMode({ type: 'idle' });
    }
  };

  const activeSlicesCount = () => {
    let count = 0;
    activeState?.layers.forEach(l => {
      l.objects.forEach(obj => {
        if (obj.type === 'slice') count++;
      });
    });
    return count;
  };

  // Complete Path vector edits on doubleclick
  const handleDoubleClick = () => {
    if (activeTool === 'pen' && tempPoints.length >= 2) {
      const pathId = `path-${Date.now()}`;
      const newPath: PathObject = {
        type: 'path',
        id: pathId,
        points: tempPoints,
        closed: true,
        fill: fillColor === 'none' ? 'none' : fillColor,
        stroke: strokeColor === 'none' ? '#000000' : strokeColor,
        strokeWidth: 2,
        opacity: 100,
        shadowColor: 'transparent',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        blendMode: 'source-over'
      };

      mutateDocument(draft => {
        const page = draft.pages.find(p => p.id === draft.currentPageId)!;
        const state = page.states.find(s => s.id === draft.currentStateId)!;
        const layer = getTargetLayer(state);
        if (layer) layer.objects.push(newPath);
      });

      setTempPoints([]);
      setSelectedObjectIds([pathId]);
    } else if (activeTool === 'pointer' && selectedObjectIds.length === 1) {
      const selObj = getActiveObjects(doc).find(o => o.id === selectedObjectIds[0]);
      if (selObj && selObj.type === 'text') {
        setTextEditState({
          objectId: selObj.id,
          text: selObj.text,
          x: selObj.x,
          y: selObj.y,
          w: selObj.width,
          h: selObj.height
        });
      }
    }
  };

  // Handle key listeners for escape node edits
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeTool === 'pen' && tempPoints.length > 0) {
        // Finish unclosed path
        const pathId = `path-${Date.now()}`;
        const newPath: PathObject = {
          type: 'path',
          id: pathId,
          points: tempPoints,
          closed: false,
          fill: 'none',
          stroke: strokeColor === 'none' ? '#000000' : strokeColor,
          strokeWidth: 2,
          opacity: 100,
          shadowColor: 'transparent',
          shadowBlur: 0,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          blendMode: 'source-over'
        };

        mutateDocument(draft => {
          const pageActive = draft.pages.find(p => p.id === draft.currentPageId)!;
          const stateActive = pageActive.states.find(s => s.id === draft.currentStateId)!;
          const activeLayer = getTargetLayer(stateActive);
          if (activeLayer) activeLayer.objects.push(newPath);
        });

        setTempPoints([]);
        setSelectedObjectIds([pathId]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tempPoints, activeTool]);

  // Spacebar key panning listeners
  useEffect(() => {
    const handleSpaceDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleSpaceUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setIsSpacePressed(false);
      }
    };
    const handleBlur = () => {
      setIsSpacePressed(false);
    };

    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Commit text editing area change
  const commitTextEdit = () => {
    if (!textEditState) return;
    mutateDocument(draft => {
      const page = draft.pages.find(p => p.id === draft.currentPageId)!;
      const state = page.states.find(s => s.id === draft.currentStateId)!;
      state.layers.forEach(l => {
        const obj = l.objects.find(o => o.id === textEditState.objectId) as TextObject;
        if (obj) {
          obj.text = textEditState.text;
        }
      });
    });
    setTextEditState(null);
  };

  // Stack flood fill algorithm
  const floodFill = (canvas: HTMLCanvasElement, startX: number, startY: number, fillHex: string) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Convert hex to rgb
    const r = parseInt(fillHex.slice(1, 3), 16);
    const g = parseInt(fillHex.slice(3, 5), 16);
    const b = parseInt(fillHex.slice(5, 7), 16);

    const getPixelIdx = (x: number, y: number) => (y * width + x) * 4;

    const startIdx = getPixelIdx(startX, startY);
    const targetR = data[startIdx];
    const targetG = data[startIdx+1];
    const targetB = data[startIdx+2];
    const targetA = data[startIdx+3];

    // If replacement color matches clicked color, abort
    if (targetR === r && targetG === g && targetB === b && targetA === 255) return;

    const matchColor = (idx: number) => {
      // Tolerance color check
      const dR = Math.abs(data[idx] - targetR);
      const dG = Math.abs(data[idx+1] - targetG);
      const dB = Math.abs(data[idx+2] - targetB);
      const dA = Math.abs(data[idx+3] - targetA);
      return (dR + dG + dB + dA) < 32; // Threshold limit
    };

    const queue: [number, number][] = [[startX, startY]];
    
    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!;
      const idx = getPixelIdx(cx, cy);

      if (matchColor(idx)) {
        data[idx] = r;
        data[idx+1] = g;
        data[idx+2] = b;
        data[idx+3] = 255; // Solid paint

        if (cx > 0) queue.push([cx - 1, cy]);
        if (cx < width - 1) queue.push([cx + 1, cy]);
        if (cy > 0) queue.push([cx, cy - 1]);
        if (cy < height - 1) queue.push([cx, cy + 1]);
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  // Local document state modifier with history pushing
  const mutateDocumentLocal = (updater: (draft: Document) => void) => {
    const updated = JSON.parse(JSON.stringify(doc)) as Document;
    updater(updated);
    setDocument(updated);
    pushHistory(updated);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isPlayingAnimation) return;

    const coords = getCanvasCoords(e);
    // Find right-clicked object (including slices if visible and unlocked)
    const hit = hitTestObjects(getActiveObjects(doc), coords.x, coords.y, showSlicesOverlay && !lockSlicesOverlay);
    if (hit) {
      setSelectedObjectIds([hit.objectId]);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        objectId: hit.objectId
      });
    } else {
      setContextMenu(null);
    }
  };

  // Zoom helpers
  const zoomIn = () => setZoom(Math.min(32, zoom * 1.25));
  const zoomOut = () => setZoom(Math.max(0.1, zoom / 1.25));
  const resetZoom = () => setZoom(1);

  // Position relative for Text Box editor overlay
  const textEditorStyle = (): React.CSSProperties => {
    if (!textEditState) return { display: 'none' };
    const selObj = getActiveObjects(doc).find(o => o.id === textEditState.objectId) as TextObject;
    if (!selObj) return { display: 'none' };

    const topPos = textEditState.y * zoom + offset.y;
    const leftPos = textEditState.x * zoom + offset.x;

    return {
      position: 'absolute',
      top: `${topPos}px`,
      left: `${leftPos}px`,
      width: `${selObj.width * zoom}px`,
      height: `${selObj.height * zoom}px`,
      fontSize: `${selObj.fontSize * zoom}px`,
      fontFamily: selObj.fontFamily,
      fontWeight: selObj.fontWeight,
      fontStyle: selObj.fontStyle,
      color: selObj.fill,
      lineHeight: 1.2,
      border: '1px dashed #ffc600',
      background: 'rgba(255,255,255,0.05)',
      resize: 'none',
      outline: 'none',
      colorScheme: 'dark'
    };
  };

  const handleMouseLeave = () => {
    setIsSpacePressed(false);
    if (editMode.type === 'dragging_canvas') {
      setEditMode({ type: 'idle' });
    }
  };

  return (
    <div 
      className="canvas-viewport" 
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      <canvas 
        ref={canvasRef} 
        className="canvas-element"
      />

      {/* Inline overlay editor for entering text */}
      {textEditState && (
        <textarea
          style={textEditorStyle()}
          value={textEditState.text}
          onChange={(e) => setTextEditState({ ...textEditState, text: e.target.value })}
          onBlur={commitTextEdit}
          autoFocus
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitTextEdit();
            }
            if (e.key === 'Escape') {
              commitTextEdit();
            }
          }}
        />
      )}

      {/* Sleek Custom Dark Glassmorphic Context Menu */}
      {contextMenu && (
        <div 
          className="custom-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {(() => {
            const activeObjs = getActiveObjects(doc);
            const targetObj = activeObjs.find(o => o.id === contextMenu.objectId);
            if (!targetObj) return null;

            if (targetObj.type === 'slice') {
              return (
                <>
                  <div className="context-menu-header">Slice: {targetObj.name}</div>
                  <button 
                    className="context-menu-item"
                    onClick={() => {
                      setContextMenu(null);
                      const input = prompt("Enter pixels to expand (or shrink) the slice region (e.g. 10 or -5):", "10");
                      if (input === null) return;
                      const val = Number(input);
                      if (!isNaN(val)) {
                        mutateDocumentLocal(draft => {
                          const page = draft.pages.find(p => p.id === draft.currentPageId)!;
                          const state = page.states.find(s => s.id === draft.currentStateId)!;
                          state.layers.forEach(l => {
                            l.objects = l.objects.map(obj => {
                              if (obj.id === targetObj.id && obj.type === 'slice') {
                                const current = obj;
                                const newW = Math.max(4, current.width + 2 * val);
                                const newH = Math.max(4, current.height + 2 * val);
                                return {
                                  ...current,
                                  x: Math.round(current.x - val),
                                  y: Math.round(current.y - val),
                                  width: Math.round(newW),
                                  height: Math.round(newH)
                                };
                              }
                              return obj;
                            });
                          });
                        });
                      }
                    }}
                  >
                    Adjust margin (px)...
                  </button>
                  <button 
                    className="context-menu-item"
                    onClick={() => {
                      setContextMenu(null);
                      const input = prompt("Enter scale percentage (e.g. 150 or 75):", "110");
                      if (input === null) return;
                      const val = Number(input);
                      if (!isNaN(val)) {
                        mutateDocumentLocal(draft => {
                          const page = draft.pages.find(p => p.id === draft.currentPageId)!;
                          const state = page.states.find(s => s.id === draft.currentStateId)!;
                          state.layers.forEach(l => {
                            l.objects = l.objects.map(obj => {
                              if (obj.id === targetObj.id && obj.type === 'slice') {
                                const current = obj;
                                const ratio = val / 100;
                                const newW = Math.max(4, current.width * ratio);
                                const newH = Math.max(4, current.height * ratio);
                                return {
                                  ...current,
                                  x: Math.round(current.x - (newW - current.width) / 2),
                                  y: Math.round(current.y - (newH - current.height) / 2),
                                  width: Math.round(newW),
                                  height: Math.round(newH)
                                };
                              }
                              return obj;
                            });
                          });
                        });
                      }
                    }}
                  >
                    Scale region (%)...
                  </button>
                  <button 
                    className="context-menu-item"
                    onClick={() => {
                      setContextMenu(null);
                      const input = prompt("Rename slice (alphanumeric, - and _ only):", targetObj.name);
                      if (input === null) return;
                      const cleanName = input.replace(/[^a-zA-Z0-9_-]/g, '');
                      if (cleanName) {
                        mutateDocumentLocal(draft => {
                          const page = draft.pages.find(p => p.id === draft.currentPageId)!;
                          const state = page.states.find(s => s.id === draft.currentStateId)!;
                          state.layers.forEach(l => {
                            const obj = l.objects.find(o => o.id === targetObj.id);
                            if (obj && obj.type === 'slice') {
                              obj.name = cleanName;
                            }
                          });
                        });
                      }
                    }}
                  >
                    Rename slice...
                  </button>
                  <div className="context-menu-divider" />
                  <button 
                    className="context-menu-item danger"
                    onClick={() => {
                      setContextMenu(null);
                      mutateDocumentLocal(draft => {
                        const page = draft.pages.find(p => p.id === draft.currentPageId)!;
                        const state = page.states.find(s => s.id === draft.currentStateId)!;
                        state.layers.forEach(l => {
                          l.objects = l.objects.filter(o => o.id !== targetObj.id);
                        });
                      });
                      setSelectedObjectIds([]);
                    }}
                  >
                    Delete slice
                  </button>
                </>
              );
            }

            // Standard Vector/Bitmap Object actions
            const currentObjLayer = activeState?.layers.find(l => l.objects.some(o => o.id === targetObj.id));
            const isDifferentLayer = currentObjLayer && activeLayerId && currentObjLayer.id !== activeLayerId;

            return (
              <>
                <div className="context-menu-header">{targetObj.type.toUpperCase()}: {targetObj.id.split('-')[0]}</div>
                {isDifferentLayer && (
                  <button 
                    className="context-menu-item"
                    style={{ color: 'var(--accent-gold)', fontWeight: 600 }}
                    onClick={() => {
                      setContextMenu(null);
                      mutateDocumentLocal(draft => {
                        const page = draft.pages.find(p => p.id === draft.currentPageId)!;
                        const state = page.states.find(s => s.id === draft.currentStateId)!;
                        
                        let foundObj: CanvasObject | null = null;
                        
                        // Remove object from its current layer
                        for (const l of state.layers) {
                          const idx = l.objects.findIndex(o => o.id === targetObj.id);
                          if (idx !== -1) {
                            foundObj = l.objects[idx];
                            l.objects.splice(idx, 1);
                            break;
                          }
                        }
                        
                        // Add to active layer
                        if (foundObj) {
                          const destLayer = state.layers.find(l => l.id === activeLayerId) || state.layers[0];
                          destLayer.objects.push(foundObj);
                        }
                      });
                    }}
                  >
                    Move to Active Layer
                  </button>
                )}
                <button 
                  className="context-menu-item"
                  onClick={() => {
                    setContextMenu(null);
                    mutateDocumentLocal(draft => {
                      const page = draft.pages.find(p => p.id === draft.currentPageId)!;
                      const state = page.states.find(s => s.id === draft.currentStateId)!;
                      state.layers.forEach(l => {
                        const idx = l.objects.findIndex(o => o.id === targetObj.id);
                        if (idx !== -1) {
                          const [obj] = l.objects.splice(idx, 1);
                          l.objects.push(obj); // Bring to front (last in drawing array)
                        }
                      });
                    });
                  }}
                >
                  Bring to Front
                </button>
                <button 
                  className="context-menu-item"
                  onClick={() => {
                    setContextMenu(null);
                    mutateDocumentLocal(draft => {
                      const page = draft.pages.find(p => p.id === draft.currentPageId)!;
                      const state = page.states.find(s => s.id === draft.currentStateId)!;
                      state.layers.forEach(l => {
                        const idx = l.objects.findIndex(o => o.id === targetObj.id);
                        if (idx !== -1) {
                          const [obj] = l.objects.splice(idx, 1);
                          l.objects.unshift(obj); // Send to back (first in drawing array)
                        }
                      });
                    });
                  }}
                >
                  Send to Back
                </button>
                <div className="context-menu-divider" />
                <button 
                  className="context-menu-item danger"
                  onClick={() => {
                    setContextMenu(null);
                    mutateDocumentLocal(draft => {
                      const page = draft.pages.find(p => p.id === draft.currentPageId)!;
                      const state = page.states.find(s => s.id === draft.currentStateId)!;
                      state.layers.forEach(l => {
                        l.objects = l.objects.filter(o => o.id !== targetObj.id);
                      });
                    });
                    setSelectedObjectIds([]);
                  }}
                >
                  Delete object
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* Floating Zoom Tooltips */}
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={zoomOut}>-</button>
        <span style={{ fontSize: '12px', minWidth: '40px', textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button className="zoom-btn" onClick={zoomIn}>+</button>
        <button 
          className="btn-secondary" 
          style={{ padding: '2px 6px', fontSize: '10px' }}
          onClick={resetZoom}
        >
          100%
        </button>
      </div>
    </div>
  );
};
