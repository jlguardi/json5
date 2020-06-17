const util = require('./util')

let source
let parseState
let stack
let pos
let line
let column
let token
let key
let root

module.exports = function parse (text, reviver) {
    source = String(text)
    parseState = 'start'
    stack = []
    pos = 0
    line = 1
    column = 0
    token = undefined
    key = undefined
    root = undefined

    do {
        token = lex()

        // This code is unreachable.
        // if (!parseStates[parseState]) {
        //     throw invalidParseState()
        // }

        parseStates[parseState]()
    } while (token.type !== 'eof')

    if (typeof reviver === 'function') {
        return internalize({'': root}, '', reviver)
    }

    return root
}

function internalize (holder, name, reviver) {
    const value = holder[name]
    if (value != null && typeof value === 'object') {
        for (const key in value) {
            const replacement = internalize(value, key, reviver)
            if (replacement === undefined) {
                delete value[key]
            } else {
                value[key] = replacement
            }
        }
    }

    return reviver.call(holder, name, value)
}

let lexState
let buffer
let stringSeparator
let sign
let c
const escapeChar = '\\'

function lex () {
    lexState = 'default'
    buffer = ''
    stringSeparator = "'"
    sign = 1

    for (;;) {
        c = peek()

        // This code is unreachable.
        // if (!lexStates[lexState]) {
        //     throw invalidLexState(lexState)
        // }

        const token = lexStates[lexState]()
        if (token) {
            return token
        }
    }
}

function peek () {
    if (source[pos]) {
        return String.fromCodePoint(source.codePointAt(pos))
    }
}

function read () {
    const c = peek()

    if (c === '\n') {
        line++
        column = 0
    } else if (c) {
        column += c.length
    } else {
        column++
    }

    if (c) {
        pos += c.length
    }

    return c
}

const lexStates = {
    default () {
        switch (c) {
        case '\t':
        case '\v':
        case '\f':
        case ' ':
        case '\u00A0':
        case '\uFEFF':
        case '\n':
        case '\r':
        case '\u2028':
        case '\u2029':
            read()
            return

        case '/':
            read()
            lexState = 'comment'
            return

        case undefined:
            read()
            return newToken('eof')
        }

        if (util.isSpaceSeparator(c)) {
            read()
            return
        }

        // This code is unreachable.
        // if (!lexStates[parseState]) {
        //     throw invalidLexState(parseState)
        // }

        return lexStates[parseState]()
    },

    comment () {
        switch (c) {
        case '*':
            read()
            lexState = 'multiLineComment'
            return

        case '/':
            read()
            lexState = 'singleLineComment'
            return
        }

        throw invalidChar(read())
    },

    multiLineComment () {
        switch (c) {
        case '*':
            read()
            lexState = 'multiLineCommentAsterisk'
            return

        case undefined:
            throw invalidChar(read())
        }

        read()
    },

    multiLineCommentAsterisk () {
        switch (c) {
        case '*':
            read()
            return

        case '/':
            read()
            lexState = 'default'
            return

        case undefined:
            throw invalidChar(read())
        }

        read()
        lexState = 'multiLineComment'
    },

    singleLineComment () {
        switch (c) {
        case '\n':
        case '\r':
        case '\u2028':
        case '\u2029':
            read()
            lexState = 'default'
            return

        case undefined:
            read()
            return newToken('eof')
        }

        read()
    },

    value () {
        switch (c) {
        case '{':
        case '[':
            return newToken('punctuator', read())

        case 'n':
            read()
            literal('ull')
            return newToken('null', null)

        case 't':
            read()
            literal('rue')
            return newToken('boolean', true)

        case 'f':
            read()
            literal('alse')
            return newToken('boolean', false)

        case '-':
        case '+':
            if (read() === '-') {
                sign = -1
            }

            lexState = 'sign'
            return

        case '.':
            buffer = read()
            lexState = 'decimalPointLeading'
            return

        case '0':
            buffer = read()
            lexState = 'zero'
            return

        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
            buffer = read()
            lexState = 'decimalInteger'
            return

        case 'I':
            read()
            literal('nfinity')
            return newToken('numeric', Infinity)

        case 'N':
            read()
            literal('aN')
            return newToken('numeric', NaN)

        case '"':
        case "'":
            stringSeparator = read()
            lexState = 'string'
            return
        }

        throw invalidChar(read())
    },

    identifierNameStartEscape () {
        if (c !== 'u') {
            throw invalidChar(read())
        }

        read()
        const u = unicodeEscape()
        switch (u) {
        case '$':
        case '_':
            break

        default:
            if (!util.isIdStartChar(u)) {
                throw invalidIdentifier()
            }

            break
        }

        buffer += u
        lexState = 'identifierName'
    },

    identifierName () {
        switch (c) {
        case '$':
        case '_':
        case '\u200C':
        case '\u200D':
            buffer += read()
            return

        case '\\':
            read()
            lexState = 'identifierNameEscape'
            return
        }

        if (util.isIdContinueChar(c)) {
            buffer += read()
            return
        }

        return newToken('identifier', buffer)
    },

    identifierNameEscape () {
        if (c !== 'u') {
            throw invalidChar(read())
        }

        read()
        const u = unicodeEscape()
        switch (u) {
        case '$':
        case '_':
        case '\u200C':
        case '\u200D':
            break

        default:
            if (!util.isIdContinueChar(u)) {
                throw invalidIdentifier()
            }

            break
        }

        buffer += u
        lexState = 'identifierName'
    },

    sign () {
        switch (c) {
        case '.':
            buffer = read()
            lexState = 'decimalPointLeading'
            return

        case '0':
            buffer = read()
            lexState = 'zero'
            return

        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
            buffer = read()
            lexState = 'decimalInteger'
            return

        case 'I':
            read()
            literal('nfinity')
            return newToken('numeric', sign * Infinity)

        case 'N':
            read()
            literal('aN')
            return newToken('numeric', NaN)
        }

        throw invalidChar(read())
    },

    zero () {
        switch (c) {
        case '.':
            buffer += read()
            lexState = 'decimalPoint'
            return

        case 'e':
        case 'E':
            buffer += read()
            lexState = 'decimalExponent'
            return

        case 'x':
        case 'X':
            buffer += read()
            lexState = 'hexadecimal'
            return
        }

        return newToken('numeric', sign * 0)
    },

    decimalInteger () {
        switch (c) {
        case '.':
            buffer += read()
            lexState = 'decimalPoint'
            return

        case 'e':
        case 'E':
            buffer += read()
            lexState = 'decimalExponent'
            return
        }

        if (util.isDigit(c)) {
            buffer += read()
            return
        }

        return newToken('numeric', sign * Number(buffer))
    },

    decimalPointLeading () {
        if (util.isDigit(c)) {
            buffer += read()
            lexState = 'decimalFraction'
            return
        }

        throw invalidChar(read())
    },

    decimalPoint () {
        switch (c) {
        case 'e':
        case 'E':
            buffer += read()
            lexState = 'decimalExponent'
            return
        }

        if (util.isDigit(c)) {
            buffer += read()
            lexState = 'decimalFraction'
            return
        }

        return newToken('numeric', sign * Number(buffer))
    },

    decimalFraction () {
        switch (c) {
        case 'e':
        case 'E':
            buffer += read()
            lexState = 'decimalExponent'
            return
        }

        if (util.isDigit(c)) {
            buffer += read()
            return
        }

        return newToken('numeric', sign * Number(buffer))
    },

    decimalExponent () {
        switch (c) {
        case '+':
        case '-':
            buffer += read()
            lexState = 'decimalExponentSign'
            return
        }

        if (util.isDigit(c)) {
            buffer += read()
            lexState = 'decimalExponentInteger'
            return
        }

        throw invalidChar(read())
    },

    decimalExponentSign () {
        if (util.isDigit(c)) {
            buffer += read()
            lexState = 'decimalExponentInteger'
            return
        }

        throw invalidChar(read())
    },

    decimalExponentInteger () {
        if (util.isDigit(c)) {
            buffer += read()
            return
        }

        return newToken('numeric', sign * Number(buffer))
    },

    hexadecimal () {
        if (util.isHexDigit(c)) {
            buffer += read()
            lexState = 'hexadecimalInteger'
            return
        }

        throw invalidChar(read())
    },

    hexadecimalInteger () {
        if (util.isHexDigit(c)) {
            buffer += read()
            return
        }

        return newToken('numeric', sign * Number(buffer))
    },

    string () {
        return newToken('string', readString())
    },

    start () {
        switch (c) {
        case '{':
        case '[':
            return newToken('punctuator', read())

        // This code is unreachable since the default lexState handles eof.
        // case undefined:
        //     return newToken('eof')
        }

        lexState = 'value'
    },

    beforePropertyName () {
        switch (c) {
        case '$':
        case '_':
            buffer = read()
            lexState = 'identifierName'
            return

        case '\\':
            read()
            lexState = 'identifierNameStartEscape'
            return

        case '}':
            return newToken('punctuator', read())

        case '"':
        case "'":
            stringSeparator = read()
            lexState = 'string'
            return
        }

        if (util.isIdStartChar(c)) {
            buffer += read()
            lexState = 'identifierName'
            return
        }

        throw invalidChar(read())
    },

    afterPropertyName () {
        if (c === ':') {
            return newToken('punctuator', read())
        }

        throw invalidChar(read())
    },

    beforePropertyValue () {
        lexState = 'value'
    },

    afterPropertyValue () {
        switch (c) {
        case ',':
        case '}':
            return newToken('punctuator', read())
        }

        throw invalidChar(read())
    },

    beforeArrayValue () {
        if (c === ']') {
            return newToken('punctuator', read())
        }

        lexState = 'value'
    },

    afterArrayValue () {
        switch (c) {
        case ',':
        case ']':
            return newToken('punctuator', read())
        }

        throw invalidChar(read())
    },

    end () {
        // This code is unreachable since it's handled by the default lexState.
        // if (c === undefined) {
        //     read()
        //     return newToken('eof')
        // }

        throw invalidChar(read())
    },
}

function invalidCharacter(match, offset, string){
    if (isEscapedChar(string, offset)){
	return match
    }
    
    switch(match){
    case '\n':
	if (string[offset-1] == '\r'){
	    return match
	}
    case '\r':
	throw invalidChar(match)
    case '\u2028':
    case '\u2029':
	separatorChar(match)
	return match
    }
}

function replacer(match, p1, offset, string) {
    //console.warn("match -->" + match + "<-- " + p1 + " pos: "+ offset)
    switch (p1){
    case 'b':
	return '\b'
    case 'f':
	return '\f'
    case 'n':
        return '\n'
    case 'r':
        return '\r'
    case 't':
        return '\t'
    case 'v':
        return '\v'
    case '0':
	if(util.isDigit(string[offset+2])) throw invalidChar(match + string[offset+2])
	return '\0'
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
        throw invalidChar(match)
    case 'x':
    case 'u':
	throw invalidChar(match)
    }
    return p1
}

function replacerHex(match, p1, p2, offset, string) {
    if (!util.isHexDigit(p1) || !util.isHexDigit(p2)){
	throw invalidChar(match)
    }
    buffer = p1 + p2
    return String.fromCodePoint(parseInt(buffer, 16))
}

function replacerUnicode(match, p1, p2, p3, p4, offset, string) {
    if (!util.isHexDigit(p1) || !util.isHexDigit(p2) || !util.isHexDigit(p3) || !util.isHexDigit(p4)){
	throw invalidChar(match)
    }
    buffer = p1 + p2 + p3 + p4
    return String.fromCodePoint(parseInt(buffer, 16))
}

function unescapeString (str) {
    str = str.replace(/[\r\n\u2028\u2029]/g, invalidCharacter)
    return str.replace(/\\u(.)(.)(.)(.)/g, replacerUnicode).replace(/\\x(.)(.)/g, replacerHex).replace(/\\[\r][\n]/g, '').replace(/\\(.)/g,replacer).replace(/\\([\n\r\u2028\u2029])/g, '')
}

function isEscapedChar(str, position){
    let numEscapeChars = 0
    while((position--) > 0 && str[position] == escapeChar){
	numEscapeChars += 1
    }
    return (numEscapeChars % 2 != 0)
}

function readString () {
    let from = pos
    const ss = stringSeparator.charAt(0)
    for(;;) {
        pos = source.indexOf(ss, pos)
	if (pos<0) throw invalidEOF()
	if (!isEscapedChar(source, pos)){
	    break;
	}
	pos++
    }
    let str = unescapeString(source.substring(from, pos))
    pos++
    return str
}

function newToken (type, value) {
    return {
        type,
        value,
        line,
        column,
    }
}

function literal (s) {
    for (const c of s) {
        const p = peek()

        if (p !== c) {
            throw invalidChar(read())
        }

        read()
    }
}

function unicodeEscape () {
    let buffer = ''
    let count = 4

    while (count-- > 0) {
        const c = peek()
        if (!util.isHexDigit(c)) {
            throw invalidChar(read())
        }

        buffer += read()
    }

    return String.fromCodePoint(parseInt(buffer, 16))
}

const parseStates = {
    start () {
        if (token.type === 'eof') {
            throw invalidEOF()
        }

        push()
    },

    beforePropertyName () {
        switch (token.type) {
        case 'identifier':
        case 'string':
            key = token.value
            parseState = 'afterPropertyName'
            return

        case 'punctuator':
            // This code is unreachable since it's handled by the lexState.
            // if (token.value !== '}') {
            //     throw invalidToken()
            // }

            pop()
            return

        case 'eof':
            throw invalidEOF()
        }

        // This code is unreachable since it's handled by the lexState.
        // throw invalidToken()
    },

    afterPropertyName () {
        // This code is unreachable since it's handled by the lexState.
        // if (token.type !== 'punctuator' || token.value !== ':') {
        //     throw invalidToken()
        // }

        if (token.type === 'eof') {
            throw invalidEOF()
        }

        parseState = 'beforePropertyValue'
    },

    beforePropertyValue () {
        if (token.type === 'eof') {
            throw invalidEOF()
        }

        push()
    },

    beforeArrayValue () {
        if (token.type === 'eof') {
            throw invalidEOF()
        }

        if (token.type === 'punctuator' && token.value === ']') {
            pop()
            return
        }

        push()
    },

    afterPropertyValue () {
        // This code is unreachable since it's handled by the lexState.
        // if (token.type !== 'punctuator') {
        //     throw invalidToken()
        // }

        if (token.type === 'eof') {
            throw invalidEOF()
        }

        switch (token.value) {
        case ',':
            parseState = 'beforePropertyName'
            return

        case '}':
            pop()
        }

        // This code is unreachable since it's handled by the lexState.
        // throw invalidToken()
    },

    afterArrayValue () {
        // This code is unreachable since it's handled by the lexState.
        // if (token.type !== 'punctuator') {
        //     throw invalidToken()
        // }

        if (token.type === 'eof') {
            throw invalidEOF()
        }

        switch (token.value) {
        case ',':
            parseState = 'beforeArrayValue'
            return

        case ']':
            pop()
        }

        // This code is unreachable since it's handled by the lexState.
        // throw invalidToken()
    },

    end () {
        // This code is unreachable since it's handled by the lexState.
        // if (token.type !== 'eof') {
        //     throw invalidToken()
        // }
    },
}

function push () {
    let value

    switch (token.type) {
    case 'punctuator':
        switch (token.value) {
        case '{':
            value = {}
            break

        case '[':
            value = []
            break
        }

        break

    case 'null':
    case 'boolean':
    case 'numeric':
    case 'string':
        value = token.value
        break

    // This code is unreachable.
    // default:
    //     throw invalidToken()
    }

    if (root === undefined) {
        root = value
    } else {
        const parent = stack[stack.length - 1]
        if (Array.isArray(parent)) {
            parent.push(value)
        } else {
            parent[key] = value
        }
    }

    if (value !== null && typeof value === 'object') {
        stack.push(value)

        if (Array.isArray(value)) {
            parseState = 'beforeArrayValue'
        } else {
            parseState = 'beforePropertyName'
        }
    } else {
        const current = stack[stack.length - 1]
        if (current == null) {
            parseState = 'end'
        } else if (Array.isArray(current)) {
            parseState = 'afterArrayValue'
        } else {
            parseState = 'afterPropertyValue'
        }
    }
}

function pop () {
    stack.pop()

    const current = stack[stack.length - 1]
    if (current == null) {
        parseState = 'end'
    } else if (Array.isArray(current)) {
        parseState = 'afterArrayValue'
    } else {
        parseState = 'afterPropertyValue'
    }
}

// This code is unreachable.
// function invalidParseState () {
//     return new Error(`JSON5: invalid parse state '${parseState}'`)
// }

// This code is unreachable.
// function invalidLexState (state) {
//     return new Error(`JSON5: invalid lex state '${state}'`)
// }

function invalidChar (c) {
    if (c === undefined) {
        return syntaxError(`JSON5: invalid end of input at ${line}:${column}`)
    }

    if (c.length > 1) {
	return syntaxError(`JSON5: invalid sequence '${formatChar(c)}' at ${line}:${column}`)
    }

    return syntaxError(`JSON5: invalid character '${formatChar(c)}' at ${line}:${column}`)
}

function invalidEOF () {
    return syntaxError(`JSON5: invalid end of input at ${line}:${column}`)
}

// This code is unreachable.
// function invalidToken () {
//     if (token.type === 'eof') {
//         return syntaxError(`JSON5: invalid end of input at ${line}:${column}`)
//     }

//     const c = String.fromCodePoint(token.value.codePointAt(0))
//     return syntaxError(`JSON5: invalid character '${formatChar(c)}' at ${line}:${column}`)
// }

function invalidIdentifier () {
    column -= 5
    return syntaxError(`JSON5: invalid identifier character at ${line}:${column}`)
}

function separatorChar (c) {
    console.warn(`JSON5: '${formatChar(c)}' in strings is not valid ECMAScript; consider escaping`)
}

function formatChar (c) {
    const replacements = {
        "'": "\\'",
        '"': '\\"',
        '\\': '\\\\',
        '\b': '\\b',
        '\f': '\\f',
        '\n': '\\n',
        '\r': '\\r',
        '\t': '\\t',
        '\v': '\\v',
        '\0': '\\0',
        '\u2028': '\\u2028',
        '\u2029': '\\u2029',
    }

    if (replacements[c]) {
        return replacements[c]
    }

    if (c < ' ') {
        const hexString = c.charCodeAt(0).toString(16)
        return '\\x' + ('00' + hexString).substring(hexString.length)
    }

    return c
}

function syntaxError (message) {
    const err = new SyntaxError(message)
    err.lineNumber = line
    err.columnNumber = column
    return err
}
