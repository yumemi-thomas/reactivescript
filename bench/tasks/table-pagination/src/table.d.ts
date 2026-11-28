import type { Cell, Header, RowData, Table, TableOptions } from "@tanstack/table-core";
import type { JSX } from "@solidjs/web";
export { getCoreRowModel, getPaginationRowModel } from "@tanstack/table-core";
export type { CellContext, ColumnDef, Table } from "@tanstack/table-core";
export declare function createTable<T extends RowData>(options: () => Omit<TableOptions<T>, "state" | "onStateChange" | "renderFallbackValue">): Table<T>;
export declare function FlexRender<T extends RowData>(props: { cell?: Cell<T, unknown>; header?: Header<T, unknown> }): JSX.Element;
