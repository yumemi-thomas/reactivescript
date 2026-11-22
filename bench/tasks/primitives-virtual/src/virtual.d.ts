import type { VirtualItem } from "@tanstack/virtual-core";
export declare function createVirtualizer(options: () => { count: number; getScrollElement: () => Element | null | undefined; estimateSize: (index: number) => number }): { items: () => VirtualItem[]; totalSize: () => number; scrollToIndex: (index: number) => void };
