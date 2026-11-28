export const scene = (lib, h) => {
  const Cell = h.component("Cell");
  const App = () => {
    const table = lib.createTable(() => ({ data: [{ a: 1 }], columns: [{ id: "a", accessorFn: r => r.a, cell: Cell }], getCoreRowModel: lib.getCoreRowModel() }));
    return h.s.createComponent(lib.FlexRender, { cell: table.getRowModel().rows[0].getVisibleCells()[0] });
  };
  return () => h.s.createComponent(App, {});
};
