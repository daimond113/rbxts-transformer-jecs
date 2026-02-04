import ts from "typescript"
import { TransformState } from "./transforms/index.js"
import assert from "assert"

export const toArray = <T>(item: T | T[]) => (Array.isArray(item) ? item : [item])

export const getLeadingTrivia = (node: ts.Node) => node.getFullText().substring(0, node.getLeadingTriviaWidth())

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

export const staticDeclarations = (state: TransformState, node: ts.Node, canHaveCalls = true): ts.Statement[] => {
	if (ts.isIdentifier(node)) {
		const symbol = state.typeChecker.getSymbolAtLocation(node)
		const decls = symbol?.declarations
		if (!decls) {
			return []
		}

		let stmt: ts.Node = decls[0]
		while (!ts.isStatement(stmt)) {
			// function parameters are considered dynamic
			if (ts.isParameter(stmt)) {
				return []
			}
			// if the variable isn't initialized it is considered dynamic
			if (ts.isVariableDeclaration(stmt) && stmt.initializer === undefined) {
				return []
			}
			stmt = stmt.parent
		}

		if (stmt.parent !== state.currentCache().node && stmt.parent.kind !== ts.SyntaxKind.SourceFile) {
			return []
		}

		return [stmt]
	} else if (ts.isCallExpression(node) && canHaveCalls) {
		const exprDecls = staticDeclarations(state, node.expression)
		if (!exprDecls.length) return []

		const argsDecls = []
		for (const arg of node.arguments) {
			const decls = staticDeclarations(state, arg)
			if (!decls.length) return []
			argsDecls.push(...decls)
		}
		if (!argsDecls.length) return []

		return [...exprDecls, ...argsDecls]
	} else if (ts.isPropertyAccessExpression(node)) {
		if (ts.isPrivateIdentifier(node.name)) return []

		const nameDecls = staticDeclarations(state, node.name)
		if (!nameDecls.length) return []

		const exprDecls = staticDeclarations(state, node.expression)
		if (!exprDecls.length) return []

		return [...nameDecls, ...exprDecls]
	} else {
		return []
	}
}

export function staticCtToTypeNode(state: TransformState, node: ts.Node): ts.TypeNode {
	if (ts.isIdentifier(node)) return ts.factory.createTypeQueryNode(node)
	else if (ts.isPropertyAccessExpression(node)) {
		return ts.factory.createTypeQueryNode(generateQualifiedName(node))
	} else if (ts.isCallExpression(node)) {
		return state.jecsType(
			"Pair",
			state.jecsType("InferComponent", staticCtToTypeNode(state, node.arguments[0])),
			state.jecsType("InferComponent", staticCtToTypeNode(state, node.arguments[1])),
		)
	}

	throw new Error(`Unsupported query component type: ${ts.SyntaxKind[node.kind]}`)
}

export function generateQualifiedName(node: ts.PropertyAccessExpression): ts.QualifiedName {
	let left: ts.QualifiedName | ts.Identifier
	if (ts.isPropertyAccessExpression(node.expression)) {
		left = generateQualifiedName(node.expression)
	} else {
		assert(ts.isIdentifier(node.expression))
		left = node.expression
	}

	assert(ts.isIdentifier(node.name)) // can safely assert, because it wouldn't cache if it was a private identifier
	return ts.factory.createQualifiedName(left, node.name)
}

// FIXME: because symbols such as Query's are generic, the symbols received from the type checker differ.
// we should find a better way to compare them, if such a way exists.
export const genericSymbolsAreEqual = (a: ts.Symbol, b: ts.Symbol) =>
	a.declarations && b.declarations && a.declarations[0] === b.declarations[0]
