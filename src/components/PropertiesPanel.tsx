import React from 'react';
import type { CanvasObject, ToolType, Document } from '../types';

interface PropertiesPanelProps {
  selectedObject: CanvasObject | null;
  selectedObjectIds: string[];
  activeTool: ToolType;
  updateSelectedObject: (props: Partial<CanvasObject>) => void;
  brushSettings: { size: number; hardness: number; opacity: number; color: string };
  setBrushSettings: React.Dispatch<React.SetStateAction<{ size: number; hardness: number; opacity: number; color: string }>>;
  eraserSettings: { size: number; opacity: number };
  setEraserSettings: React.Dispatch<React.SetStateAction<{ size: number; opacity: number }>>;
  document: Document;
  updateDocumentSize: (w: number, h: number) => void;
  onCreateSliceFromSelection: () => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedObject,
  selectedObjectIds,
  activeTool,
  updateSelectedObject,
  brushSettings,
  setBrushSettings,
  eraserSettings,
  setEraserSettings,
  document: doc,
  updateDocumentSize,
  onCreateSliceFromSelection
}) => {
  const activePage = doc.pages.find(p => p.id === doc.currentPageId);

  // Render content depending on selection and active tool
  const renderProperties = () => {
    if (selectedObjectIds.length > 1) {
      return (
        <div className="properties-body">
          <div className="control-group">
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Multiple selected ({selectedObjectIds.length})
            </span>
          </div>
          <div className="control-group">
            <button
              className="btn-secondary"
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                borderColor: 'var(--accent-green)',
                color: 'var(--accent-green)',
                height: '24px'
              }}
              onClick={onCreateSliceFromSelection}
              title="Create a slice wrapping all selected objects"
            >
              Insert Slice
            </button>
          </div>
        </div>
      );
    }

    if (selectedObject) {
      const obj = selectedObject;

      // Base properties for standard elements (dimensions, opacity, blendMode)
      const renderBaseProps = (showWH = true) => (
        <>
          {showWH && (
            <>
              <div className="control-group">
                <span className="control-label">X</span>
                <input
                  type="number"
                  className="control-input"
                  value={Math.round('x' in obj ? obj.x : 'cx' in obj ? obj.cx - obj.rx : 'x1' in obj ? Math.min(obj.x1, obj.x2) : 0)}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if ('x' in obj) updateSelectedObject({ x: val });
                    else if ('cx' in obj) updateSelectedObject({ cx: val + obj.rx });
                    else if ('x1' in obj) {
                      const dx = val - Math.min(obj.x1, obj.x2);
                      updateSelectedObject({ x1: obj.x1 + dx, x2: obj.x2 + dx });
                    }
                  }}
                />
              </div>
              <div className="control-group">
                <span className="control-label">Y</span>
                <input
                  type="number"
                  className="control-input"
                  value={Math.round('y' in obj ? obj.y : 'cy' in obj ? obj.cy - obj.ry : 'y1' in obj ? Math.min(obj.y1, obj.y2) : 0)}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if ('y' in obj) updateSelectedObject({ y: val });
                    else if ('cy' in obj) updateSelectedObject({ cy: val + obj.ry });
                    else if ('y1' in obj) {
                      const dy = val - Math.min(obj.y1, obj.y2);
                      updateSelectedObject({ y1: obj.y1 + dy, y2: obj.y2 + dy });
                    }
                  }}
                />
              </div>
              <div className="control-group">
                <span className="control-label">W</span>
                <input
                  type="number"
                  className="control-input"
                  value={Math.round('width' in obj ? obj.width : 'rx' in obj ? obj.rx * 2 : 'x1' in obj ? Math.abs(obj.x2 - obj.x1) : 0)}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value));
                    if ('width' in obj) updateSelectedObject({ width: val });
                    else if ('rx' in obj) updateSelectedObject({ rx: val / 2 });
                  }}
                />
              </div>
              <div className="control-group">
                <span className="control-label">H</span>
                <input
                  type="number"
                  className="control-input"
                  value={Math.round('height' in obj ? obj.height : 'ry' in obj ? obj.ry * 2 : 'y1' in obj ? Math.abs(obj.y2 - obj.y1) : 0)}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value));
                    if ('height' in obj) updateSelectedObject({ height: val });
                    else if ('ry' in obj) updateSelectedObject({ ry: val / 2 });
                  }}
                />
              </div>
            </>
          )}

          {'opacity' in obj && (
            <div className="control-group">
              <span className="control-label">Opacity ({obj.opacity}%)</span>
              <input
                type="range"
                min="0"
                max="100"
                style={{ width: '80px' }}
                value={obj.opacity}
                onChange={(e) => updateSelectedObject({ opacity: Number(e.target.value) })}
              />
            </div>
          )}

          {'blendMode' in obj && (
            <div className="control-group">
              <span className="control-label">Blend Mode</span>
              <select
                className="control-select"
                value={obj.blendMode}
                onChange={(e) => updateSelectedObject({ blendMode: e.target.value })}
              >
                <option value="source-over">Normal</option>
                <option value="multiply">Multiply</option>
                <option value="screen">Screen</option>
                <option value="overlay">Overlay</option>
                <option value="darken">Darken</option>
                <option value="lighten">Lighten</option>
                <option value="color-dodge">Color Dodge</option>
                <option value="color-burn">Color Burn</option>
                <option value="difference">Difference</option>
                <option value="hue">Hue</option>
                <option value="saturation">Saturation</option>
                <option value="color">Color</option>
                <option value="luminosity">Luminosity</option>
              </select>
            </div>
          )}
          {obj.type !== 'slice' && (
            <div className="control-group" style={{ marginLeft: 'auto' }}>
              <button
                className="btn-secondary"
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  borderColor: 'var(--accent-green)',
                  color: 'var(--accent-green)',
                  height: '24px'
                }}
                onClick={onCreateSliceFromSelection}
                title="Create a slice wrapping this object"
              >
                Insert Slice
              </button>
            </div>
          )}
        </>
      );

      // Render details according to object types
      switch (obj.type) {
        case 'rect':
        case 'ellipse':
        case 'line':
        case 'path':
          return (
            <div className="properties-body">
              {renderBaseProps(obj.type !== 'path')}

              {'fill' in obj && obj.fill !== undefined && (
                <div className="control-group">
                  <span className="control-label">Fill</span>
                  <div className="control-group-row">
                    <button 
                      className={`btn-secondary ${obj.fill === 'none' ? 'active' : ''}`}
                      style={{ padding: '2px 6px', fontSize: '10px' }}
                      onClick={() => updateSelectedObject({ fill: obj.fill === 'none' ? '#3b82f6' : 'none' })}
                    >
                      {obj.fill === 'none' ? 'Solid' : 'None'}
                    </button>
                    {obj.fill !== 'none' && (
                      <div className="color-picker-wrapper">
                        <div className="color-preview" style={{ backgroundColor: obj.fill }} />
                        <input
                          type="color"
                          className="color-input-hidden"
                          value={obj.fill.startsWith('#') && obj.fill.length === 7 ? obj.fill : '#3b82f6'}
                          onChange={(e) => updateSelectedObject({ fill: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {'stroke' in obj && (
                <>
                  <div className="control-group">
                    <span className="control-label">Stroke</span>
                    <div className="color-picker-wrapper">
                      <div className="color-preview" style={{ backgroundColor: obj.stroke }} />
                      <input
                        type="color"
                        className="color-input-hidden"
                        value={obj.stroke.startsWith('#') && obj.stroke.length === 7 ? obj.stroke : '#000000'}
                        onChange={(e) => updateSelectedObject({ stroke: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="control-group">
                    <span className="control-label">Stroke W ({obj.strokeWidth}px)</span>
                    <input
                      type="number"
                      className="control-input"
                      style={{ width: '70px' }}
                      min="0"
                      max="50"
                      value={obj.strokeWidth}
                      onChange={(e) => updateSelectedObject({ strokeWidth: Math.max(0, Number(e.target.value)) })}
                    />
                  </div>
                  {obj.type === 'line' && (
                    <>
                      <div className="control-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={!!(obj as any).arrowStart}
                            onChange={(e) => updateSelectedObject({ arrowStart: e.target.checked })}
                          />
                          Start Arrow
                        </label>
                      </div>
                      <div className="control-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '6px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={!!(obj as any).arrowEnd}
                            onChange={(e) => updateSelectedObject({ arrowEnd: e.target.checked })}
                          />
                          End Arrow
                        </label>
                      </div>
                    </>
                  )}
                </>
              )}

              {obj.type === 'rect' && (
                <div className="control-group">
                  <span className="control-label">Corner Radius ({obj.rx}px)</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    style={{ width: '80px' }}
                    value={obj.rx}
                    onChange={(e) => updateSelectedObject({ rx: Number(e.target.value) })}
                  />
                </div>
              )}

              {/* Shadow control */}
              {'shadowBlur' in obj && (
                <div className="control-group">
                  <span className="control-label">Drop Shadow</span>
                  <div className="control-group-row">
                    <input
                      type="color"
                      style={{ width: '24px', height: '24px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                      value={obj.shadowColor.startsWith('#') ? obj.shadowColor : '#000000'}
                      onChange={(e) => updateSelectedObject({ shadowColor: e.target.value })}
                    />
                    <input
                      type="number"
                      placeholder="Blur"
                      className="control-input"
                      style={{ width: '40px' }}
                      min="0"
                      value={obj.shadowBlur}
                      onChange={(e) => updateSelectedObject({ shadowBlur: Math.max(0, Number(e.target.value)) })}
                    />
                    <input
                      type="number"
                      placeholder="X"
                      className="control-input"
                      style={{ width: '40px' }}
                      value={obj.shadowOffsetX}
                      onChange={(e) => updateSelectedObject({ shadowOffsetX: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      placeholder="Y"
                      className="control-input"
                      style={{ width: '40px' }}
                      value={obj.shadowOffsetY}
                      onChange={(e) => updateSelectedObject({ shadowOffsetY: Number(e.target.value) })}
                    />
                  </div>
                </div>
              )}
            </div>
          );

        case 'text':
          return (
            <div className="properties-body">
              {renderBaseProps()}
              
              <div className="control-group">
                <span className="control-label">Font Family</span>
                <select
                  className="control-select"
                  value={obj.fontFamily}
                  onChange={(e) => updateSelectedObject({ fontFamily: e.target.value })}
                >
                  <option value="Outfit">Outfit</option>
                  <option value="Inter">Inter</option>
                  <option value="sans-serif">Sans-Serif</option>
                  <option value="serif">Serif</option>
                  <option value="monospace">Monospace</option>
                  <option value="JetBrains Mono">JetBrains Mono</option>
                </select>
              </div>

              <div className="control-group">
                <span className="control-label">Font Size</span>
                <input
                  type="number"
                  className="control-input"
                  min="8"
                  max="150"
                  value={obj.fontSize}
                  onChange={(e) => updateSelectedObject({ fontSize: Math.max(8, Number(e.target.value)) })}
                />
              </div>

              <div className="control-group">
                <span className="control-label">Text Fill</span>
                <div className="color-picker-wrapper">
                  <div className="color-preview" style={{ backgroundColor: obj.fill }} />
                  <input
                    type="color"
                    className="color-input-hidden"
                    value={obj.fill}
                    onChange={(e) => updateSelectedObject({ fill: e.target.value })}
                  />
                </div>
              </div>

              <div className="control-group" style={{ flexDirection: 'row', gap: '4px', marginTop: '16px' }}>
                <button
                  className={`btn-secondary ${obj.fontWeight === 'bold' ? 'active' : ''}`}
                  style={{ padding: '4px 8px', fontWeight: 'bold' }}
                  onClick={() => updateSelectedObject({ fontWeight: obj.fontWeight === 'bold' ? 'normal' : 'bold' })}
                >
                  B
                </button>
                <button
                  className={`btn-secondary ${obj.fontStyle === 'italic' ? 'active' : ''}`}
                  style={{ padding: '4px 8px', fontStyle: 'italic' }}
                  onClick={() => updateSelectedObject({ fontStyle: obj.fontStyle === 'italic' ? 'normal' : 'italic' })}
                >
                  I
                </button>
              </div>

              <div className="control-group">
                <span className="control-label">Align</span>
                <select
                  className="control-select"
                  value={obj.textAlign}
                  onChange={(e) => updateSelectedObject({ textAlign: e.target.value as any })}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
          );

        case 'bitmap':
          return (
            <div className="properties-body">
              {renderBaseProps(true)}
              
              <div style={{ width: '1px', height: '24px', background: 'var(--border-light)', margin: '0 8px' }} />

              <div className="control-group">
                <span className="control-label">Blur ({obj.filters.blur}px)</span>
                <input
                  type="range"
                  min="0"
                  max="15"
                  style={{ width: '70px' }}
                  value={obj.filters.blur}
                  onChange={(e) => updateSelectedObject({ 
                    filters: { ...obj.filters, blur: Number(e.target.value) } 
                  })}
                />
              </div>

              <div className="control-group">
                <span className="control-label">Bright ({obj.filters.brightness}%)</span>
                <input
                  type="range"
                  min="50"
                  max="180"
                  style={{ width: '70px' }}
                  value={obj.filters.brightness}
                  onChange={(e) => updateSelectedObject({ 
                    filters: { ...obj.filters, brightness: Number(e.target.value) } 
                  })}
                />
              </div>

              <div className="control-group">
                <span className="control-label">Contrast ({obj.filters.contrast}%)</span>
                <input
                  type="range"
                  min="50"
                  max="180"
                  style={{ width: '70px' }}
                  value={obj.filters.contrast}
                  onChange={(e) => updateSelectedObject({ 
                    filters: { ...obj.filters, contrast: Number(e.target.value) } 
                  })}
                />
              </div>

              <div style={{ width: '1px', height: '24px', background: 'var(--border-light)', margin: '0 8px' }} />

              <div className="control-group" style={{ flexDirection: 'row', gap: '6px', marginTop: '16px' }}>
                <button
                  className={`btn-secondary ${obj.filters.grayscale > 0 ? 'active' : ''}`}
                  style={{ padding: '2px 8px', fontSize: '10px', height: '24px' }}
                  onClick={() => updateSelectedObject({
                    filters: { ...obj.filters, grayscale: obj.filters.grayscale > 0 ? 0 : 100 }
                  })}
                >
                  Grayscale
                </button>
                <button
                  className={`btn-secondary ${obj.filters.sepia > 0 ? 'active' : ''}`}
                  style={{ padding: '2px 8px', fontSize: '10px', height: '24px' }}
                  onClick={() => updateSelectedObject({
                    filters: { ...obj.filters, sepia: obj.filters.sepia > 0 ? 0 : 100 }
                  })}
                >
                  Sepia
                </button>
              </div>
            </div>
          );

        case 'slice':
          return (
            <div className="properties-body">
              {renderBaseProps()}
              <div className="control-group">
                <span className="control-label">Slice Name</span>
                <input
                  type="text"
                  className="control-input long"
                  value={obj.name}
                  onChange={(e) => updateSelectedObject({ name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })}
                />
              </div>

              <div className="control-group">
                <span className="control-label">Export Format</span>
                <select
                  className="control-select"
                  value={obj.format}
                  onChange={(e) => updateSelectedObject({ format: e.target.value as any })}
                >
                  <option value="png">PNG (Lossless)</option>
                  <option value="jpeg">JPEG (Photo)</option>
                  <option value="svg">SVG (Vector)</option>
                </select>
              </div>

              {obj.format === 'jpeg' && (
                <div className="control-group">
                  <span className="control-label">JPEG Quality ({obj.quality}%)</span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={obj.quality}
                    onChange={(e) => updateSelectedObject({ quality: Number(e.target.value) })}
                  />
                </div>
              )}
            </div>
          );

      }
    }

    // Paint settings if tool is paint-based
    if (activeTool === 'brush') {
      return (
        <div className="properties-body">
          <div className="control-group">
            <span className="control-label">Brush Size ({brushSettings.size}px)</span>
            <input
              type="range"
              min="1"
              max="80"
              style={{ width: '120px' }}
              value={brushSettings.size}
              onChange={(e) => setBrushSettings({ ...brushSettings, size: Number(e.target.value) })}
            />
          </div>
          <div className="control-group">
            <span className="control-label">Hardness ({brushSettings.hardness}%)</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ width: '100px' }}
              value={brushSettings.hardness}
              onChange={(e) => setBrushSettings({ ...brushSettings, hardness: Number(e.target.value) })}
            />
          </div>
          <div className="control-group">
            <span className="control-label">Opacity ({brushSettings.opacity}%)</span>
            <input
              type="range"
              min="1"
              max="100"
              style={{ width: '100px' }}
              value={brushSettings.opacity}
              onChange={(e) => setBrushSettings({ ...brushSettings, opacity: Number(e.target.value) })}
            />
          </div>
          <div className="control-group">
            <span className="control-label">Color</span>
            <div className="color-picker-wrapper">
              <div className="color-preview" style={{ backgroundColor: brushSettings.color }} />
              <input
                type="color"
                className="color-input-hidden"
                value={brushSettings.color}
                onChange={(e) => setBrushSettings({ ...brushSettings, color: e.target.value })}
              />
            </div>
          </div>
        </div>
      );
    }

    if (activeTool === 'eraser') {
      return (
        <div className="properties-body">
          <div className="control-group">
            <span className="control-label">Eraser Size ({eraserSettings.size}px)</span>
            <input
              type="range"
              min="1"
              max="100"
              style={{ width: '120px' }}
              value={eraserSettings.size}
              onChange={(e) => setEraserSettings({ ...eraserSettings, size: Number(e.target.value) })}
            />
          </div>
          <div className="control-group">
            <span className="control-label">Opacity ({eraserSettings.opacity}%)</span>
            <input
              type="range"
              min="1"
              max="100"
              style={{ width: '120px' }}
              value={eraserSettings.opacity}
              onChange={(e) => setEraserSettings({ ...eraserSettings, opacity: Number(e.target.value) })}
            />
          </div>
        </div>
      );
    }

    // Default document parameters (when nothing selected and drawing tools inactive)
    return (
      <div className="properties-body">
        <div className="control-group">
          <span className="control-label">Document Name</span>
          <input
            type="text"
            className="control-input long"
            style={{ width: '150px' }}
            disabled
            value={doc.name}
          />
        </div>

        {activePage && (
          <>
            <div className="control-group">
              <span className="control-label">Page Width</span>
              <input
                type="number"
                className="control-input"
                min="100"
                max="5000"
                value={activePage.width}
                onChange={(e) => updateDocumentSize(Math.max(100, Number(e.target.value)), activePage.height)}
              />
            </div>
            <div className="control-group">
              <span className="control-label">Page Height</span>
              <input
                type="number"
                className="control-input"
                min="100"
                max="5000"
                value={activePage.height}
                onChange={(e) => updateDocumentSize(activePage.width, Math.max(100, Number(e.target.value)))}
              />
            </div>
          </>
        )}

        <div className="control-group" style={{ marginLeft: 'auto', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: varToString('--text-secondary') }}>Press Delete key to remove objects. Drag canvas with Middle Click or Spacebar.</span>
        </div>
      </div>
    );
  };

  return (
    <div className="properties-inspector">
      <div className="properties-header">Properties Inspector</div>
      {renderProperties()}
    </div>
  );
};

// Simple helper to fetch CSS custom variables if needed
function varToString(varName: string): string {
  return `var(${varName})`;
}
