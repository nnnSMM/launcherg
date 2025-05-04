import type { CollectionElement } from "@/lib/types";
import { writable, type Readable, derived } from "svelte/store";

export const useVirtualScrollerMasonry = (
  elements: Readable<CollectionElement[]>,
  setVirtualHeight: (v: number) => void,
  contentsWidth: Readable<number>,
  contentsScrollY: Readable<number>,
  containerHeight: Readable<number>
) => {
  const minItemWidth = 16 * 16;
  const itemGap = 16;
  const placeholderHeight = 16 * 8;

  type Cell = {
    top: number;
    left: number;
    width: number;
    height: number;
    element: CollectionElement;
  };
  type Layout = Cell[][];

  const buffer = 5;
  const beamWidth = 5;

  function evaluateGreedy(
    base: Layout,
    remaining: CollectionElement[],
    itemWidth: number
  ): number {
    const cols = base.map(col => col.slice());
    for (const ele of remaining) {
      const h = ele.thumbnailWidth && ele.thumbnailHeight
        ? Math.floor((itemWidth / ele.thumbnailWidth) * ele.thumbnailHeight)
        : placeholderHeight;
      const bottoms = cols.map(col =>
        col.length > 0
          ? col[col.length - 1].top + col[col.length - 1].height
          : 0
      );
      const idx = bottoms.indexOf(Math.min(...bottoms));
      const top = cols[idx].length > 0 ? bottoms[idx] + itemGap : 0;
      cols[idx].push({ top, left: idx * (itemWidth + itemGap), width: itemWidth, height: h, element: ele });
    }
    return Math.max(
      ...cols.map(col =>
        col.length > 0 ? col[col.length - 1].top + col[col.length - 1].height : 0
      )
    );
  }

  const calculateLayouts = (
    elements: CollectionElement[],
    containerWidth: number
  ): { layout: Layout; columns: number; itemWidth: number } => {
    if (!containerWidth || elements.length === 0) return { layout: [], columns: 0, itemWidth: 0 };
    const itemNumPerRow = Math.floor((containerWidth + itemGap) / (minItemWidth + itemGap));
    const itemWidth = Math.floor((containerWidth - itemGap * (itemNumPerRow - 1)) / itemNumPerRow);

    let beams: { layout: Layout; score: number }[] = [
      { layout: Array.from({ length: itemNumPerRow }, () => []), score: 0 }
    ];

    elements.forEach((ele, idx) => {
      const newBeams: typeof beams = [];
      const h = ele.thumbnailWidth && ele.thumbnailHeight
        ? Math.floor((itemWidth / ele.thumbnailWidth) * ele.thumbnailHeight)
        : placeholderHeight;

      beams.forEach(beam => {
        for (let colIdx = 0; colIdx < beam.layout.length; colIdx++) {
          const baseLayout = beam.layout.map(col => col.slice());
          const bottoms = baseLayout.map(col =>
            col.length > 0
              ? col[col.length - 1].top + col[col.length - 1].height
              : 0
          );
          const top = baseLayout[colIdx].length > 0 ? bottoms[colIdx] + itemGap : 0;
          baseLayout[colIdx].push({ top, left: colIdx * (itemWidth + itemGap), width: itemWidth, height: h, element: ele });

          const remaining = elements.slice(idx + 1);
          const score = evaluateGreedy(baseLayout, remaining, itemWidth);
          newBeams.push({ layout: baseLayout, score });
        }
      });

      newBeams.sort((a, b) => a.score - b.score);
      beams = newBeams.slice(0, beamWidth);
    });

    return { layout: beams[0].layout, columns: itemNumPerRow, itemWidth };
  };

  let prevColumns = 0;
  let prevLayout: Layout = [];
  let prevItemWidth = 0;

  const layouts = derived<
    [typeof elements, typeof contentsWidth],
    Layout
  >(
    [elements, contentsWidth],
    ([$elements, $contentsWidth], set) => {
      const { layout, columns, itemWidth } = calculateLayouts($elements, $contentsWidth);
      if (columns !== prevColumns) {
        // 列数が変わったら全レイアウトを新規計算
        prevColumns = columns;
        prevLayout = layout;
        prevItemWidth = itemWidth;
        set(layout);
      } else {
        // 列数同じなら配置順は維持しつつサイズのみ更新
        const newLayout: Layout = prevLayout.map((col, colIdx) => {
          let currentTop = 0;
          return col.map((cell) => {
            const h = cell.element.thumbnailWidth && cell.element.thumbnailHeight
              ? Math.floor((itemWidth / cell.element.thumbnailWidth) * cell.element.thumbnailHeight)
              : placeholderHeight;
            const top = currentTop;
            const updated: Cell = {
              top,
              left: colIdx * (itemWidth + itemGap),
              width: itemWidth,
              height: h,
              element: cell.element,
            };
            currentTop = top + h + itemGap;
            return updated;
          });
        });
        prevLayout = newLayout;
        prevItemWidth = itemWidth;
        set(newLayout);
      }
    }
  );

  layouts.subscribe(cols => {
    const heights = cols.map(col =>
      col.length > 0 ? col[col.length - 1].top + col[col.length - 1].height : 0
    );
    setVirtualHeight(Math.max(...heights));
  });

  const calculateVisibleLayouts = (
    cols: Layout,
    scrollTop: number,
    contentsHeight: number
  ) => {
    const visible: Cell[] = [];
    cols.forEach(col => {
      const first = col.findIndex(cell => cell.top + cell.height >= scrollTop);
      let last = col.findIndex(cell => cell.top >= scrollTop + contentsHeight);
      if (first === -1) return;
      if (last === -1) last = col.length - 1;
      const start = Math.max(first - buffer, 0);
      const end = Math.min(last + buffer, col.length - 1);
      visible.push(...col.slice(start, end + 1));
    });
    return visible;
  };

  const visibleLayouts = derived<
    [typeof layouts, typeof contentsScrollY, typeof containerHeight],
    Cell[]
  >(
    [layouts, contentsScrollY, containerHeight],
    ([$layouts, $contentsScrollY, $masonryContainerHeight], set) => {
      set(calculateVisibleLayouts($layouts, $contentsScrollY, $masonryContainerHeight));
    }
  );

  return { visibleLayouts };
};
