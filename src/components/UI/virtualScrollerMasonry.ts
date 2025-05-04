import type { CollectionElement } from "@/lib/types";
import { createWritable } from "@/lib/utils";
import { writable, type Readable, type Writable, derived } from "svelte/store";

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

  type Layout = {
    top: number;
    left: number;
    width: number;
    height: number;
    element: CollectionElement;
  };

  type Layouts = Layout[][];

  const buffer = 5;

  // beamWidth を調整することで探索幅を制御
  const beamWidth = 5;

  // greedy playout で最終的な高さを評価する関数
  function evaluateGreedy(layouts: Layouts, remaining: CollectionElement[], itemWidth: number) {
    // 深いコピー
    const cols = layouts.map(col => [...col]);
    const gaps = itemGap;
    // playout
    for (const ele of remaining) {
      const h = ele.thumbnailWidth && ele.thumbnailHeight
        ? Math.floor((itemWidth / ele.thumbnailWidth) * ele.thumbnailHeight)
        : placeholderHeight;
      // 各列の底部
      const bottoms = cols.map(col => {
        if (col.length === 0) return 0;
        const last = col[col.length - 1];
        return last.top + last.height;
      });
      const idx = bottoms.indexOf(Math.min(...bottoms));
      const top = bottoms[idx] + gaps;
      cols[idx].push({ top, left: 0, width: itemWidth, height: h, element: ele });
    }
    // 最大高さを返す
    const finalBottoms = cols.map(col => {
      if (col.length === 0) return 0;
      const last = col[col.length - 1];
      return last.top + last.height;
    });
    return Math.max(...finalBottoms);
  }

  type Beam = {
    layouts: Layouts;
    score: number;
  };

  // calculateLayouts をビームサーチに拡張
  const calculateLayouts = (
    elements: CollectionElement[],
    containerWidth: number
  ): Layouts => {
    if (!containerWidth) return [];
    const itemNumPerRow = Math.floor((containerWidth + itemGap) / (minItemWidth + itemGap));
    const itemWidth = Math.floor((containerWidth - itemGap * (itemNumPerRow - 1)) / itemNumPerRow);

    // 初期ビーム: 空のレイアウト
    let beams: Beam[] = [{ layouts: Array(itemNumPerRow).fill(0).map(() => []), score: 0 }];

    // 各要素を順に探索
    elements.forEach((ele, idx) => {
      const newBeams: Beam[] = [];
      // 要素の高さ計算
      const height = ele.thumbnailWidth && ele.thumbnailHeight
        ? Math.floor((itemWidth / ele.thumbnailWidth) * ele.thumbnailHeight)
        : placeholderHeight;
      beams.forEach(beam => {
        beam.layouts.forEach((col, colIdx) => {
          // レイアウト複製
          const cloneLayouts = beam.layouts.map(c => [...c]);
          const bottoms = cloneLayouts.map(c => c.length === 0 ? 0 : c[c.length - 1].top + c[c.length - 1].height);
          const topPos = bottoms[colIdx] + (cloneLayouts[colIdx].length > 0 ? itemGap : 0);
          cloneLayouts[colIdx].push({
            top: topPos,
            left: colIdx * (itemWidth + itemGap),
            width: itemWidth,
            height,
            element: ele,
          });
          // 評価関数: 残り要素を greedy playout して最終高さを得る
          const remaining = elements.slice(idx + 1);
          const score = evaluateGreedy(cloneLayouts, remaining, itemWidth);
          newBeams.push({ layouts: cloneLayouts, score });
        });
      });
      // 最良 beamWidth 個を残す
      newBeams.sort((a, b) => a.score - b.score);
      beams = newBeams.slice(0, beamWidth);
    });

    // 最良ビームを返す
    return beams[0].layouts;
  };

  const layouts = derived<[typeof elements, typeof contentsWidth], Layouts>(
    [elements, contentsWidth],
    ([$elements, $contentsWidth], set) => {
      set(calculateLayouts($elements, $contentsWidth));
    }
  );

  layouts.subscribe(v => {
    setVirtualHeight(
      Math.max(
        ...v.map(col => {
          const last = col[col.length - 1];
          return last.top + last.height;
        })
      )
    );
  });

  const calculateVisibleLayouts = (
    layouts: Layouts,
    scrollTop: number,
    contentsHeight: number
  ): Layout[] => {
    const visible: Layout[] = [];
    layouts.forEach(col => {
      const first = col.findIndex(x => x.top + x.height >= scrollTop);
      let last = col.findIndex(x => x.top >= scrollTop + contentsHeight);
      if (last === -1) last = col.length - 1;
      const start = Math.max(first - buffer, 0);
      const end = Math.min(last + buffer, col.length - 1);
      visible.push(...col.slice(start, end + 1));
    });
    return visible;
  };

  const visibleLayouts = derived<[typeof layouts, typeof contentsScrollY, typeof containerHeight], Layout[]>(
    [layouts, contentsScrollY, containerHeight] as const,
    ([$layouts, $contentsScrollY, $masonryContainerHeight], set) => {
      set(calculateVisibleLayouts($layouts, $contentsScrollY, $masonryContainerHeight));
    }
  );

  return { visibleLayouts };
};
