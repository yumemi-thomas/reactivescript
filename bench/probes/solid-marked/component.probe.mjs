export const scene = (lib, h) => {
  const kid = name => h.component(name, p => p.children);
  return () => h.s.createComponent(lib.default, { builtins: { Root: kid("Root"), Heading: kid("Heading"), Paragraph: kid("Paragraph"), Strong: kid("Strong") }, children: "# A\n\nwritten in **markdown**" });
};
