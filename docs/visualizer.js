/**
 * MoveStepViz - Pure SVG Visualizer & Exporter
 * Implements full parity with movestepviz.visualization.visualize
 */
window.MoveStepVisualizer = (function() {

  /**
   * Resolves color and metadata mapping for a scheme and custom colors
   */
  function buildSchemeIndex(scheme, customColors = {}) {
    const colorMap = {};
    const metaMap = {};

    if (scheme && scheme.moves) {
      scheme.moves.forEach(move => {
        const mNum = move.move_number;
        (move.steps || []).forEach((step, sIdx) => {
          const color = customColors[step.id] || step.color || '#9ca3af';

          const meta = {
            moveName: move.name,
            moveNumber: move.move_number,
            stepId: step.id,
            stepName: step.name,
            stepTitle: step.title || step.name,
            description: step.description || '',
            color: color
          };

          const registerKey = (k) => {
            if (!k) return;
            const kStr = String(k).trim();
            colorMap[kStr] = color;
            colorMap[kStr.toLowerCase()] = color;
            colorMap[kStr.toUpperCase()] = color;
            const clean = kStr.replace(/[-_\s]/g, '').toUpperCase();
            colorMap[clean] = color;

            metaMap[kStr] = meta;
            metaMap[kStr.toLowerCase()] = meta;
            metaMap[kStr.toUpperCase()] = meta;
            metaMap[clean] = meta;
          };

          // 1. Direct step id and variations (M1-S1, m1-s1, M1S1)
          registerKey(step.id);

          // 2. Formatted number-letter label (e.g. 1a, 2b, etc.)
          if (window.formatLabelText) {
            registerKey(window.formatLabelText(step.id, 'number-letter'));
            registerKey(window.formatLabelText(step.id, 'simplified'));
            registerKey(window.formatLabelText(step.id, 'step-only'));
          }

          // 3. Move number + step index aliases (1a, 1A, 1.1, etc.)
          if (mNum !== undefined && mNum !== null) {
            const letter = String.fromCharCode(97 + sIdx); // 'a', 'b', 'c', etc.
            registerKey(`${mNum}${letter}`);
            registerKey(`${mNum}.${sIdx + 1}`);
            registerKey(`M${mNum}-S${sIdx + 1}`);

            // From step_number if present
            if (step.step_number !== undefined) {
              registerKey(`${mNum}${String(step.step_number).toLowerCase()}`);
              registerKey(`${mNum}.${step.step_number}`);
            }

            // From step.id parsed number
            const sMatch = String(step.id).match(/[Ss](\d+)([A-Za-z]*)/);
            if (sMatch) {
              const sNum = parseInt(sMatch[1], 10);
              const subL = sMatch[2].toLowerCase();
              const sLetter = subL || ((sNum >= 1 && sNum <= 26) ? String.fromCharCode(96 + sNum) : String(sNum));
              registerKey(`${mNum}${sLetter}`);
              registerKey(`${mNum}.${sNum}`);
              registerKey(`M${mNum}-S${sNum}`);
            }
          }
        });
      });
    }

    // Default Other colors
    if (window.OTHER_COLORS) {
      for (const [k, c] of Object.entries(window.OTHER_COLORS)) {
        if (!colorMap[k]) colorMap[k] = customColors[k] || c;
      }
    }

    return { colorMap, metaMap };
  }

  /**
   * Render Move-Step chart to an SVG DOM element
   */
  function render(container, sequences, scheme, options = {}) {
    if (!container) return;
    container.innerHTML = '';

    if (!sequences || sequences.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <h3>No Sequence Data</h3>
          <p>Paste a list of rhetorical move-steps, upload a CSV/JSON file, or choose a demo dataset to visualize.</p>
        </div>
      `;
      return;
    }

    const {
      title = 'Move-Step Analysis',
      showTitle = true,
      legend = true,
      labellingScheme = 'number-letter',
      showLabels = true,
      normalizeWidth = false,
      fontSize = 11,
      cellHeight = 30,
      cellGap = 2,
      customColors = {},
      legendPositions = {},
      transparent = true,
      onCellClick = null,
      onCellHover = null,
      onLegendMoved = null
    } = options;

    const { colorMap, metaMap } = buildSchemeIndex(scheme, customColors);

    const numArticles = sequences.length;
    const maxUnits = Math.max(1, ...sequences.map(s => s.items.length));

    // Layout metrics - cells are square
    // Dynamically calculate leftMargin so long article IDs never clip off-screen
    let maxIdLen = 0;
    sequences.forEach(s => {
      const idStr = String(s.id || '');
      if (idStr.length > maxIdLen) maxIdLen = idStr.length;
    });
    const estIdPixelWidth = Math.ceil(maxIdLen * (Math.max(10, fontSize - 1) * 0.68));
    const leftMargin = Math.max(130, estIdPixelWidth + 30);
    const rightMargin = 30;
    const topMargin = showTitle ? 55 : 25;

    // Square cells: width === height
    const cellSize = cellHeight;
    const stepSize = cellSize + cellGap;
    const rowHeight = cellSize + Math.max(8, cellGap + 4);
    const gridWidth = maxUnits * stepSize;
    const targetWidth = gridWidth;

    // Pre-calculate tight, non-overlapping legend layout
    let legendHeight = 0;
    let legendColumns = [];
    let numLegendCols = 1;
    let numLegendRows = 1;
    let legendRowHeights = [];
    let colSlotWidths = [];
    let colXPositions = [];
    let legendTotalWidth = 0;
    const colGap = 16; // Tight, compact gap between Move columns

    if (legend && scheme && scheme.moves) {
      legendColumns = scheme.moves.map((move, mIdx) => {
        return {
          id: move.id || move.name || `move_${mIdx}`,
          moveName: move.name,
          steps: (move.steps || []).map(st => {
            const fmtId = window.formatLabelText(st.id, labellingScheme);
            const stepTitle = st.title || st.name.replace(/^[^:]+:\s*/, '');
            return {
              id: st.id,
              fmtId: fmtId,
              title: stepTitle,
              color: colorMap[st.id] || st.color || '#9ca3af',
              description: st.description || ''
            };
          })
        };
      });

      // Max 4 columns per row for clean readability
      numLegendCols = Math.min(legendColumns.length, 4);
      if (numLegendCols === 0) numLegendCols = 1;
      numLegendRows = Math.ceil(legendColumns.length / numLegendCols);

      // Compute exact width needed for each column slot based on its own items
      for (let c = 0; c < numLegendCols; c++) {
        let maxPixelWidth = 0;
        for (let r = 0; r < numLegendRows; r++) {
          const itemIdx = r * numLegendCols + c;
          if (itemIdx < legendColumns.length) {
            const col = legendColumns[itemIdx];
            // Header: ~6.2px per char in 10px bold font
            maxPixelWidth = Math.max(maxPixelWidth, col.moveName.length * 6.2 + 8);
            // Steps: 12px swatch + 6px gap = 18px + text (~5.5px per char in 8.5px font)
            col.steps.forEach(st => {
              const fullLabel = `${st.fmtId}: ${st.title}`;
              maxPixelWidth = Math.max(maxPixelWidth, fullLabel.length * 5.5 + 22);
            });
          }
        }
        colSlotWidths.push(Math.max(100, Math.ceil(maxPixelWidth)));
      }

      // Position each column starting at figure left margin (legendLeft = 24)
      const legendLeft = 24;
      colXPositions = [legendLeft];
      for (let c = 0; c < numLegendCols - 1; c++) {
        colXPositions.push(colXPositions[c] + colSlotWidths[c] + colGap);
      }
      legendTotalWidth = (colXPositions[numLegendCols - 1] + colSlotWidths[numLegendCols - 1]) - legendLeft;

      // Row heights with proper spacing for 20px step intervals and headers
      for (let r = 0; r < numLegendRows; r++) {
        let maxStepsInRow = 0;
        for (let c = 0; c < numLegendCols; c++) {
          const itemIdx = r * numLegendCols + c;
          if (itemIdx < legendColumns.length) {
            maxStepsInRow = Math.max(maxStepsInRow, legendColumns[itemIdx].steps.length);
          }
        }
        // Header (28px) + Steps (maxStepsInRow * 20px) + Row gap (18px)
        legendRowHeights.push(28 + maxStepsInRow * 20 + 18);
      }

      // 40px accounts for legend top offset (20px) and bottom breathing room (20px)
      legendHeight = legendRowHeights.reduce((sum, h) => sum + h, 0) + 40;
    }

    const legendLeft = 24;
    const chartHeight = topMargin + numArticles * rowHeight;
    let totalWidth = Math.max(leftMargin + gridWidth + rightMargin, legendLeft + legendTotalWidth + rightMargin);
    let totalHeight = chartHeight + (legend ? legendHeight : 30);

    // Expand totalWidth and totalHeight to contain any custom dragged legend blocks
    if (legendPositions && Object.keys(legendPositions).length > 0) {
      Object.entries(legendPositions).forEach(([mId, pos]) => {
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          totalWidth = Math.max(totalWidth, Math.ceil(pos.x + 240 + rightMargin));
          totalHeight = Math.max(totalHeight, Math.ceil(pos.y + 220 + 40));
        }
      });
    }

    // Create SVG namespace
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("xmlns", svgNS);
    svg.setAttribute("viewBox", `0 0 ${totalWidth} ${totalHeight}`);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.maxWidth = "100%";
    svg.style.maxHeight = "100%";
    svg.classList.add("movestep-svg");

    // Background rect (for solid white mode)
    if (!transparent) {
      const bgRect = document.createElementNS(svgNS, "rect");
      bgRect.setAttribute("class", "chart-background-rect");
      bgRect.setAttribute("x", "0");
      bgRect.setAttribute("y", "0");
      bgRect.setAttribute("width", `${totalWidth}`);
      bgRect.setAttribute("height", `${totalHeight}`);
      bgRect.setAttribute("fill", "#ffffff");
      svg.appendChild(bgRect);
    }

    // Title element
    if (showTitle) {
      const titleEl = document.createElementNS(svgNS, "text");
      titleEl.setAttribute("x", leftMargin);
      titleEl.setAttribute("y", 34);
      titleEl.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
      titleEl.setAttribute("font-size", `${fontSize + 5}px`);
      titleEl.setAttribute("font-weight", "700");
      titleEl.setAttribute("fill", "#0f172a");
      titleEl.textContent = title || 'Move-Step Analysis';
      svg.appendChild(titleEl);
    }

    // Snap guides layer
    const guidesGroup = document.createElementNS(svgNS, "g");
    guidesGroup.setAttribute("class", "snap-guides-group");
    svg.appendChild(guidesGroup);

    // Render Rows & Cells
    const gridGroup = document.createElementNS(svgNS, "g");
    gridGroup.setAttribute("class", "grid-group");

    sequences.forEach((seq, rowIdx) => {
      const rowY = topMargin + rowIdx * rowHeight;
      const seqLen = seq.items.length;

      // Row Label (Article ID)
      const labelEl = document.createElementNS(svgNS, "text");
      labelEl.setAttribute("x", leftMargin - 12);
      labelEl.setAttribute("y", rowY + cellSize / 2 + 4);
      labelEl.setAttribute("text-anchor", "end");
      labelEl.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
      labelEl.setAttribute("font-size", `${Math.max(10, fontSize - 1)}px`);
      labelEl.setAttribute("font-weight", "500");
      labelEl.setAttribute("fill", "#475569");
      labelEl.textContent = seq.id;
      gridGroup.appendChild(labelEl);

      if (seqLen === 0) return;

      // Square cell sizing
      let currentStepSize = stepSize;
      let cellW = cellSize;
      let cellH = cellSize;

      if (normalizeWidth) {
        currentStepSize = targetWidth / seqLen;
        cellW = Math.max(1, currentStepSize - cellGap);
        cellH = cellSize; // Maintain standard row height in normalized width mode
      }

      seq.items.forEach((item, colIdx) => {
        const rawLabel = item.label || '';
        const normKey = rawLabel.replace(/[-_\s]/g, '').toUpperCase();
        const color = colorMap[rawLabel] || colorMap[normKey] || colorMap[rawLabel.toLowerCase()] || '#9ca3af';
        const cellX = leftMargin + colIdx * currentStepSize;

        const cellGroup = document.createElementNS(svgNS, "g");
        cellGroup.setAttribute("class", "step-cell");
        cellGroup.style.cursor = "pointer";

        // Cell Square Rectangle
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", cellX);
        rect.setAttribute("y", rowY);
        rect.setAttribute("width", cellW);
        rect.setAttribute("height", cellH);
        rect.setAttribute("rx", Math.min(3, cellW / 6));
        rect.setAttribute("ry", Math.min(3, cellH / 6));
        rect.setAttribute("fill", color);
        rect.setAttribute("stroke", "#ffffff");
        rect.setAttribute("stroke-width", "1");
        cellGroup.appendChild(rect);

        // Cell Label Text
        if (showLabels) {
          const displayLabel = window.formatLabelText(rawLabel, labellingScheme);
          if (displayLabel && cellW >= 12) {
            const textColor = window.getContrastTextColor(color);
            const textEl = document.createElementNS(svgNS, "text");
            textEl.setAttribute("x", cellX + cellW / 2);
            textEl.setAttribute("y", rowY + cellH / 2 + 4);
            textEl.setAttribute("text-anchor", "middle");
            textEl.setAttribute("font-family", "system-ui, -apple-system, sans-serif");

            let effectiveFontSize = fontSize;
            const estTextW = displayLabel.length * (fontSize * 0.62);
            if (estTextW > cellW - 3) {
              effectiveFontSize = Math.max(6.5, Math.floor((cellW - 3) / (displayLabel.length * 0.62)));
            }
            textEl.setAttribute("font-size", `${effectiveFontSize}px`);
            textEl.setAttribute("font-weight", "600");
            textEl.setAttribute("fill", textColor);
            textEl.setAttribute("pointer-events", "none");
            textEl.textContent = displayLabel;
            cellGroup.appendChild(textEl);
          }
        }

        // Attach metadata for tooltips and inspection
        const meta = metaMap[rawLabel] || metaMap[normKey] || {
          moveName: 'Rhetorical Step',
          stepName: rawLabel,
          stepTitle: rawLabel,
          description: '',
          color: color
        };

        const cellData = {
          articleId: seq.id,
          unitIndex: colIdx + 1,
          totalUnits: seqLen,
          label: rawLabel,
          formattedLabel: window.formatLabelText(rawLabel, labellingScheme),
          text: item.text || '',
          color: color,
          meta: meta
        };

        cellGroup.addEventListener("mouseenter", (e) => {
          rect.setAttribute("stroke", "#0f172a");
          rect.setAttribute("stroke-width", "2");
          if (typeof onCellHover === 'function') {
            onCellHover(e, cellData);
          }
        });

        cellGroup.addEventListener("mouseleave", () => {
          rect.setAttribute("stroke", "#ffffff");
          rect.setAttribute("stroke-width", "1");
          if (typeof onCellHover === 'function') {
            onCellHover(null, null);
          }
        });

        cellGroup.addEventListener("click", () => {
          if (typeof onCellClick === 'function') {
            onCellClick(cellData);
          }
        });

        gridGroup.appendChild(cellGroup);
      });
    });

    svg.appendChild(gridGroup);

    // Render Hierarchical Legend - Aligned with Left of Whole Figure
    if (legend && legendColumns.length > 0) {
      const legendY = chartHeight + 10;

      // Full-width Divider Line (aligned with figure boundary)
      const divider = document.createElementNS(svgNS, "line");
      divider.setAttribute("x1", legendLeft);
      divider.setAttribute("y1", legendY);
      divider.setAttribute("x2", totalWidth - rightMargin);
      divider.setAttribute("y2", legendY);
      divider.setAttribute("stroke", "#cbd5e1");
      divider.setAttribute("stroke-width", "1");
      divider.setAttribute("stroke-dasharray", "3,3");
      svg.appendChild(divider);

      const legendGroup = document.createElementNS(svgNS, "g");
      legendGroup.setAttribute("class", "legend-group");

      const blockRegistry = [];

      legendColumns.forEach((col, idx) => {
        const colIdx = idx % numLegendCols;
        const rowIdx = Math.floor(idx / numLegendCols);

        let yOffset = 0;
        for (let r = 0; r < rowIdx; r++) {
          yOffset += legendRowHeights[r];
        }

        const defaultX = colXPositions[colIdx];
        const defaultY = legendY + 20 + yOffset;
        const moveWidth = colSlotWidths[colIdx] || 160;
        const moveHeight = 22 + col.steps.length * 20;

        // Use custom dragged position if available
        const pos = (legendPositions && legendPositions[col.id]) ? legendPositions[col.id] : { x: defaultX, y: defaultY };

        // Draggable Move Block Container
        const blockGroup = document.createElementNS(svgNS, "g");
        blockGroup.setAttribute("class", "legend-move-block");
        blockGroup.setAttribute("data-move-id", col.id);
        blockGroup.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);

        // Interactive background hit area for dragging
        const hitRect = document.createElementNS(svgNS, "rect");
        hitRect.setAttribute("class", "legend-block-bg");
        hitRect.setAttribute("x", -6);
        hitRect.setAttribute("y", -14);
        hitRect.setAttribute("width", moveWidth + 12);
        hitRect.setAttribute("height", moveHeight + 8);
        hitRect.setAttribute("rx", 6);
        hitRect.setAttribute("ry", 6);
        hitRect.setAttribute("fill", "transparent");
        hitRect.setAttribute("stroke", "transparent");
        blockGroup.appendChild(hitRect);

        // Move Header
        const headerText = document.createElementNS(svgNS, "text");
        headerText.setAttribute("x", 0);
        headerText.setAttribute("y", 0);
        headerText.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
        headerText.setAttribute("font-size", `${Math.max(10, fontSize)}px`);
        headerText.setAttribute("font-weight", "700");
        headerText.setAttribute("fill", "#1e293b");
        headerText.setAttribute("pointer-events", "none");
        headerText.textContent = col.moveName; // Full Move title, no cut-off

        const titleTip = document.createElementNS(svgNS, "title");
        titleTip.textContent = `${col.moveName}\n(Drag to reposition · Snaps to align)`;
        headerText.appendChild(titleTip);
        blockGroup.appendChild(headerText);

        // Step Swatches & Labels
        col.steps.forEach((st, sIdx) => {
          const itemY = 18 + sIdx * 20;

          // Color swatch
          const swatch = document.createElementNS(svgNS, "rect");
          swatch.setAttribute("x", 0);
          swatch.setAttribute("y", itemY - 10);
          swatch.setAttribute("width", 12);
          swatch.setAttribute("height", 12);
          swatch.setAttribute("rx", "2");
          swatch.setAttribute("fill", st.color);
          swatch.setAttribute("stroke", "#ffffff");
          swatch.setAttribute("stroke-width", "0.5");
          swatch.setAttribute("pointer-events", "none");
          blockGroup.appendChild(swatch);

          // Step label
          const stepText = document.createElementNS(svgNS, "text");
          stepText.setAttribute("x", 18);
          stepText.setAttribute("y", itemY);
          stepText.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
          stepText.setAttribute("font-size", `${Math.max(8.5, fontSize - 1.5)}px`);
          stepText.setAttribute("fill", "#475569");
          stepText.setAttribute("pointer-events", "none");

          const fullLabel = `${st.fmtId}: ${st.title}`;
          stepText.textContent = fullLabel; // Full Step label, no cut-off

          const titleTip = document.createElementNS(svgNS, "title");
          titleTip.textContent = `${fullLabel}\n${st.description || ''}`;
          stepText.appendChild(titleTip);

          blockGroup.appendChild(stepText);
        });

        legendGroup.appendChild(blockGroup);

        blockRegistry.push({
          id: col.id,
          element: blockGroup,
          width: moveWidth,
          height: moveHeight,
          currentPos: pos
        });
      });

      // Setup Drag and Snap for each Move block
      blockRegistry.forEach(blockObj => {
        setupDragAndSnap(
          svg,
          blockObj,
          blockRegistry,
          guidesGroup,
          legendLeft,
          colGap,
          totalWidth,
          totalHeight,
          onLegendMoved
        );
      });

      svg.appendChild(legendGroup);
    }

    container.appendChild(svg);
    return svg;
  }

  /**
   * Helper: Convert screen client coordinates to SVG viewport coordinates
   */
  function getSVGPoint(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : { x: clientX, y: clientY };
  }

  /**
   * Helper: Draw snap alignment guideline
   */
  function drawSnapGuide(guidesGroup, x1, y1, x2, y2) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("class", "snap-guide");
    line.setAttribute("stroke", "#2563eb");
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("stroke-dasharray", "4,4");
    line.setAttribute("pointer-events", "none");
    guidesGroup.appendChild(line);
  }

  /**
   * Drag-and-drop Move blocks with snap-to-align
   */
  function setupDragAndSnap(
    svg,
    blockObj,
    blockRegistry,
    guidesGroup,
    legendLeft,
    colGap,
    totalWidth,
    totalHeight,
    onLegendMoved
  ) {
    const el = blockObj.element;
    let isDragging = false;
    let startPointer = null;
    let startPos = { x: blockObj.currentPos.x, y: blockObj.currentPos.y };
    let currentPos = { ...startPos };

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // Left-click only
      e.preventDefault();
      e.stopPropagation();

      isDragging = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');

      startPointer = getSVGPoint(svg, e.clientX, e.clientY);
      startPos = { x: blockObj.currentPos.x, y: blockObj.currentPos.y };
      currentPos = { ...startPos };
    });

    el.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation();

      const currentPointer = getSVGPoint(svg, e.clientX, e.clientY);
      const dx = currentPointer.x - startPointer.x;
      const dy = currentPointer.y - startPointer.y;

      let targetX = startPos.x + dx;
      let targetY = startPos.y + dy;

      // Clear previous guidelines
      guidesGroup.innerHTML = '';
      const snapDist = 12; // 12px snap threshold

      const others = blockRegistry.filter(b => b.id !== blockObj.id);

      // 1. Snap to Left Margin
      if (Math.abs(targetX - legendLeft) < snapDist) {
        targetX = legendLeft;
        drawSnapGuide(guidesGroup, legendLeft, 0, legendLeft, totalHeight);
      }

      // 2. Vertical Snapping (match Y of other blocks)
      for (const other of others) {
        if (Math.abs(targetY - other.currentPos.y) < snapDist) {
          targetY = other.currentPos.y;
          drawSnapGuide(guidesGroup, 0, other.currentPos.y, totalWidth, other.currentPos.y);
          break;
        }
      }

      // 3. Horizontal Snapping to other blocks
      for (const other of others) {
        // Snap left-to-left
        if (Math.abs(targetX - other.currentPos.x) < snapDist) {
          targetX = other.currentPos.x;
          drawSnapGuide(guidesGroup, targetX, 0, targetX, totalHeight);
          break;
        }
        // Snap immediately next to other block (right of other + colGap)
        else if (Math.abs(targetX - (other.currentPos.x + other.width + colGap)) < snapDist) {
          targetX = other.currentPos.x + other.width + colGap;
          drawSnapGuide(guidesGroup, targetX, 0, targetX, totalHeight);
          break;
        }
        // Snap immediately before other block (left of other - width - colGap)
        else if (Math.abs((targetX + blockObj.width + colGap) - other.currentPos.x) < snapDist) {
          targetX = other.currentPos.x - blockObj.width - colGap;
          drawSnapGuide(guidesGroup, other.currentPos.x, 0, other.currentPos.x, totalHeight);
          break;
        }
      }

      currentPos = { x: targetX, y: targetY };
      blockObj.currentPos = currentPos;
      el.setAttribute('transform', `translate(${targetX}, ${targetY})`);

      // Dynamically expand SVG viewBox if block is dragged near or beyond edges
      const requiredW = Math.ceil(targetX + blockObj.width + 30);
      const requiredH = Math.ceil(targetY + blockObj.height + 40);
      const vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
      let newW = vb[2];
      let newH = vb[3];
      let vbChanged = false;
      if (requiredW > newW) {
        newW = requiredW;
        vbChanged = true;
      }
      if (requiredH > newH) {
        newH = requiredH;
        vbChanged = true;
      }
      if (vbChanged) {
        svg.setAttribute('viewBox', `0 0 ${newW} ${newH}`);
      }
    });

    const finishDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      el.classList.remove('is-dragging');
      guidesGroup.innerHTML = '';
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (err) {}

      // Ensure final bounds fit perfectly
      let maxBottom = 0;
      let maxRight = 0;
      blockRegistry.forEach(b => {
        maxRight = Math.max(maxRight, b.currentPos.x + b.width + 30);
        maxBottom = Math.max(maxBottom, b.currentPos.y + b.height + 40);
      });
      const vb = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
      const finalW = Math.max(vb[2], Math.ceil(maxRight));
      const finalH = Math.max(vb[3], Math.ceil(maxBottom));
      svg.setAttribute('viewBox', `0 0 ${finalW} ${finalH}`);

      if (typeof onLegendMoved === 'function') {
        onLegendMoved(blockObj.id, currentPos);
      }
    };

    el.addEventListener('pointerup', finishDrag);
    el.addEventListener('pointercancel', finishDrag);
  }

  /**
   * Helper to prepare clean standalone SVG for export (SVG, PNG, JPG, Copy)
   * Ensures exact pixel dimensions, full content bounds, and no cropping.
   */
  function prepareExportSVG(svgElement) {
    if (!svgElement) return null;

    const clone = svgElement.cloneNode(true);

    // CRITICAL: Strip any active canvas zoom and pan CSS transforms from the clone
    // This ensures that the user's interactive zoom/pan in the viewport NEVER crops the exported file!
    clone.style.transform = 'none';
    clone.style.transformOrigin = '0 0';
    clone.style.transition = 'none';
    clone.removeAttribute('transform');
    clone.classList.remove('can-pan', 'is-panning');

    // Remove temporary snap guidelines from export
    const guides = clone.querySelector('.snap-guides-group');
    if (guides) guides.innerHTML = '';

    let vbWidth = 800;
    let vbHeight = 400;

    const vbAttr = svgElement.getAttribute('viewBox');
    if (vbAttr) {
      const parts = vbAttr.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4) {
        vbWidth = Math.max(vbWidth, parts[2]);
        vbHeight = Math.max(vbHeight, parts[3]);
      }
    }

    // Comprehensive scan: inspect all grid cells to guarantee full bottom and right boundaries
    const cellRects = clone.querySelectorAll('.step-cell rect');
    cellRects.forEach(r => {
      const rx = parseFloat(r.getAttribute('x')) || 0;
      const ry = parseFloat(r.getAttribute('y')) || 0;
      const rw = parseFloat(r.getAttribute('width')) || 0;
      const rh = parseFloat(r.getAttribute('height')) || 0;
      vbWidth = Math.max(vbWidth, Math.ceil(rx + rw + 30));
      vbHeight = Math.max(vbHeight, Math.ceil(ry + rh + 30));
    });

    // Inspect all legend blocks to guarantee bottom and right boundaries
    const blocks = clone.querySelectorAll('.legend-move-block');
    blocks.forEach(blk => {
      const transform = blk.getAttribute('transform');
      if (transform) {
        const m = transform.match(/translate\(([^,\s]+)[,\s]+([^)]+)\)/);
        if (m) {
          const bx = parseFloat(m[1]);
          const by = parseFloat(m[2]);
          const bg = blk.querySelector('.legend-block-bg');
          const bw = bg ? parseFloat(bg.getAttribute('width')) || 180 : 180;
          const bh = bg ? parseFloat(bg.getAttribute('height')) || 120 : 120;
          vbWidth = Math.max(vbWidth, Math.ceil(bx + bw + 40));
          vbHeight = Math.max(vbHeight, Math.ceil(by + bh + 45));
        }
      }
    });

    // Inspect divider line if present
    const divider = clone.querySelector('line[stroke-dasharray]');
    if (divider) {
      const x2 = parseFloat(divider.getAttribute('x2')) || 0;
      const y2 = parseFloat(divider.getAttribute('y2')) || 0;
      vbWidth = Math.max(vbWidth, Math.ceil(x2 + 30));
      vbHeight = Math.max(vbHeight, Math.ceil(y2 + 30));
    }

    // Inspect row label texts
    const texts = clone.querySelectorAll('.grid-group text');
    texts.forEach(t => {
      const ty = parseFloat(t.getAttribute('y')) || 0;
      vbHeight = Math.max(vbHeight, Math.ceil(ty + 25));
    });

    // Resize background rect ONLY if an explicit .chart-background-rect element exists
    const bgRect = clone.querySelector('.chart-background-rect');
    if (bgRect) {
      bgRect.setAttribute('x', '0');
      bgRect.setAttribute('y', '0');
      bgRect.setAttribute('width', `${vbWidth}`);
      bgRect.setAttribute('height', `${vbHeight}`);
      bgRect.setAttribute('fill', '#ffffff');
    }

    // Crucial: Set explicit pixel width and height so Image/Canvas never defaults or clips
    clone.setAttribute('viewBox', `0 0 ${vbWidth} ${vbHeight}`);
    clone.setAttribute('width', `${vbWidth}`);
    clone.setAttribute('height', `${vbHeight}`);
    clone.style.width = `${vbWidth}px`;
    clone.style.height = `${vbHeight}px`;
    clone.style.maxWidth = 'none';
    clone.style.maxHeight = 'none';

    return { clone, width: vbWidth, height: vbHeight };
  }

  /**
   * Export current SVG to file download
   */
  function exportSVG(svgElement, filename = 'movestep_viz.svg') {
    if (!svgElement) return;

    const prep = prepareExportSVG(svgElement);
    if (!prep) return;

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(prep.clone);

    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Export to raster PNG or JPG via HTML5 Canvas
   */
  function exportRaster(svgElement, filename = 'movestep_viz.png', format = 'image/png', transparent = true) {
    if (!svgElement) return;

    const prep = prepareExportSVG(svgElement);
    if (!prep) return;

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(prep.clone);
    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = function() {
      // Safe high-resolution scale (up to 2x) avoiding browser canvas max dimension / memory limits
      let scale = 2;
      const maxDim = Math.max(prep.width, prep.height);
      if (maxDim * scale > 8192) {
        scale = Math.max(1, 8192 / maxDim);
      }
      const totalPixels = (prep.width * scale) * (prep.height * scale);
      if (totalPixels > 24000000) {
        scale = Math.max(1, Math.sqrt(24000000 / (prep.width * prep.height)));
      }
      const width = Math.round(prep.width * scale);
      const height = Math.round(prep.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!transparent || format === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      const mimeType = format === 'image/jpeg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mimeType, 0.95);

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      // Fallback: trigger clean SVG export if canvas rasterization failed
      exportSVG(svgElement, filename.replace(/\.(png|jpg|jpeg)$/i, '.svg'));
    };
    img.src = url;
  }

  /**
   * Copy SVG code to user clipboard
   */
  async function copySVG(svgElement) {
    if (!svgElement) return false;

    const prep = prepareExportSVG(svgElement);
    if (!prep) return false;

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(prep.clone);
    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    try {
      await navigator.clipboard.writeText(source);
      return true;
    } catch (e) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = source;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    }
  }

  return {
    render,
    buildSchemeIndex,
    exportSVG,
    exportRaster,
    copySVG
  };
})();
