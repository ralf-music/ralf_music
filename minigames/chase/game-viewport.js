(function (global) {
  'use strict';

  const doc = global.document;
  const registry = new Set();
  let viewportFrame = 0;
  let delayedTimers = [];

  function finitePositive(values) {
    return values.filter(value => Number.isFinite(value) && value > 0);
  }

  function getViewportSize() {
    const vv = global.visualViewport;
    const widths = finitePositive([
      vv && vv.width,
      doc.documentElement && doc.documentElement.clientWidth,
      global.innerWidth
    ]);
    const heights = finitePositive([
      vv && vv.height,
      doc.documentElement && doc.documentElement.clientHeight,
      global.innerHeight
    ]);

    return {
      width: widths.length ? Math.min(...widths) : 1,
      height: heights.length ? Math.min(...heights) : 1
    };
  }

  function syncViewportVariables() {
    const size = getViewportSize();
    const root = doc.documentElement;
    root.style.setProperty('--omd-game-vw', `${Math.round(size.width)}px`);
    root.style.setProperty('--omd-game-vh', `${Math.round(size.height)}px`);
    root.dataset.omdOrientation = size.width >= size.height ? 'landscape' : 'portrait';
  }

  function refitAll() {
    syncViewportVariables();
    for (const fitter of registry) fitter.fit();
  }

  function scheduleRefit() {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(refitAll);
  }

  function scheduleSettledRefit() {
    scheduleRefit();
    delayedTimers.forEach(clearTimeout);
    delayedTimers = [60, 180, 360, 700].map(delay => setTimeout(refitAll, delay));
  }

  function createFitter(options) {
    const stage = typeof options.stage === 'string' ? doc.querySelector(options.stage) : options.stage;
    const content = typeof options.content === 'string' ? doc.querySelector(options.content) : options.content;
    const logicalWidth = Number(options.logicalWidth);
    const logicalHeight = Number(options.logicalHeight);
    const maxScale = Number.isFinite(options.maxScale) && options.maxScale > 0 ? options.maxScale : Infinity;

    if (!stage || !content || !(logicalWidth > 0) || !(logicalHeight > 0)) {
      return { fit() {}, destroy() {} };
    }

    let destroyed = false;
    let observer = null;

    function fit() {
      if (destroyed || !stage.isConnected || !content.isConnected) return;
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (!(width > 0) || !(height > 0)) return;

      const scale = Math.min(width / logicalWidth, height / logicalHeight, maxScale);
      if (!(scale > 0) || !Number.isFinite(scale)) return;

      const fittedWidth = Math.max(1, Math.floor(logicalWidth * scale));
      const fittedHeight = Math.max(1, Math.floor(logicalHeight * scale));

      const widthPx = `${fittedWidth}px`;
      const heightPx = `${fittedHeight}px`;
      if (content.style.width !== widthPx) content.style.width = widthPx;
      if (content.style.height !== heightPx) content.style.height = heightPx;
      if (content.style.maxWidth !== '100%') content.style.maxWidth = '100%';
      if (content.style.maxHeight !== '100%') content.style.maxHeight = '100%';
      if (content.style.flex !== '0 0 auto') content.style.flex = '0 0 auto';
      const ratio = `${logicalWidth} / ${logicalHeight}`;
      if (content.style.aspectRatio !== ratio) content.style.aspectRatio = ratio;

      stage.style.setProperty('--omd-fitted-width', widthPx);
      stage.style.setProperty('--omd-fitted-height', heightPx);
      stage.style.setProperty('--omd-fit-scale', String(scale));
    }

    const fitter = { fit, destroy };
    registry.add(fitter);

    if ('ResizeObserver' in global) {
      observer = new ResizeObserver(scheduleRefit);
      observer.observe(stage);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      registry.delete(fitter);
      if (observer) observer.disconnect();
      content.style.removeProperty('width');
      content.style.removeProperty('height');
      content.style.removeProperty('max-width');
      content.style.removeProperty('max-height');
      content.style.removeProperty('flex');
      content.style.removeProperty('aspect-ratio');
    }

    scheduleSettledRefit();
    return fitter;
  }

  global.addEventListener('resize', scheduleSettledRefit, { passive: true });
  global.addEventListener('orientationchange', scheduleSettledRefit, { passive: true });
  global.addEventListener('pageshow', scheduleSettledRefit, { passive: true });
  doc.addEventListener('fullscreenchange', scheduleSettledRefit);
  doc.addEventListener('webkitfullscreenchange', scheduleSettledRefit);
  if (global.visualViewport) {
    global.visualViewport.addEventListener('resize', scheduleSettledRefit, { passive: true });
    global.visualViewport.addEventListener('scroll', scheduleRefit, { passive: true });
  }

  syncViewportVariables();

  global.OMDGameViewport = {
    createFitter,
    refit: scheduleSettledRefit,
    getViewportSize
  };
})(window);
