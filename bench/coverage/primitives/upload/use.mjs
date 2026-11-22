import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/upload", title: "a file picker: the library's own object, its accessors called", ssr: /0 files/, dom: async (h, page) => {
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.click("button")]);
    await chooser.setFiles({ name: "a.png", mimeType: "image/png", buffer: Buffer.from("png") });
    h.check("the chosen file is listed", await h.until(async () => /1 files/.test(await h.text(page))), await h.text(page));
  } });
