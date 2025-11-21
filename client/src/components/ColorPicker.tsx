import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
  showBrandColors?: boolean;
}

export function ColorPicker({ color, onChange, label, showBrandColors = false }: ColorPickerProps) {
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [lightness, setLightness] = useState(50);
  const [opacity, setOpacity] = useState(100);
  const [hexValue, setHexValue] = useState(color || "#FFFFFF");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Convert hex to HSL
  useEffect(() => {
    if (color && color.startsWith('#')) {
      setHexValue(color);
    }
  }, [color]);

  // Update color when HSL changes
  useEffect(() => {
    const hslColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    const hexColor = hslToHex(hue, saturation, lightness);
    setHexValue(hexColor);
    onChange(hexColor);
  }, [hue, saturation, lightness]);

  const hslToHex = (h: number, s: number, l: number) => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newSaturation = (x / rect.width) * 100;
    const newLightness = 100 - (y / rect.height) * 100;
    
    setSaturation(Math.max(0, Math.min(100, newSaturation)));
    setLightness(Math.max(0, Math.min(100, newLightness)));
  };

  // Draw gradient canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Draw saturation gradient (left to right)
    for (let x = 0; x < width; x++) {
      const sat = (x / width) * 100;
      for (let y = 0; y < height; y++) {
        const light = 100 - (y / height) * 100;
        ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }, [hue]);

  return (
    <div className="space-y-1.5">
      {label && <Label className="text-[11px]">{label}</Label>}
      
      {/* Gradient Picker */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={200}
          height={120}
          className="w-full h-24 rounded-md cursor-crosshair border border-border"
          onClick={handleCanvasClick}
        />
        {/* Cursor indicator */}
        <div
          className="absolute w-4 h-4 rounded-full border-2 border-white shadow-lg pointer-events-none"
          style={{
            left: `${saturation}%`,
            top: `${100 - lightness}%`,
            transform: 'translate(-50%, -50%)'
          }}
        />
      </div>

      {/* Hue Slider */}
      <div className="space-y-0.5">
        <Label className="text-[11px]">Hue</Label>
        <div className="relative h-2.5 rounded overflow-hidden"
          style={{
            background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
          }}
        >
          <input
            type="range"
            min="0"
            max="360"
            value={hue}
            onChange={(e) => setHue(parseInt(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
          <div
            className="absolute top-0 w-1 h-full bg-white border border-gray-300 pointer-events-none"
            style={{ left: `${(hue / 360) * 100}%` }}
          />
        </div>
      </div>

      {/* Hex Input and Opacity */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-0.5">
          <Label className="text-[11px]">Hex</Label>
          <Input
            value={hexValue}
            onChange={(e) => {
              setHexValue(e.target.value);
              if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                onChange(e.target.value);
              }
            }}
            placeholder="#FFFFFF"
            className="h-7 text-[11px] px-2"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[11px]">Opacity: {opacity}%</Label>
          <input
            type="range"
            value={opacity}
            onChange={(e) => setOpacity(parseInt(e.target.value))}
            min={0}
            max={100}
            step={1}
            className="w-full h-7"
          />
        </div>
      </div>
    </div>
  );
}
