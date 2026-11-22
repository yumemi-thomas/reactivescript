// A TanStack Table with pagination buttons and cell components (RFC 17, 09 MO-11l). The table handed to a pagination
// component of the app's own is part of the good program: it is shadcn/ui's `<DataTablePagination table={table} />`.
export default {
  title: "TanStack Table: cell components, pagination, a pager component, the table handed to a child",
  types: [
    { name: "a cell's context is the library's: the row is a Person", edit: ["{props.row.original.age} years", "{props.row.original.aeg} years"], expect: /TS2339|TS2551/ },
    { name: "a row's id is a string, as the callback's parameter is", edit: ["props.onPick(row.id)", "props.onPick(row.index)"], expect: /TS2345/ },
    { name: "the table is the library's Table: a method it has not is refused", edit: ["table.previousPage()", "table.prevPage()"], expect: /TS2339|TS2551/ },
    { name: "the table keeps its type in the child it is handed to", edit: ["props.table.setPageIndex(0)", "props.table.setPageIndex(\"0\")"], expect: /TS2345/ },
    { name: "what the table answers keeps its type: the page count is a number", edit: ["pages={table.getPageCount()}", "pages={table.getPageCount().length}"], expect: /TS2339/ },
    { name: "a column's options are the library's", edit: ['{ accessorKey: "age", header: "Age", cell: AgeCell }', '{ accessorKey: "age", header: 5, cell: AgeCell }'], expect: /TS2322|TS2769|TS2345/ },
  ],
  bad: [
    { name: "a row of the table handed up through a prop's callback", edit: ["<tr class=\"row\" onClick={() => { props.onPick(row.id) }}>{for cell in row.getVisibleCells() {", "<tr class=\"row\" onClick={() => { props.onPick(row) }}>{for cell in row.getVisibleCells() {"], expect: "RENDERS_ESCAPES" },
    { name: "the table kept in app state", edit: ["onClick={() => { people := ps => [...ps, { name: \"Di\", age: 52 }, { name: \"Ed\", age: 19 }] }}", "onClick={() => { people := [table] }}"], expect: "RENDERS_ESCAPES" },
    { name: "a cell component's context provided nowhere above the table", edit: ['  provide accent = "dark"\n', ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "a page turned while the view computes (the handler called, not passed)", edit: ["onNext={() => { table.nextPage() }} />", "onNext={table.nextPage()} />"], expect: "IO_IN_REACTIVE" },
    { name: "the table made from data read once: it would not follow the source", edit: ["createTable(ref options", "createTable(options"], file: "table.d.rx", expect: "SNAPSHOT_ARGUMENT" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("the first page: headers, and cells rendered by the cell components with the context above the table", await h.until(async () => /Name\s*Age\s*Ann\s*31 years\s*Bo\s*44 years.*page 1 of 2/.test(await h.text(page))) && await page.locator("strong.dark").count() === 2, await h.text(page));
    await page.click(".next");
    h.check("next: the second page, through the pager's handler", await h.until(async () => /Cy\s*27 years.*page 2 of 2/.test(await h.text(page)) && !/Ann/.test(await h.text(page))), await h.text(page));
    h.check("the pager's props follow the table (next is disabled on the last page)", await page.locator(".next").isDisabled(), "enabled");
    await page.click(".add");
    h.check("the table follows the source it was made from (five rows: three pages, back on the first)", await h.until(async () => /Ann.*page 1 of 3/.test(await h.text(page))), await h.text(page));
    await page.click(".next"); await page.click(".next");
    h.check("the last page holds the row that was added", await h.until(async () => /Ed\s*19 years.*page 3 of 3/.test(await h.text(page))), await h.text(page));
    await page.click(".row");
    h.check("a row's id, handed up through the prop's callback", await h.until(async () => /picked row \d/.test(await h.text(page))), await h.text(page));
    await page.click(".prev");
    h.check("prev", await h.until(async () => /Cy.*page 2 of 3/.test(await h.text(page))), await h.text(page));
    h.check("the pagination component given the table itself (shadcn's DataTablePagination) follows it", await h.until(async () => /3 pages in all/.test(await h.text(page))), await h.text(page));
    await page.click(".first");
    h.check("…and turns its pages from its own handler", await h.until(async () => /Ann.*page 1 of 3/.test(await h.text(page))) && await page.locator(".first").isDisabled(), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
