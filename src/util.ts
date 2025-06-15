import ts from "typescript"

export function findMatchingChild<T extends ts.Node>(
	node: ts.Node,
	predicate: (child: ts.Node) => child is T,
): T | undefined
export function findMatchingChild(node: ts.Node, predicate: (child: ts.Node) => boolean): ts.Node | undefined {
	let found

	function visit(child: ts.Node) {
		if (predicate(child)) {
			found = child
			return
		}
		ts.forEachChild(child, visit)
	}

	ts.forEachChild(node, visit)
	return found
}

export const getTrivia = (node: ts.Node) => node.getFullText().substring(0, node.getLeadingTriviaWidth())

const NOOP = () => {}

export const isStatic = (
	typeChecker: ts.TypeChecker,
	sourceFile: ts.SourceFile,
	node: ts.Node,
	cb: (stmt: ts.Statement) => void = NOOP,
): node is ts.Identifier => {
	// if it's not an identifier it is an expression or a statement
	if (!ts.isIdentifier(node)) {
		return false
	}

	const symbol = typeChecker.getSymbolAtLocation(node)
	const decls = symbol?.declarations
	if (!decls) {
		return false
	}

	let stmt: ts.Node = decls[0]
	while (!ts.isStatement(stmt)) {
		// function parameters are considered dynamic
		if (ts.isParameter(stmt)) {
			return false
		}
		stmt = stmt.parent
	}
	if (!stmt) return false

	// if the statement isn't declared at the root of the file the declaration is considered dynamic
	if (stmt.parent !== sourceFile) {
		return false
	}

	cb(stmt)

	return true
}

export const getSymbolDeclStatement = (symbol: ts.Symbol) => {
	const decls = symbol?.declarations
	if (!decls) {
		return
	}

	let stmt: ts.Node = decls[0]
	while (!ts.isStatement(stmt)) {
		stmt = stmt.parent
	}
	return stmt
}

export const getReturnType = (typeChecker: ts.TypeChecker, node: ts.CallExpression) =>
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	typeChecker.getReturnTypeOfSignature(typeChecker.getResolvedSignature(node)!)
