import React from 'react';
import { 
  MousePointer, 
  Pointer, 
  Scissors, 
  PenTool, 
  Type, 
  Slash, 
  ArrowUpRight,
  Square, 
  Circle, 
  Paintbrush, 
  Eraser, 
  PaintBucket,
  Image as ImageIcon
} from 'lucide-react';
import type { ToolType } from '../types';

interface ToolbarProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  fillColor: string;
  setFillColor: (color: string) => void;
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  onImportImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  setActiveTool,
  fillColor,
  setFillColor,
  strokeColor,
  setStrokeColor,
  onImportImage
}) => {
  const tools = [
    { id: 'pointer', icon: MousePointer, label: 'Pointer Tool (V)', shortcut: 'V' },
    { id: 'subpointer', icon: Pointer, label: 'Sub-pointer Tool (A)', shortcut: 'A' },
    { type: 'divider' },
    { id: 'slice', icon: Scissors, label: 'Slice Tool (Y)', shortcut: 'Y' },
    { type: 'divider' },
    { id: 'pen', icon: PenTool, label: 'Pen Tool (P)', shortcut: 'P' },
    { id: 'text', icon: Type, label: 'Text Tool (T)', shortcut: 'T' },
    { id: 'line', icon: Slash, label: 'Line Tool (L)', shortcut: 'L' },
    { id: 'arrow', icon: ArrowUpRight, label: 'Arrow Tool (W)', shortcut: 'W' },
    { id: 'rect', icon: Square, label: 'Rectangle Tool (U)', shortcut: 'U' },
    { id: 'ellipse', icon: Circle, label: 'Ellipse Tool (O)', shortcut: 'O' },
    { type: 'divider' },
    { id: 'brush', icon: Paintbrush, label: 'Brush Tool (B)', shortcut: 'B' },
    { id: 'eraser', icon: Eraser, label: 'Eraser Tool (E)', shortcut: 'E' },
    { id: 'bucket', icon: PaintBucket, label: 'Paint Bucket Tool (G)', shortcut: 'G' },
  ];

  return (
    <div className="left-toolbar">
      {tools.map((t, idx) => {
        if (t.type === 'divider') {
          return <div key={`div-${idx}`} className="tool-btn-divider" />;
        }

        const ToolIcon = t.icon!;
        const toolId = t.id as ToolType;
        const isActive = activeTool === toolId;

        return (
          <button
            key={toolId}
            className={`tool-btn ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTool(toolId)}
          >
            <ToolIcon size={20} />
            <div className="tooltip">
              {t.label}
            </div>
          </button>
        );
      })}

      <div className="tool-btn-divider" />

      {/* Image Import button */}
      <label className="tool-btn" style={{ cursor: 'pointer' }}>
        <ImageIcon size={20} />
        <div className="tooltip">Import Image (I)</div>
        <input 
          type="file" 
          accept="image/*" 
          className="color-input-hidden" 
          onChange={onImportImage}
          value=""
        />
      </label>

      <div className="tool-btn-divider" />

      {/* Color Swatches */}
      <div className="control-group" style={{ alignItems: 'center', gap: '6px', marginTop: 'auto' }}>
        <div className="color-picker-wrapper" title="Fill Color">
          <div className="color-preview" style={{ backgroundColor: fillColor === 'none' ? 'transparent' : fillColor }} />
          <input 
            type="color" 
            className="color-input-hidden" 
            value={fillColor === 'none' ? '#ffffff' : fillColor} 
            onChange={(e) => setFillColor(e.target.value)} 
          />
        </div>
        
        <div className="color-picker-wrapper" title="Stroke Color">
          <div className="color-preview" style={{ backgroundColor: strokeColor === 'none' ? 'transparent' : strokeColor, borderRadius: '50%' }} />
          <input 
            type="color" 
            className="color-input-hidden" 
            value={strokeColor === 'none' ? '#000000' : strokeColor} 
            onChange={(e) => setStrokeColor(e.target.value)} 
          />
        </div>
      </div>
    </div>
  );
};
