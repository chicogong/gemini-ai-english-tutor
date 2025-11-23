import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  color?: string;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isActive, color = '#38bdf8' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.clearRect(0, 0, width, height);
      
      if (!isActive) {
         // Draw a flat line if not active
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
        return;
      }

      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      
      const bars = 5;
      const spacing = width / bars;
      
      // Draw sine waves
      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.sin(x * 0.05 + time) * (height * 0.3) * Math.sin(time * 0.5);
        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      time += 0.2;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, color]);

  return (
    <canvas 
        ref={canvasRef} 
        width={300} 
        height={60} 
        className="w-full h-full"
    />
  );
};
