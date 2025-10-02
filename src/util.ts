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

export const NOOP = () => {}

export type Static =
	| ts.Identifier
	| (Omit<ts.CallExpression, "arguments"> & { expression: ts.Identifier; arguments: ts.NodeArray<ts.Identifier> })

export const isStatic = (
	typeChecker: ts.TypeChecker,
	sourceFile: ts.SourceFile,
	node: ts.Node,
	cb: (stmt: ts.Statement) => void = NOOP,
	canHaveCalls = true,
): node is Static => {
	if (ts.isIdentifier(node)) {
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
		// if the statement isn't declared at the root of the file the declaration is considered dynamic
		if (stmt?.parent.kind !== ts.SyntaxKind.SourceFile) {
			return false
		}

		cb(stmt)
		return true
	} else if (ts.isCallExpression(node) && canHaveCalls) {
		return (
			isStatic(typeChecker, sourceFile, node.expression, cb) &&
			node.arguments.every((argument) => isStatic(typeChecker, sourceFile, argument, cb, false))
		)
	} else {
		return false
	}
}

export const isLocallyDeclared = (symbol: ts.Symbol): boolean => {
	const decls = symbol?.declarations
	if (!decls) return false

	let node: ts.Node = decls[0]
	while (!ts.isStatement(node)) {
		if (ts.isParameter(node)) {
			return false
		}
		node = node.parent
	}

	return node.parent.kind !== ts.SyntaxKind.SourceFile
}

export const hasInitializer = (symbol: ts.Symbol): boolean => {
	const decls = symbol?.declarations
	if (!decls) return false

	const decl = decls[0]

	// Variable declarations may or may not have initializers
	if (ts.isVariableDeclaration(decl)) {
		return decl.initializer !== undefined
	}

	// Parameters are "initialized" by the caller
	if (ts.isParameter(decl)) {
		return true
	}

	// Other declarations (imports, functions, etc.) are considered initialized
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
