// The external scanner: tree-sitter-typescript's (common/scanner.h, MIT), with rx's changes marked `rx:`.

#include "tree_sitter/parser.h"

#include <wctype.h>

enum TokenType {
    AUTOMATIC_SEMICOLON,
    TEMPLATE_CHARS,
    TERNARY_QMARK,
    HTML_COMMENT,
    LOGICAL_OR,
    ESCAPE_SEQUENCE,
    REGEX_PATTERN,
    JSX_TEXT,
    FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON,
    ERROR_RECOVERY,
    STYLE_TEXT,
};

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static bool scan_template_chars(TSLexer *lexer) {
    lexer->result_symbol = TEMPLATE_CHARS;
    for (bool has_content = false;; has_content = true) {
        lexer->mark_end(lexer);
        switch (lexer->lookahead) {
            case '`':
                return has_content;
            case '\0':
                return false;
            case '$':
                advance(lexer);
                if (lexer->lookahead == '{') {
                    return has_content;
                }
                break;
            case '\\':
                return has_content;
            default:
                advance(lexer);
        }
    }
}

static bool scan_whitespace_and_comments(TSLexer *lexer, bool *scanned_comment) {
    for (;;) {
        while (iswspace(lexer->lookahead)) {
            skip(lexer);
        }

        if (lexer->lookahead == '/') {
            skip(lexer);

            if (lexer->lookahead == '/') {
                skip(lexer);
                while (lexer->lookahead != 0 && lexer->lookahead != '\n') {
                    skip(lexer);
                }
                *scanned_comment = true;
            } else if (lexer->lookahead == '*') {
                skip(lexer);
                while (lexer->lookahead != 0) {
                    if (lexer->lookahead == '*') {
                        skip(lexer);
                        if (lexer->lookahead == '/') {
                            skip(lexer);
                            break;
                        }
                    } else {
                        skip(lexer);
                    }
                }
            } else {
                return false;
            }
        } else {
            return true;
        }
    }
}

// rx: parse.rs reads statements back to back, so on the same line the start of a statement ends the one before it:
// `optimistic x := v` is the statement `optimistic`, then the write `x := v`. What starts one here is
//   - a statement keyword: `a := 1 guess b := 2`, `if (c) x := 1 else y := 2`
//   - a write target (`x`, `x.a`, `xs[i].b`, `use theme`) followed by `:=`
//   - after a whole expression, a call: `foo() bar()`
// A word alone does not, since the token before it is not known here: `type T`, `let x` and `return x` go on.
static bool is_word_start(int32_t c) { return iswalpha(c) || c == '_' || c == '$'; }
static bool is_word_char(int32_t c) { return iswalnum(c) || c == '_' || c == '$'; }

static void skip_blanks(TSLexer *lexer) {
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        skip(lexer);
    }
}

#define WORD_MAX 16

// Reads a word into `word`; a longer one is cut short, which matches no keyword.
static void scan_word(TSLexer *lexer, char *word) {
    unsigned length = 0;
    while (is_word_char(lexer->lookahead)) {
        if (length < WORD_MAX - 1) {
            word[length++] = lexer->lookahead < 0x80 ? (char)lexer->lookahead : '?';
        } else {
            word[0] = 0;
            length = WORD_MAX;
        }
        skip(lexer);
    }
    if (length < WORD_MAX) {
        word[length] = 0;
    }
}

static bool word_in(const char *word, const char *const *list) {
    for (; *list; list++) {
        const char *a = word, *b = *list;
        while (*a && *a == *b) {
            a++;
            b++;
        }
        if (*a == 0 && *b == 0) {
            return true;
        }
    }
    return false;
}

// Skips a bracketed run on one line, from its opening bracket to past the closing one. Brackets in a string or a
// comment do not count.
static bool skip_brackets(TSLexer *lexer) {
    unsigned depth = 0;
    do {
        int32_t c = lexer->lookahead;
        if (c == '\n' || c == 0) {
            return false;
        }
        if (c == '/') {
            skip(lexer);
            if (lexer->lookahead == '/') {
                return false; // the rest of the line is a comment: the bracket does not close on it
            }
            if (lexer->lookahead == '*') {
                skip(lexer);
                for (;;) {
                    if (lexer->lookahead == '\n' || lexer->lookahead == 0) {
                        return false;
                    }
                    if (lexer->lookahead == '*') {
                        skip(lexer);
                        if (lexer->lookahead == '/') {
                            skip(lexer);
                            break;
                        }
                        continue;
                    }
                    skip(lexer);
                }
            }
            continue; // a division: the `/` is already skipped
        }
        if (c == '(' || c == '[' || c == '{') {
            depth++;
        } else if (c == ')' || c == ']' || c == '}') {
            depth--;
        } else if (c == '"' || c == '\'' || c == '`') {
            skip(lexer);
            while (lexer->lookahead != c) {
                if (lexer->lookahead == '\\') {
                    skip(lexer);
                }
                if (lexer->lookahead == '\n' || lexer->lookahead == 0) {
                    return false;
                }
                skip(lexer);
            }
        }
        skip(lexer);
    } while (depth > 0);
    return true;
}

static bool scan_statement_ahead(TSLexer *lexer, bool after_expression) {
    static const char *const starts[] = {"else",   "if",    "for", "while",  "do",    "return",   "const", "let",
                                         "var",    "try",   "switch", "break", "continue", NULL};
    static const char *const starts_with_name[] = {"guess", "refresh", "affects", NULL};
    // words that go on with the expression or declaration before them, whatever follows
    static const char *const joins[] = {"catch", "in",      "instanceof", "as", "satisfies", "of", "is",
                                        "extends", "rejects", "fn",         "function", NULL};
    char word[WORD_MAX];

    if (!is_word_start(lexer->lookahead)) {
        return false;
    }
    scan_word(lexer, word);
    if (word_in(word, starts)) {
        return true;
    }
    if (word_in(word, joins)) {
        return false;
    }
    bool blanks = lexer->lookahead == ' ' || lexer->lookahead == '\t';
    skip_blanks(lexer);
    if (blanks && word_in(word, starts_with_name)) {
        return is_word_start(lexer->lookahead);
    }
    if (blanks && word_in(word, (const char *const[]){"action", NULL})) {
        return lexer->lookahead == '{';
    }
    if (blanks && word_in(word, (const char *const[]){"use", NULL}) && is_word_start(lexer->lookahead)) {
        scan_word(lexer, word);
        blanks = lexer->lookahead == ' ' || lexer->lookahead == '\t';
        skip_blanks(lexer);
    }
    for (;;) {
        if (lexer->lookahead == '.') {
            skip(lexer);
            if (!is_word_start(lexer->lookahead)) {
                return false;
            }
            scan_word(lexer, word);
        } else if (lexer->lookahead == '[') {
            if (!skip_brackets(lexer)) {
                return false;
            }
        } else if (lexer->lookahead == '(' && after_expression && !blanks) {
            // a call, unless what follows its arguments makes it a signature or an arrow's parameters
            if (!skip_brackets(lexer)) {
                return false;
            }
            skip_blanks(lexer);
            if (lexer->lookahead == '{' || lexer->lookahead == ':') {
                return false;
            }
            if (lexer->lookahead == '=') {
                skip(lexer);
                return lexer->lookahead != '>';
            }
            return true;
        } else {
            break;
        }
        blanks = lexer->lookahead == ' ' || lexer->lookahead == '\t';
        skip_blanks(lexer);
    }
    if (lexer->lookahead != ':') {
        return false;
    }
    skip(lexer);
    return lexer->lookahead == '=';
}

static bool scan_automatic_semicolon(TSLexer *lexer, const bool *valid_symbols, bool *scanned_comment) {
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    lexer->mark_end(lexer);

    for (;;) {
        if (lexer->lookahead == 0) {
            return true;
        }
        if (lexer->lookahead == '}') {
            // Automatic semicolon insertion breaks detection of object patterns
            // in a typed context:
            //   type F = ({a}: {a: number}) => number;
            // Therefore, disable automatic semicolons when followed by typing
            do {
                skip(lexer);
            } while (iswspace(lexer->lookahead));
            if (lexer->lookahead == ':') {
                return valid_symbols[LOGICAL_OR]; // Don't return false if we're in a ternary by checking if || is valid
            }
            return true;
        }
        if (!iswspace(lexer->lookahead)) {
            // rx: a ternary's `?` may follow only a whole expression
            return scan_statement_ahead(lexer, valid_symbols[TERNARY_QMARK]);
        }
        if (lexer->lookahead == '\n') {
            break;
        }
        skip(lexer);
    }

    skip(lexer);

    if (!scan_whitespace_and_comments(lexer, scanned_comment)) {
        return false;
    }

    switch (lexer->lookahead) {
        // rx: markup on the next line starts a new item, and parse.rs reads no call, index or template across a
        // newline, so a newline ends the statement before `<`, `(`, `[` and `` ` ``.
        case '<':
            skip(lexer);
            return lexer->lookahead != '=' && lexer->lookahead != '<';
        case '`':
            return true;
        case '(':
        case '[':
            return true;
        // rx: `e\n  catch (x) => alt` goes on (R-f-4)
        case 'c':
            skip(lexer);
            for (unsigned i = 0; i < 4; i++) {
                if (lexer->lookahead != "atch"[i]) {
                    return true;
                }
                skip(lexer);
            }
            return iswalnum(lexer->lookahead) || lexer->lookahead == '_' || lexer->lookahead == '$';
        case ',':
        case '.':
        case ';':
        case '*':
        case '%':
        case '>':
        case '=':
        case '?':
        case '^':
        case '|':
        case '&':
        case '/':
        case ':':
            return false;

        case '{':
            if (valid_symbols[FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON]) {
                return false;
            }
            break;

            // Don't insert a semicolon before a '[' or '(', unless we're parsing
            // a type. Detect whether we're parsing a type or an expression using
            // the validity of a binary operator token.

            // Insert a semicolon before `--` and `++`, but not before binary `+` or `-`.
        case '+':
            skip(lexer);
            return lexer->lookahead == '+';
        case '-':
            skip(lexer);
            return lexer->lookahead == '-';

            // Don't insert a semicolon before `!=`, but do insert one before a unary `!`.
        case '!':
            skip(lexer);
            return lexer->lookahead != '=';

            // Don't insert a semicolon before `in` or `instanceof`, but do insert one
            // before an identifier.
        case 'i':
            skip(lexer);

            if (lexer->lookahead != 'n') {
                return true;
            }
            skip(lexer);

            if (!iswalpha(lexer->lookahead)) {
                return false;
            }

            for (unsigned i = 0; i < 8; i++) {
                if (lexer->lookahead != "stanceof"[i]) {
                    return true;
                }
                skip(lexer);
            }

            if (!iswalpha(lexer->lookahead)) {
                return false;
            }
            break;
    }

    return true;
}

static bool scan_ternary_qmark(TSLexer *lexer) {
    for (;;) {
        if (!iswspace(lexer->lookahead)) {
            break;
        }
        skip(lexer);
    }

    if (lexer->lookahead == '?') {
        advance(lexer);

        /* Optional chaining. */
        if (lexer->lookahead == '?' || lexer->lookahead == '.') {
            return false;
        }

        lexer->mark_end(lexer);
        lexer->result_symbol = TERNARY_QMARK;

        /* TypeScript optional arguments contain the ?: sequence, possibly
           with whitespace. */
        for (;;) {
            if (!iswspace(lexer->lookahead)) {
                break;
            }
            advance(lexer);
        }

        if (lexer->lookahead == ':' || lexer->lookahead == ')' || lexer->lookahead == ',') {
            return false;
        }

        if (lexer->lookahead == '.') {
            advance(lexer);
            if (iswdigit(lexer->lookahead)) {
                return true;
            }
            return false;
        }
        return true;
    }
    return false;
}

static bool scan_closing_comment(TSLexer *lexer) {
    while (iswspace(lexer->lookahead) || lexer->lookahead == 0x2028 || lexer->lookahead == 0x2029) {
        skip(lexer);
    }

    const char *comment_start = "<!--";
    const char *comment_end = "-->";

    if (lexer->lookahead == '<') {
        for (unsigned i = 0; i < 4; i++) {
            if (lexer->lookahead != comment_start[i]) {
                return false;
            }
            advance(lexer);
        }
    } else if (lexer->lookahead == '-') {
        for (unsigned i = 0; i < 3; i++) {
            if (lexer->lookahead != comment_end[i]) {
                return false;
            }
            advance(lexer);
        }
    } else {
        return false;
    }

    while (lexer->lookahead != 0 && lexer->lookahead != '\n' && lexer->lookahead != 0x2028 &&
           lexer->lookahead != 0x2029) {
        advance(lexer);
    }

    lexer->result_symbol = HTML_COMMENT;
    lexer->mark_end(lexer);

    return true;
}

static bool scan_jsx_text(TSLexer *lexer) {
    // saw_text will be true if we see any non-whitespace content, or any whitespace content that is not a newline and
    // does not immediately follow a newline.
    bool saw_text = false;
    // at_newline will be true if we are currently at a newline, or if we are at whitespace that is not a newline but
    // immediately follows a newline.
    bool at_newline = false;

    // rx: parse.rs ends an element's text at `<`, `{` and `}` only, so `>` and a bare `&` are text. A character
    // reference (`&amp;`, `&#38;`) is left to the grammar's html_character_reference.
    lexer->mark_end(lexer);
    while (lexer->lookahead != 0 && lexer->lookahead != '<' && lexer->lookahead != '{' && lexer->lookahead != '}') {
        if (lexer->lookahead == '&') {
            advance(lexer);
            bool is_reference = false;
            if (lexer->lookahead == '#' || iswalpha(lexer->lookahead)) {
                unsigned length = 0;
                do {
                    advance(lexer);
                    length++;
                } while (iswalnum(lexer->lookahead) && length < 32);
                is_reference = lexer->lookahead == ';';
            }
            if (is_reference) {
                break;
            }
            at_newline = false;
            saw_text = true;
            lexer->mark_end(lexer);
            continue;
        }
        bool is_wspace = iswspace(lexer->lookahead);
        if (lexer->lookahead == '\n') {
            at_newline = true;
        } else {
            // If at_newline is already true, and we see some whitespace, then it must stay true.
            // Otherwise, it should be false.
            //
            // See the table below to determine the logic for computing `saw_text`.
            //
            // |------------------------------------|
            // | at_newline | is_wspace | saw_text  |
            // |------------|-----------|-----------|
            // | false (0)  | false (0) | true  (1) |
            // | false (0)  | true  (1) | true  (1) |
            // | true  (1)  | false (0) | true  (1) |
            // | true  (1)  | true  (1) | false (0) |
            // |------------------------------------|

            at_newline &= is_wspace;
            if (!at_newline) {
                saw_text = true;
            }
        }

        advance(lexer);
        lexer->mark_end(lexer);
    }

    lexer->result_symbol = JSX_TEXT;
    return saw_text;
}

// rx: a <style>'s CSS, up to `</style>` (CSS-1)
static bool scan_style_text(TSLexer *lexer) {
    const char *close = "</style>";
    bool has_content = false;
    lexer->result_symbol = STYLE_TEXT;
    for (;;) {
        lexer->mark_end(lexer);
        if (lexer->lookahead == 0) {
            return false;
        }
        if (lexer->lookahead == '<') {
            unsigned i = 0;
            while (close[i] != 0 && lexer->lookahead == close[i]) {
                advance(lexer);
                i++;
            }
            if (close[i] == 0) {
                return has_content;
            }
            has_content = true;
            continue;
        }
        advance(lexer);
        has_content = true;
    }
}

static inline bool external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    if (valid_symbols[STYLE_TEXT] && !valid_symbols[ERROR_RECOVERY]) {
        return scan_style_text(lexer);
    }
    if (valid_symbols[TEMPLATE_CHARS]) {
        if (valid_symbols[AUTOMATIC_SEMICOLON]) {
            return false;
        }
        return scan_template_chars(lexer);
    }

    if (valid_symbols[JSX_TEXT] && scan_jsx_text(lexer)) {
        return true;
    }

    if (valid_symbols[AUTOMATIC_SEMICOLON] || valid_symbols[FUNCTION_SIGNATURE_AUTOMATIC_SEMICOLON]) {
        bool scanned_comment = false;
        bool ret = scan_automatic_semicolon(lexer, valid_symbols, &scanned_comment);
        if (!ret && !scanned_comment && valid_symbols[TERNARY_QMARK] && lexer->lookahead == '?') {
            return scan_ternary_qmark(lexer);
        }
        return ret;
    }
    if (valid_symbols[TERNARY_QMARK]) {
        return scan_ternary_qmark(lexer);
    }

    if (valid_symbols[HTML_COMMENT] && !valid_symbols[LOGICAL_OR] && !valid_symbols[ESCAPE_SEQUENCE] &&
        !valid_symbols[REGEX_PATTERN]) {
        return scan_closing_comment(lexer);
    }

    return false;
}

void *tree_sitter_rx_external_scanner_create() { return NULL; }

void tree_sitter_rx_external_scanner_destroy(void *payload) {}

unsigned tree_sitter_rx_external_scanner_serialize(void *payload, char *buffer) { return 0; }

void tree_sitter_rx_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}

bool tree_sitter_rx_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    return external_scanner_scan(payload, lexer, valid_symbols);
}
