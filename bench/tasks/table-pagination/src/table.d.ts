import type { RowData, Table, TableOptions } from "@tanstack/table-core";
import type { JSX } from "@solidjs/web";
export { getCoreRowModel, getPaginationRowModel } from "@tanstack/table-core";
export type { CellContext, ColumnDef, Table } from "@tanstack/table-core";
export declare function createTable<T extends RowData>(options: () => Omit<TableOptions<T>, "state" | "onStateChange" | "renderFallbackValue">): Table<T>;
export declare function flexRender<P>(comp: ((props: P) => JSX.Element) | JSX.Element | undefined, props: P): JSX.Element;
