# tree-sitter-rx

A [tree-sitter](https://tree-sitter.github.io) grammar for `.rx` (and `.d.rx`),
for editors that highlight and navigate with tree-sitter: Zed (`../zed-rx`),
Neovim, Helix. It is not the language: `compiler/src/parse.rs` is, and this
grammar follows it. Where the two disagree, `parse.rs` is right and this is a
bug.

`grammar.js` extends tree-sitter-typescript's TSX grammar
(`grammar(tsx, { … })`, as TypeScript's extends JavaScript's). Expressions,
types and JSX keep TSX's node names, so a TSX query applies to them unchanged.
What `.rx` adds has nodes of its own:

| | nodes |
| --- | --- |
| module | `import_statement` (`side`, `pure`, `fails_clause`), `export_statement` |
| declarations | `source_declaration`, `equation`, `key_clause`, `fn_declaration` (`fn_body`), `fn_signature` (`.d.rx`, `rejects_clause`), `server_function_declaration`, `action_declaration`, `component_declaration`, `effect_declaration`, `error_declaration`, `context_declaration`, `provide_declaration` |
| markup | `view_block` (a reactive block: declarations, then markup), `if_block`, `else_block`, `for_block`, `loading_block`, `errored_block`, `portal_block`, `style_element` (`raw_text`) |
| statements | `write_statement` (`x := e`), `guess_statement`, `refresh_statement`, `affects_statement`, `action_statement` |
| expressions | `pending_expression`, `latest_expression`, `peek_expression`, `pre_expression`, `use_expression`, `throw_expression`, `catch_expression`, `draft_expression`, `fn_expression`, `server_fn_expression`; `await_expression` has `initial` (`-> v`) |

A declaration's name is its `name` field, its right side `value`, a block
`body`; a write's target is `target`. Imperative code (handlers, `action` and
`effect` bodies) is TSX's `statement_block`. TSX's assignment expressions are
gone: a statement-level `x = e` is an `equation`.

`src/scanner.c` is tree-sitter-typescript's external scanner with the changes
`.rx` needs, each marked `rx:`: a newline ends a statement before `<`, `(`, `[`
and a template (`parse.rs` reads none of them across a line) but not before
`catch`; on one line, a write (`a := 1 b := 2`) starts a new statement, as
`parse.rs` reads statements back to back; and a `<style>`'s CSS is raw text up
to `</style>`.

## Regenerating and testing

```sh
pnpm install
pnpm run generate          # src/parser.c, src/grammar.json, src/node-types.json
pnpm test                  # test/corpus
pnpm run parse:repo        # every tracked .rx file; none should have an ERROR or MISSING node
pnpm run query -- ../../examples/todos.rx
```

`src/` is generated but committed: Zed compiles `src/parser.c` and
`src/scanner.c` as they are. Regenerate after changing `grammar.js`, and
commit the result with it.

## Queries

`queries/highlights.scm` is tree-sitter-javascript's `highlights.scm` and
`highlights-jsx.scm` and tree-sitter-typescript's `highlights.scm`, then the
`.rx` patterns. Patterns are ordered general first, specific last: a later
pattern wins, as in Zed and Neovim. Helix (and `tree-sitter highlight`) take
the first match, so Helix needs the order reversed. `queries/injections.scm`
parses a `<style>`'s content as CSS.
