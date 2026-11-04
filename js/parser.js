// js/parser.js
class ExprParser {
    static tokenize(input) {
        let tokens = [];
        let pos = 0;
        // Regex matches: Numbers, Identifiers/Keywords, and Operators/Parens
        const regex = /\s*(?:(\d+(?:\.\d+)?)|([a-zA-Z_]\w*)|(==|!=|>=|<=|>|<|\*\*|\/\/|[+\-*/%()]))\s*/y;

        while (pos < input.length) {
            regex.lastIndex = pos;
            let match = regex.exec(input);
            if (!match) throw new Error(`Syntax error at index ${pos}: Invalid character.`);

            if (match[1]) tokens.push({ type: 'NUMBER', value: parseFloat(match[1]) });
            else if (match[2]) {
                const id = match[2];
                if (['and', 'or', 'not'].includes(id)) tokens.push({ type: id.toUpperCase() });
                else if (id === 'True') tokens.push({ type: 'BOOLEAN', value: true });
                else if (id === 'False') tokens.push({ type: 'BOOLEAN', value: false });
                else tokens.push({ type: 'ID', value: id });
            }
            else if (match[3]) tokens.push({ type: match[3] });

            pos = regex.lastIndex;
        }
        tokens.push({ type: 'EOF' });
        return tokens;
    }

    static parse(tokens) {
        let current = 0;
        const peek = () => tokens[current];
        const consume = () => tokens[current++];

        const parseOr = () => {
            let node = parseAnd();
            while (peek().type === 'OR') { consume(); node = { type: 'Binary', op: 'or', left: node, right: parseAnd() }; }
            return node;
        };

        const parseAnd = () => {
            let node = parseNot();
            while (peek().type === 'AND') { consume(); node = { type: 'Binary', op: 'and', left: node, right: parseNot() }; }
            return node;
        };

        const parseNot = () => {
            if (peek().type === 'NOT') { consume(); return { type: 'Unary', op: 'not', right: parseNot() }; }
            return parseComparison();
        };

        const parseComparison = () => {
            let node = parseArith();
            const ops = ['==', '!=', '>', '<', '>=', '<='];
            while (ops.includes(peek().type)) { node = { type: 'Binary', op: consume().type, left: node, right: parseArith() }; }
            return node;
        };

        const parseArith = () => {
            let node = parseTerm();
            while (['+', '-'].includes(peek().type)) { node = { type: 'Binary', op: consume().type, left: node, right: parseTerm() }; }
            return node;
        };

        const parseTerm = () => {
            let node = parseFactor();
            while (['*', '/', '//', '%'].includes(peek().type)) { node = { type: 'Binary', op: consume().type, left: node, right: parseFactor() }; }
            return node;
        };

        const parseFactor = () => {
            if (['+', '-'].includes(peek().type)) { return { type: 'Unary', op: consume().type, right: parseFactor() }; }
            return parsePower();
        };

        const parsePower = () => {
            let node = parseAtom();
            while (peek().type === '**') { consume(); node = { type: 'Binary', op: '**', left: node, right: parseFactor() }; } // Right-associative
            return node;
        };

        const parseAtom = () => {
            const token = consume();
            if (token.type === 'NUMBER' || token.type === 'BOOLEAN') return { type: 'Literal', value: token.value };
            if (token.type === 'ID') return { type: 'Variable', name: token.value };
            if (token.type === '(') {
                const node = parseOr();
                if (consume().type !== ')') throw new Error("Missing closing parenthesis ')'");
                return node;
            }
            throw new Error(`Unexpected token: ${token.type === 'EOF' ? 'End of Expression' : token.value || token.type}`);
        };

        const ast = parseOr();
        if (peek().type !== 'EOF') throw new Error("Unexpected tokens at the end of expression.");
        return ast;
    }

    static evaluate(node, env) {
        if (node.type === 'Literal') return node.value;
        if (node.type === 'Variable') {
            if (!(node.name in env)) throw new Error(`Undefined variable: ${node.name}`);
            return env[node.name];
        }
        if (node.type === 'Unary') {
            const right = this.evaluate(node.right, env);
            if (node.op === '+') return +right;
            if (node.op === '-') return -right;
            if (node.op === 'not') return !right;
        }
        if (node.type === 'Binary') {
            const left = this.evaluate(node.left, env);
            // Short-circuit logic
            if (node.op === 'and') return left && this.evaluate(node.right, env);
            if (node.op === 'or') return left || this.evaluate(node.right, env);

            const right = this.evaluate(node.right, env);
            switch (node.op) {
                case '+': return left + right; case '-': return left - right;
                case '*': return left * right; case '/':
                    if (right === 0) throw new Error("Division by zero"); return left / right;
                case '//':
                    if (right === 0) throw new Error("Division by zero"); return Math.floor(left / right);
                case '%': return left % right; case '**': return left ** right;
                case '==': return left === right; case '!=': return left !== right;
                case '>': return left > right; case '<': return left < right;
                case '>=': return left >= right; case '<=': return left <= right;
            }
        }
        throw new Error("Unknown AST node");
    }

    static run(expression, env) {
        if (!expression.trim()) return true; // Empty evaluates to True
        const tokens = this.tokenize(expression);
        const ast = this.parse(tokens);
        return this.evaluate(ast, env);
    }
}