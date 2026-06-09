import { useEffect, useState, type CSSProperties } from 'react';
import type { ComposerElement } from '../utils/domUtils';

const EDGE_MARGIN_PX = 12;
const ANCHOR_GAP_PX = 10;
const COMPOSER_LEFT_OFFSET_PX = 18;
const MIN_ANCHOR_WIDTH_PX = 220;
const MAX_ANCHOR_WIDTH_PX = 360;
const FALLBACK_ANCHOR_WIDTH_PX = 340;
const FALLBACK_BOTTOM_PX = 18;
const POSITION_POLL_MS = 500;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getFallbackAnchorStyle(): CSSProperties {
  const width = Math.min(
    FALLBACK_ANCHOR_WIDTH_PX,
    Math.max(MIN_ANCHOR_WIDTH_PX, window.innerWidth - EDGE_MARGIN_PX * 2),
  );
  const left = clamp(
    window.innerWidth - width - FALLBACK_BOTTOM_PX,
    EDGE_MARGIN_PX,
    Math.max(EDGE_MARGIN_PX, window.innerWidth - width - EDGE_MARGIN_PX),
  );

  return {
    left: `${Math.round(left).toString()}px`,
    bottom: `${FALLBACK_BOTTOM_PX.toString()}px`,
    width: `${Math.round(width).toString()}px`,
  };
}

function getComposerAnchorStyle(composer: ComposerElement | null): CSSProperties {
  if (!composer?.isConnected) {
    return getFallbackAnchorStyle();
  }

  const rect = composer.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0 || rect.top <= 0) {
    return getFallbackAnchorStyle();
  }

  const width = clamp(rect.width, MIN_ANCHOR_WIDTH_PX, MAX_ANCHOR_WIDTH_PX);
  const left = clamp(
    rect.left + COMPOSER_LEFT_OFFSET_PX,
    EDGE_MARGIN_PX,
    Math.max(EDGE_MARGIN_PX, window.innerWidth - width - EDGE_MARGIN_PX),
  );
  const bottom = Math.max(EDGE_MARGIN_PX, window.innerHeight - rect.top + ANCHOR_GAP_PX);

  return {
    left: `${Math.round(left).toString()}px`,
    bottom: `${Math.round(bottom).toString()}px`,
    width: `${Math.round(width).toString()}px`,
  };
}

function areAnchorStylesEqual(left: CSSProperties, right: CSSProperties): boolean {
  return left.left === right.left && left.bottom === right.bottom && left.width === right.width;
}

export function useComposerAnchor(composer: ComposerElement | null): CSSProperties {
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties>(() =>
    getComposerAnchorStyle(composer),
  );

  useEffect(() => {
    let animationFrameId = 0;

    const updateAnchorStyle = (): void => {
      animationFrameId = 0;
      const nextStyle = getComposerAnchorStyle(composer);

      setAnchorStyle((currentStyle) =>
        areAnchorStylesEqual(currentStyle, nextStyle) ? currentStyle : nextStyle,
      );
    };

    const scheduleAnchorUpdate = (): void => {
      if (animationFrameId !== 0) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(updateAnchorStyle);
    };

    scheduleAnchorUpdate();

    const resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleAnchorUpdate) : null;

    if (composer?.isConnected) {
      resizeObserver?.observe(composer);

      if (composer.parentElement) {
        resizeObserver?.observe(composer.parentElement);
      }
    }

    window.addEventListener('resize', scheduleAnchorUpdate);
    window.addEventListener('scroll', scheduleAnchorUpdate, true);
    window.visualViewport?.addEventListener('resize', scheduleAnchorUpdate);
    window.visualViewport?.addEventListener('scroll', scheduleAnchorUpdate);

    const pollId = window.setInterval(scheduleAnchorUpdate, POSITION_POLL_MS);

    return () => {
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
      }

      resizeObserver?.disconnect();
      window.clearInterval(pollId);
      window.removeEventListener('resize', scheduleAnchorUpdate);
      window.removeEventListener('scroll', scheduleAnchorUpdate, true);
      window.visualViewport?.removeEventListener('resize', scheduleAnchorUpdate);
      window.visualViewport?.removeEventListener('scroll', scheduleAnchorUpdate);
    };
  }, [composer]);

  return anchorStyle;
}
