import { useRef, useEffect, useState, useCallback } from 'react';

const LS_KEY = 'atlas_split_width';
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 300;
const MAX_WIDTH = 760;

export function ResizableSplit({ left, right, leftClassName, rightClassName }) {
  const [width, setWidth] = useState(() => {
    try {
      const stored = parseInt(localStorage.getItem(LS_KEY), 10);
      return stored > 0 ? stored : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });

  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const dividerRef = useRef(null);

  const onMouseDown = useCallback(
    (e) => {
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = width;

      document.body.classList.add('is-resizing');
      dividerRef.current?.classList.add('is-active');
    },
    [width]
  );

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragging.current) return;

      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startW.current + e.clientX - startX.current)
      );

      setWidth(next);
    }

    function onMouseUp() {
      if (!dragging.current) return;

      dragging.current = false;
      document.body.classList.remove('is-resizing');
      dividerRef.current?.classList.remove('is-active');

      setWidth((currentWidth) => {
        try {
          localStorage.setItem(LS_KEY, String(currentWidth));
        } catch {
          // noop
        }

        return currentWidth;
      });
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.classList.remove('is-resizing');
    };
  }, []);

  return (
    <div className="splitpane">
      <div
        className={['splitpane__left', leftClassName].filter(Boolean).join(' ')}
        style={{ width }}
      >
        {left}
      </div>

      <div
        ref={dividerRef}
        className="splitpane__divider"
        onMouseDown={onMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-hidden="true"
      >
        <span className="splitpane__handle" />
      </div>

      <div className={['splitpane__right', rightClassName].filter(Boolean).join(' ')}>
        {right}
      </div>
    </div>
  );
}

export { ResizableSplit as ResizablePanes };
