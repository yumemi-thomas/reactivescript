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
| declarations | `source_declaration`, `equation`, `key_clause`, `fn_declaration` (`fn_body`), `fn_signature` (`.d.rx`: `rejects_clause`, `row_word`, `uses_clause`, `provides_clause`, `nests_clause`, `joins_clause`), `component_signature` (`member_component_name`, `fails_row`, `shape_clause`), `const_signature`, `server_function_declaration`, `action_declaration`, `component_declaration`, `effect_declaration`, `error_declaration`, `context_declaration`, `provide_declaration` |
| markup | `view_block` (a reactive block: declarations, then markup), `if_block`, `else_block`, `for_block`, `loading_block`, `errored_block`, `portal_block`, `render_block` (`view (item) { … }`), `style_element` (`raw_text`) |
| statements | `write_statement` (`x := e`), `guess_statement`, `refresh_statement`, `affects_statement`, `action_statement` |
| a printed signature (`.d.rx` whose first line is `//@ signature …`, 09 MO-13a) | `signature_pragma`, then `signature_export` rows: `signature_type`, `signature_error`, `signature_action`, `signature_source` (`operator`: `=` a question, `:=` a plain source), `signature_equation`, `signature_context`, `signature_fn` (`signature_parameter`, `signature_rows`), `signature_component` (`signature_prop`, `signature_catches`, `signature_provides`, `signature_takes`, `signature_uses`, `signature_retains`, `signature_keeps`, `signature_shape`), `context_key` (`./ui.rx#who`) |
| types (`.d.rx`) | `ref_type`, `callback_type` (`handler`), `row_type` (`pending`, `fails(…)`: before a `ref` part of a result, 09 MO-10l, or a field of an `.rx` prop's type), `catches_type`, `import_type` (`import("m").T<A>`); a parameter's `ref_modifier`, `draft_modifier` |
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
