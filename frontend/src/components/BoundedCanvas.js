import React, { useEffect, useRef } from 'react';
import { Tldraw, createShapeId } from 'tldraw';
import { getPageDimensions } from '../config';

const BoundedCanvas = ({ onMount, fitToView = false, pageSize = 'A4', orientation = 'portrait', ...props }) => {
  const { canvasWidth, canvasHeight, pageWidth, pageHeight } = getPageDimensions(pageSize, orientation);
  const editorRef = useRef(null);
  const hasInitialized = useRef(false);

  const fitCanvasToView = () => {
    if (!editorRef.current) return;
    
    const { canvasWidth: currentCanvasWidth, canvasHeight: currentCanvasHeight } = getPageDimensions(pageSize, orientation);
    editorRef.current.zoomToFit({
      targetBounds: {
        x: -currentCanvasWidth / 2,
        y: -currentCanvasHeight / 2,
        w: currentCanvasWidth,
        h: currentCanvasHeight
      },
      inset: 20,
      animation: { duration: 0 }
    });
  };

  const handleMount = (editor) => {
    editorRef.current = editor;
    
    // Enable dynamic size preference
    editor.user.updateUserPreferences({ isDynamicSizeMode: true });
    
    // Block all interactions outside canvas boundary
    const originalHandleEvent = editor.root.handleEvent;
    editor.root.handleEvent = (info) => {
      if (info.type === 'pointer') {
        const point = editor.screenToPage({ x: info.point.x, y: info.point.y });
        const isOutside = 
          point.x < -canvasWidth / 2 || 
          point.x > canvasWidth / 2 || 
          point.y < -canvasHeight / 2 || 
          point.y > canvasHeight / 2;
        
        if (isOutside) {
          return; // Block all pointer events outside canvas
        }
      }
      return originalHandleEvent.call(editor.root, info);
    };
    
    // Create boundary shapes
    setTimeout(() => {
      const canvasBoundaryId = createShapeId('canvas-boundary');
      const pageBoundaryId = createShapeId('page-boundary');
      
      editor.createShape({
        id: canvasBoundaryId,
        type: 'geo',
        x: -canvasWidth / 2,
        y: -canvasHeight / 2,
        props: {
          w: canvasWidth,
          h: canvasHeight,
          geo: 'rectangle',
          fill: 'none',
          color: 'grey',
          size: 'm'
        },
        isLocked: true
      });
      
      editor.createShape({
        id: pageBoundaryId,
        type: 'geo',
        x: -pageWidth / 2,
        y: -pageHeight / 2,
        props: {
          w: pageWidth,
          h: pageHeight,
          geo: 'rectangle',
          fill: 'none',
          color: 'black',
          size: 'm'
        },
        isLocked: true
      });

      // Keep boundary shapes on top
      const ensureBoundariesOnTop = () => {
        const allShapes = editor.getCurrentPageShapes();
        const boundaryShapes = allShapes.filter(s => s.id.includes('boundary'));
        if (boundaryShapes.length > 0) {
          editor.bringToFront(boundaryShapes.map(s => s.id));
        }
      };

      // Listen for shape changes and ensure boundaries stay on top
      const unsubscribe = editor.store.listen(() => {
        ensureBoundariesOnTop();
      });
      
      if (!hasInitialized.current || fitToView) {
        fitCanvasToView();
        hasInitialized.current = true;
      }
    }, 100);

    if (onMount) {
      onMount(editor);
    }
  };

  useEffect(() => {
    if (fitToView && editorRef.current) {
      fitCanvasToView();
    }
  }, [fitToView]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!editorRef.current) return;
      
      try {
        const point = editorRef.current.screenToPage({ x: e.clientX, y: e.clientY });
        const isOutsideCanvas = 
          point.x < -canvasWidth / 2 || 
          point.x > canvasWidth / 2 || 
          point.y < -canvasHeight / 2 || 
          point.y > canvasHeight / 2;
        
        const canvas = document.querySelector('.tl-canvas');
        if (canvas) {
          canvas.style.cursor = isOutsideCanvas ? 'not-allowed' : '';
        }
      } catch (error) {
        // Ignore errors
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Tldraw onMount={handleMount} {...props} />
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: canvasWidth,
          height: canvasHeight,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 1000,
          boxShadow: `0 0 0 9999px rgba(200, 200, 200, 0.6)`
        }}
      />
    </div>
  );
};

export default BoundedCanvas;