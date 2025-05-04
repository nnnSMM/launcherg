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

  // 各セルのレイアウト情報
  type Cell = {
    top: number;
    left: number;
    width: number;
    height: number;
    element: CollectionElement;
  };
  // Layout は列の配列を並べた 2 次元配列
  type Layout = Cell[][];

  const buffer = 5;
  const beamWidth = 3;

  /**
   * グリーディー法で残り要素を配置し、最終コンテナ高さを評価
   */
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
      // 各列の現在の底部
      const bottoms = cols.map(col =>
        col.length > 0
          ? col[col.length - 1].top + col[col.length - 1].height
          : 0
      );
      const idx = bottoms.indexOf(Math.min(...bottoms));
      const top = (cols[idx].length > 0 ? bottoms[idx] + itemGap : 0);
      cols[idx].push({ top, left: idx * (itemWidth + itemGap), width: itemWidth, height: h, element: ele });
    }
    // 列ごとの高さを計算し最大を返す
    return Math.max(
      ...cols.map(col =>
        col.length > 0 ? col[col.length - 1].top + col[col.length - 1].height : 0
      )
    );
  }

  /**
   * ビームサーチで最適レイアウトを探索
   */
  const calculateLayouts = (
    elements: CollectionElement[],
    containerWidth: number
  ): Layout => {
    if (!containerWidth || elements.length === 0) return [];
    const itemNumPerRow = Math.floor((containerWidth + itemGap) / (minItemWidth + itemGap));
    const itemWidth = Math.floor((containerWidth - itemGap * (itemNumPerRow - 1)) / itemNumPerRow);

    // 初期ビーム: 空の列を itemNumPerRow 個
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
          const top = (baseLayout[colIdx].length > 0 ? bottoms[colIdx] + itemGap : 0);
          baseLayout[colIdx].push({ top, left: colIdx * (itemWidth + itemGap), width: itemWidth, height: h, element: ele });

          const remaining = elements.slice(idx + 1);
          const score = evaluateGreedy(baseLayout, remaining, itemWidth);
          newBeams.push({ layout: baseLayout, score });
        }
      });

      // スコア昇順でソートし、上位 beamWidth 件を残す
      newBeams.sort((a, b) => a.score - b.score);
      beams = newBeams.slice(0, beamWidth);
    });

    // 最良ビームのレイアウトを返却
    return beams[0].layout;
  };

  // 全レイアウトを計算し store に持たせる
  const layouts = derived<
    [typeof elements, typeof contentsWidth],
    Layout
  >(
    [elements, contentsWidth],
    ([$elements, $contentsWidth], set) => {
      set(calculateLayouts($elements, $contentsWidth));
    }
  );

  // 仮想領域の高さを更新 (空列は高さ0 とする)
  layouts.subscribe(cols => {
    const heights = cols.map(col =>
      col.length > 0 ? col[col.length - 1].top + col[col.length - 1].height : 0
    );
    setVirtualHeight(Math.max(...heights));
  });

  /**
   * 可視領域のレイアウトを返却
   */
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
