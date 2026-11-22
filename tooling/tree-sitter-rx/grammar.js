/**
 * @file ReactiveScript (.rx) grammar for tree-sitter
 * @license MIT
 *
 * TSX's grammar (tree-sitter-typescript), with the forms .rx adds (spec/07-surface.md). The parser this follows is
 * compiler/src/parse.rs. Expressions, types and JSX keep TSX's node names, so TSX queries apply to them.
 *
 * A file is imports, declarations and markup. A reactive block (a component's body, an `if`/`for`/`loading`/
 * `errored`/`portal` body) is a `view_block`: declarations, then markup. Imperative code (handlers, `action` and
 * `effect` bodies) is TSX's `statement_block`, with writes (`x := e`), `guess`, `refresh`, `affects` and an inline
 * `action { … }` added to its statements.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const tsx = require('tree-sitter-typescript/tsx/grammar');

module.exports = grammar(tsx, {
  name: 'rx',

  // appended after TSX's externals: src/scanner.c's TokenType lists them in this order
  externals: ($, previous) => previous.concat([
    $._style_text,
  ]),

  precedences: ($, previous) => previous.concat([
    ['ternary', 'catch', $.arrow_function],
    ['unary_void', 'catch'],
  ]),

  conflicts: ($, previous) => previous.concat([
    // as TSX does for `await`: `<` after a prefix form's operand is a comparison or type arguments
    ...['throw_expression', 'pending_expression', 'latest_expression', 'peek_expression', 'pre_expression']
      .map((name) => [$.call_expression, $.instantiation_expression, $.binary_expression, $[name]]),
    [$.object, $._property_name],
    // `keyof import("pkg").T[]`: as TSX's `keyof` takes the whole primary type, `keyof (T[])`
    [$.index_type_query, $.import_lookup_type, $.import_array_type],
    [$.primary_expression, $._equation_object_pattern],
    [$.side, $.server_fn_expression],
    [$.primary_expression, $.draft_expression],
    [$.primary_expression, $._property_name, $.draft_expression],
    // `{view (a) { … }}` is a render prop, `{view(a)}` a call: told apart by the `{` after the `)`
    [$.primary_expression, $.render_block],
    // `(draft) => …`, `(draft state: T) => …` and `(draft)`: as TSX's own parameter conflicts
    [$.primary_expression, $.draft_modifier],
    [$.primary_expression, $.signal_modifier],
    [$.primary_expression, $.draft_expression, $.draft_modifier],
  ]),

  rules: {
    // ---------------------------------------------------------------- modules

    // A `.d.rx` whose first line is `//@ signature …` is a compiled .rx module's printed signature (09 MO-13a): its
    // rows are MO-9b's notation (signature.rs prints and reads it), not a JS module's declaration
    program: $ => choice(
      seq(
        optional($.hash_bang_line),
        repeat($._module_item),
      ),
      seq($.signature_pragma, repeat($.signature_export)),
    ),

    // ---------------------------------------------------------------- a printed signature (MO-9b, MO-13a)

    signature_pragma: _ => token(prec(2, /\/\/@[ \t]*signature([ \t][^\r\n]*)?/)),

    signature_export: $ => seq('export', field('declaration', choice(
      $.signature_type,
      $.signature_error,
      $.signature_action,
      $.signature_source,
      $.signature_context,
      $.signature_fn,
      $.signature_component,
      $.signature_equation,
    ))),

    // `export type Product`: a name, its type is the projection's (13 TY-4c)
    signature_type: $ => seq('type', field('name', alias($.identifier, $.type_identifier))),
    // `export error NotFound(id)`
    signature_error: $ => seq('error', field('name', alias($.identifier, $.type_identifier)), optional(seq('(', commaSep(field('parameter', $.identifier)), ')'))),
    signature_action: $ => seq('action', field('name', $.identifier)),
    // `export source products: pending fails(Error) = …` (a question, ST-5); `:= …` a plain source
    signature_source: $ => seq('source', field('name', $.identifier), optional(seq(':', $.signature_rows)), field('operator', choice(':=', '=')), '…'),
    // `export discount: pending fails(Error)`: an equation
    signature_equation: $ => seq(field('name', $.identifier), optional(seq(':', $.signature_rows))),
    // `export context theme: source pending Theme = …`
    signature_context: $ => prec.right(seq(
      'context',
      field('name', $.identifier),
      optional(seq(':', optional('source'), field('type', $.type))),   // its rows are the type's own (`pending fails(E) T`, row_type)
      optional(seq('=', '…')),
    )),
    // `export pure fn qtyOf(ref id: number, n): pending rejects(Offline) instantiates`, `export server fn add(id)`
    signature_fn: $ => seq(
      optional(field('side', alias('server', $.side))),
      optional($.pure),
      'fn',
      field('name', $.identifier),
      '(', commaSep($.signature_parameter), ')',
      optional(seq(':', $.signature_rows)),
      optional($.rejects_clause),
      optional(alias('instantiates', $.row_word)),
    ),
    signature_parameter: $ => seq(optional($.ref_modifier), field('name', $.identifier), optional(seq(':', field('type', $.type)))),
    signature_rows: $ => repeat1(choice('io', 'pending', 'lane', $.fails_row)),

    // `export component Panel(props: { title; children: catches(Error) provides(./theme.rx#theme) }) uses(./ui.rx#who) shape(roots section)`
    signature_component: $ => seq(
      'component',
      field('name', $.identifier),
      '(', 'props', ':', '{', optional(seq($.signature_prop, repeat(seq(';', $.signature_prop)))), '}', ')',
      repeat(choice(
        alias('made', $.row_word),
        $.fails_row,
        $.signature_uses,
        $.signature_retains,
        $.signature_keeps,
        $.signature_shape,
      )),
    ),
    signature_prop: $ => seq(
      field('name', choice(alias($.identifier, $.property_identifier), '...props')),
      optional(seq(':', repeat1(choice(
        alias(choice('renders', 'unrendered'), $.row_word),
        $.signature_takes,
        $.signature_catches,
        $.signature_provides,
        seq('action', field('action', $.identifier), $.signature_catches),
      )))),
    ),
    signature_catches: $ => seq('catches', '(', choice('*', $._error_classes), ')'),
    signature_provides: $ => seq('provides', '(', choice('*', commaSep1($.context_key)), ')'),
    signature_takes: $ => seq('takes', '(', commaSep1(seq(field('path', $.signature_path), optional('pending'), optional($.fails_row))), ')'),
    signature_path: _ => token(/[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*/),
    // `uses(./ui.rx#who, loading)`: context keys relative to the signature's module (MO-13b), and SV-7b's `loading`
    signature_uses: $ => seq('uses', '(', commaSep1(choice($.context_key, 'loading')), ')'),
    signature_retains: $ => seq('retains', '(', commaSep1(seq(field('name', choice(alias($.identifier, $.property_identifier), '...props')), ':', choice('module', $.context_key))), ')'),
    signature_keeps: $ => seq('keeps', '(', commaSep1(field('name', alias($.identifier, $.property_identifier))), ')'),
    // `shape(roots p div; closes-p; children-at div)`: SV-7d's words
    signature_shape: $ => seq('shape', '(', optional($.shape_words), ')'),
    shape_words: _ => token(/[a-z0-9;\- \t]+/),
    context_key: _ => token(/[.\/@A-Za-z0-9_$-]+#[A-Za-z_$][\w$]*/),

    _module_item: $ => choice(
      $.import_statement,
      $.export_statement,
      $._view_item,
    ),

    // `import pure { a } from "./x"`, `import server { … }`, `… fails A | B`. `server`/`client` is a side before
    // `pure` or `{` (parse.rs's IMPORT_SIDE); in `import server from "./x"` it is the default import's name
    import_statement: $ => seq(
      'import',
      optional(field('side', $.side)),
      optional($.pure),
      choice(
        seq($.import_clause, $._from_clause),
        field('source', $.string),
      ),
      optional($.fails_clause),
      $._semicolon,
    ),

    _import_identifier: ($, previous) => choice(
      previous,
      alias(choice('server', 'client'), $.identifier),
    ),

    side: _ => choice('server', 'client'),
    pure: _ => 'pure',

    fails_clause: $ => seq('fails', $._error_classes),
    _error_classes: $ => seq($._error_class, repeat(seq('|', $._error_class))),
    _error_class: $ => alias($.identifier, $.type_identifier),

    export_statement: $ => seq(
      'export',
      optional('default'),
      field('declaration', $._declaration_item),
    ),

    // ---------------------------------------------------------------- declarations

    _declaration_item: $ => choice(
      $.source_declaration,
      $.equation,
      $.effect_declaration,
      $.fn_declaration,
      $.fn_signature,
      $.component_signature,
      $.const_signature,
      $.server_function_declaration,
      $.action_declaration,
      $.component_declaration,
      $.error_declaration,
      $.context_declaration,
      $.provide_declaration,
      $.type_alias_declaration,
      $.interface_declaration,
    ),

    _view_item: $ => choice(
      $._declaration_item,
      $._markup_item,
      $.empty_statement,
    ),

    _binding_name: $ => choice($.identifier, alias($._reserved_identifier, $.identifier)),

    // `source x: T key id := e` (a seed) or `source x = e` (a question)
    source_declaration: $ => seq(
      'source',
      field('name', $._binding_name),
      optional(field('type', $.type_annotation)),
      optional($.key_clause),
      field('operator', choice(':=', '=')),
      field('value', $.expression),
      $._semicolon,
    ),

    key_clause: $ => seq('key', field('name', $.identifier)),

    // `x = e`, `deferred x = e`, `rows key id = e`, `{ a, b } = props`
    equation: $ => seq(
      optional($.deferred),
      field('name', choice($._binding_name, alias($._equation_object_pattern, $.object_pattern), $.array_pattern)),
      optional(field('type', $.type_annotation)),
      optional($.key_clause),
      '=',
      field('value', $.expression),
      $._semicolon,
    ),

    deferred: _ => 'deferred',

    // TSX's object_pattern without its precedence, which prefers a block's `{ a }` as an expression: in a view,
    // `{ a, b } = props` (an equation per name, RG-4b) and `{a}` (markup) are told apart by the `=` that follows
    _equation_object_pattern: $ => seq(
      '{',
      commaSep(optional(choice(
        $.pair_pattern,
        $.rest_pattern,
        $.object_assignment_pattern,
        alias(choice($.identifier, $._reserved_identifier), $.shorthand_property_identifier_pattern),
      ))),
      '}',
    ),

    // `effect (a, b) { … }`
    effect_declaration: $ => seq(
      'effect',
      field('inputs', $.effect_inputs),
      field('body', $.statement_block),
    ),

    effect_inputs: $ => seq('(', optional(seq(commaSep1($.expression), optional(','))), ')'),

    // `fn f(a: T): R => e` or `fn f(ref a) { decls; tail }`
    fn_declaration: $ => seq(
      'fn',
      field('name', $._binding_name),
      field('parameters', $.formal_parameters),
      optional(field('return_type', $.type_annotation)),
      choice(
        seq('=>', field('body', $.expression), $._semicolon),
        field('body', $.fn_body),
      ),
    ),

    fn_body: $ => seq(
      '{',
      repeat(choice($._declaration_item, $.empty_statement)),
      field('value', $.expression),
      optional(';'),
      '}',
    ),

    // A declaration file's row: `server pure fn f<T>(a: T): R rejects(E) instantiates uses(ctx)`. As TSX's
    // function_signature, it does not end at a newline that a `{` follows: that is a fn's body (parse.rs skips
    // newlines before it). After the result, the row's words in any order (parse.rs reads `rejects` first)
    fn_signature: $ => seq(
      optional(field('side', $.side)),
      optional($.pure),
      'fn',
      field('name', $._binding_name),
      optional(field('type_parameters', $.type_parameters)),
      field('parameters', $.formal_parameters),
      optional(field('return_type', $.type_annotation)),
      repeat($._signature_row),
      choice($._semicolon, $._function_signature_automatic_semicolon),
    ),

    _signature_row: $ => choice(
      $.rejects_clause,
      $.row_word,
      $.uses_clause,
      $.provides_clause,
      $.renders_clause,
      $.nests_clause,
      $.joins_clause,
      $.methods_clause,
    ),

    // `instantiates`, `forwards` (MO-11g), `trusted` (MO-8j), a component's `outlet` (MO-11p), a fn's bare `renders`
    // (MO-11l)
    row_word: _ => choice('instantiates', 'forwards', 'trusted', 'outlet', 'renders'),

    rejects_clause: $ => seq('rejects', '(', $._error_classes, ')'),

    // `uses(router, theme)`, `provides(router)`: contexts the declaration file declares (MO-12)
    uses_clause: $ => seq('uses', $._context_names),
    provides_clause: $ => seq('provides', $._context_names),
    _context_names: $ => seq('(', optional(seq(commaSep1(field('name', $.identifier)), optional(','))), ')'),

    // `renders(later)`, `renders(root, ctx)` (MO-11r)
    renders_clause: $ => seq(
      'renders',
      token.immediate('('),
      choice('later', seq('root', repeat(seq(',', field('name', $.identifier))))),
      ')',
    ),

    // `nests(children in component)`, `nests(component under getParentRoute)` (MO-11r)
    nests_clause: $ => seq(
      'nests',
      '(',
      field('field', alias($.identifier, $.property_identifier)),
      choice('in', 'under'),
      field('of', alias($.identifier, $.property_identifier)),
      ')',
    ),

    // `joins(path)` (MO-11i)
    joins_clause: $ => seq('joins', '(', field('field', alias($.identifier, $.property_identifier)), ')'),

    // `methods(addChildren)`: the methods of the instance a primitive makes that make a value once (02 E-10)
    methods_clause: $ => seq('methods', '(', commaSep1(field('name', alias($.identifier, $.property_identifier))), optional(','), ')'),

    // A declaration file's component: `component Dialog.Title(props: { id?: string }) uses(coreDialog)` (MO-11a,
    // MO-11q). As a fn's row, it does not end at a newline that a `{` follows: that is a component's body
    component_signature: $ => seq(
      'component',
      field('name', choice($.identifier, $.member_component_name)),
      optional(field('type_parameters', $.type_parameters)),   // MO-8d: a generic component, `component Select<Option>(…)`
      field('parameters', $.formal_parameters),
      repeat(choice(
        $.row_word,
        $.uses_clause,
        $.provides_clause,
        $.fails_row,
        $.shape_clause,
      )),
      choice($._semicolon, $._function_signature_automatic_semicolon),
    ),

    member_component_name: $ => seq(
      field('object', choice($.identifier, $.member_component_name)),
      '.',
      field('property', alias($.identifier, $.property_identifier)),
    ),

    // `fails(NotFound | Timeout)`: a component's row, and a result field's (MO-10f)
    fails_row: $ => seq('fails', '(', optional($._error_classes), ')'),

    // `shape(Item[])`: what a component's content must be
    shape_clause: $ => seq('shape', '(', $.type, ')'),

    // `export const promoteForm: any` (MO-8g)
    const_signature: $ => seq(
      'const',
      field('name', $._binding_name),
      optional(field('type', $.type_annotation)),
      $._semicolon,
    ),

    server_function_declaration: $ => seq(
      $.side,
      'fn',
      field('name', $._binding_name),
      field('parameters', $.formal_parameters),
      optional(field('return_type', $.type_annotation)),
      field('body', $.statement_block),
    ),

    action_declaration: $ => seq(
      'action',
      field('name', $._binding_name),
      field('parameters', $.formal_parameters),
      field('body', $.statement_block),
    ),

    component_declaration: $ => seq(
      'component',
      field('name', $.identifier),
      field('parameters', $.formal_parameters),
      field('body', $.view_block),
    ),

    // `error NotFound(id: number) => \`no user ${id}\``
    error_declaration: $ => seq(
      'error',
      field('name', alias($.identifier, $.type_identifier)),
      optional(field('parameters', $.formal_parameters)),
      optional(seq('=>', field('message', $.expression))),
      $._semicolon,
    ),

    // `context theme: Theme = dflt`
    context_declaration: $ => seq(
      'context',
      field('name', $._binding_name),
      optional(seq(':', optional('source'), field('type', $.type))),
      optional(seq('=', field('value', $.expression))),
      $._semicolon,
    ),

    provide_declaration: $ => seq(
      'provide',
      field('name', $._binding_name),
      '=',
      field('value', $.expression),
      $._semicolon,
    ),

    // ---------------------------------------------------------------- markup

    view_block: $ => seq('{', repeat($._view_item), '}'),

    _markup_item: $ => choice(
      $.jsx_element,
      $.jsx_self_closing_element,
      $.style_element,
      $.jsx_expression,
      $._control_block,
    ),

    _control_block: $ => choice(
      $.if_block,
      $.for_block,
      $.loading_block,
      $.errored_block,
      $.portal_block,
      $.render_block,
    ),

    // `view (item, i) { … }`, a render prop's body; `view header (n) { … }` for a named one (MO-11k)
    render_block: $ => prec.dynamic(1, seq(
      'view',
      optional(field('prop', alias($.identifier, $.property_identifier))),
      '(',
      optional(seq(commaSep1($._render_parameter), optional(','))),
      ')',
      field('body', $.view_block),
    )),

    _render_parameter: $ => field('parameter', $.identifier),

    if_block: $ => prec.right(seq(
      'if',
      field('condition', $.expression),
      field('consequence', $.view_block),
      optional(field('alternative', $.else_block)),
    )),

    else_block: $ => seq('else', choice($.view_block, $.if_block)),

    for_block: $ => seq(
      'for',
      field('name', $._binding_name),
      'in',
      field('value', $.expression),
      field('body', $.view_block),
    ),

    loading_block: $ => seq(
      'loading',
      optional(seq('on', '(', field('trigger', $.expression), ')')),
      'fallback',
      field('fallback', $.view_block),
      field('body', $.view_block),
    ),

    errored_block: $ => seq(
      'errored',
      'fallback',
      optional(seq(
        '(',
        field('parameter', $._binding_name),
        optional(seq(':', field('type', $._error_classes))),
        ')',
      )),
      field('fallback', $.view_block),
      field('body', $.view_block),
    ),

    portal_block: $ => seq(
      'portal',
      optional(seq('to', '(', field('target', $.expression), ')')),
      field('body', $.view_block),
    ),

    // `{expr}`, and inside an element the braced control forms, `{if c { … }}`
    jsx_expression: $ => seq(
      '{',
      optional(choice(
        $.expression,
        $.sequence_expression,
        $.spread_element,
        $._control_block,
      )),
      '}',
    ),

    // `<style>` holds CSS, read as raw text up to `</style>` (CSS-1); as an expression it is a class map (CSS-5)
    style_element: $ => seq(
      '<',
      alias('style', $.identifier),
      '>',
      optional(alias($._style_text, $.raw_text)),
      '</',
      alias('style', $.identifier),
      '>',
    ),

    // parse.rs reads a `<style>` as raw CSS at any depth (the compiler then reports where it may not be)
    _jsx_child: ($, previous) => choice(previous, $.style_element),

    // `value=1`, `value=name`: parse.rs reads a primary expression after `=`
    _jsx_attribute_value: ($, previous) => choice(
      previous,
      $.identifier,
      $.number,
      $.template_string,
      $.true,
      $.false,
      $.null,
      $.undefined,
      $.parenthesized_expression,
      $.array,
    ),

    // ---------------------------------------------------------------- imperative statements

    statement: ($, previous) => choice(
      previous,
      $.write_statement,
      $.guess_statement,
      $.refresh_statement,
      $.affects_statement,
      $.action_statement,
    ),

    _write_target: $ => choice(
      $._binding_name,
      $.member_expression,
      $.subscript_expression,
      $.use_expression,
    ),

    // `x := e`, `xs[i].done := v`, `x := old => …`
    write_statement: $ => seq(
      field('target', $._write_target),
      ':=',
      field('value', $.expression),
      $._semicolon,
    ),

    guess_statement: $ => seq(
      'guess',
      field('target', $._write_target),
      ':=',
      field('value', $.expression),
      $._semicolon,
    ),

    refresh_statement: $ => seq('refresh', field('name', $.identifier), $._semicolon),

    affects_statement: $ => seq('affects', field('name', $.identifier), $._semicolon),

    // `action { … }`: an inline action, one run
    action_statement: $ => seq('action', field('body', $.statement_block)),

    // ---------------------------------------------------------------- expressions

    // 07 §3: no assignment operators (`=`, `+=`): a statement-level `x = e` is an equation, a write is `x := e`
    expression: ($, previous) => choice(
      ...previous.members.filter((member) =>
        member.name !== 'assignment_expression' && member.name !== 'augmented_assignment_expression'),
      $.pending_expression,
      $.latest_expression,
      $.peek_expression,
      $.pre_expression,
      $.use_expression,
      $.throw_expression,
      $.catch_expression,
      $.draft_expression,
      $.fn_expression,
      $.server_fn_expression,
      $.style_element,
    ),

    // `await e`, `await e -> first`, `await* stream -> first`
    await_expression: $ => prec.right('unary_void', seq(
      'await',
      optional(field('stream', '*')),
      field('argument', $.expression),
      optional(seq('->', field('initial', $.expression))),
    )),

    pending_expression: $ => prec.left('unary_void', seq('pending?', field('argument', $.expression))),

    latest_expression: $ => prec.left('unary_void', seq('latest', field('argument', $.expression))),

    peek_expression: $ => prec.left('unary_void', seq('peek', field('argument', $.expression))),

    // `pre x`, `pre x -> init`
    pre_expression: $ => prec.right('unary_void', seq(
      'pre',
      field('name', $.identifier),
      optional(seq('->', field('initial', $.expression))),
    )),

    use_expression: $ => prec('unary_void', seq('use', field('name', $.identifier))),

    // TC39's throw expression: `c ? a : throw NotFound(id)`
    throw_expression: $ => prec.left('unary_void', seq('throw', field('argument', $.expression))),

    // `e catch (x: A | B) => alt`, looser than every operator; a chain folds left, `(a catch => b) catch => c`
    catch_expression: $ => prec.left('catch', seq(
      field('value', $.expression),
      'catch',
      optional(seq(
        '(',
        field('parameter', $._binding_name),
        optional(seq(':', field('type', $._error_classes))),
        ')',
      )),
      '=>',
      field('alternative', $.expression),
    )),

    // `draft(e) { d[id] := true }`
    draft_expression: $ => seq(
      'draft',
      '(',
      field('value', $.expression),
      ')',
      field('body', $.statement_block),
    ),

    // `fn (a, b) => e`
    fn_expression: $ => prec.right(seq(
      'fn',
      field('parameters', $.formal_parameters),
      '=>',
      field('body', $.expression),
    )),

    // `server fn (a: T): R { … }`
    server_fn_expression: $ => seq(
      'server',
      'fn',
      field('parameters', $.formal_parameters),
      optional(field('return_type', $.type_annotation)),
      field('body', $.statement_block),
    ),

    // `fn area(ref w: number)`: an instantiation parameter (E-9). In a declaration file, `signal init: string` takes
    // a Solid signal (MO-10h) and a callback's `draft state: T` is a library's draft (MO-10i)
    _parameter_name: ($, previous) => seq(
      optional(choice($.ref_modifier, $.signal_modifier, $.draft_modifier)),
      previous,
    ),

    ref_modifier: _ => 'ref',
    signal_modifier: _ => 'signal',
    draft_modifier: _ => 'draft',

    // `): ref string`, `): [ref boolean, (v: boolean) => void]`: an accessor in a signature's return (MO-10b); and a
    // declaration file's words before a type
    type: ($, previous) => choice(
      previous,
      $.import_type,
      $.ref_type,
      $.callback_type,
      $.row_type,
      $.renders_type,
      $.catches_type,
    ),

    // `import("@solidjs/router").RouteParams<S>`: TSX reads an import type without type arguments
    import_type: $ => seq(
      alias($._type_query_member_expression_in_type_annotation, $.member_expression),
      field('type_arguments', $.type_arguments),
    ),

    // `items: import("pkg").Item[]`, `ref import("pkg").Item[]`: an import type as an array's element (TSX reads an
    // import type only whole, as an annotation's type)
    primary_type: ($, previous) => choice(
      previous,
      alias($.import_array_type, $.array_type),
      alias($.import_lookup_type, $.lookup_type),
    ),
    // `error: import("pkg").Types["error"]`: a member of an import type (what `rx-declare` writes for a type a library
    // declares as a field of another); a further `["x"]` is TSX's own lookup of this one
    // `keyof import("@solidjs/web").JSX.IntrinsicElements`: `keyof` of an import type (a bound `rx-declare` writes as
    // the library declares it)
    index_type_query: ($, previous) => choice(
      previous,
      prec(1, seq('keyof', choice(alias($._type_query_member_expression_in_type_annotation, $.member_expression), $.import_type))),
    ),
    import_lookup_type: $ => prec(1, seq(
      choice(alias($._type_query_member_expression_in_type_annotation, $.member_expression), $.import_type),
      '[',
      $.type,
      ']',
    )),
    import_array_type: $ => prec(1, seq(
      choice(alias($._type_query_member_expression_in_type_annotation, $.member_expression), $.import_type),
      '[',
      ']',
    )),

    ref_type: $ => prec.right(seq($.ref_modifier, $.type)),

    // `onSubmit: handler (e: Event) => void` (called later, MO-10g), `queryFn: tracked () => T` (called inside a
    // computation, MO-10j)
    callback_type: $ => seq(field('kind', choice('handler', 'tracked')), $.function_type),

    // a result's field rows: `data: pending fails(Error) any` (MO-10f)
    row_type: $ => prec.right(seq(choice('pending', $.fails_row), $.type)),

    // `router: renders any`: a prop that carries components the component renders (MO-11o)
    renders_type: $ => prec.right(seq('renders', $.type)),

    // `fallback: catches(NotFound) (e: Error) => View`, `catches(*)`: a prop called with what the component catches
    catches_type: $ => prec.right(seq('catches', '(', choice('*', optional($._error_classes)), ')', $.type)),

    _reserved_identifier: ($, previous) => choice(
      previous,
      'server',
      'client',
      'error',
      'draft',
      'signal',
      'view',
    ),
  },
});

/**
 * @param {RuleOrLiteral} rule
 * @returns {ChoiceRule}
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/**
 * @param {RuleOrLiteral} rule
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
