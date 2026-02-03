import ts from "typescript"
import type { TransformState } from "../index.js"
import { findMatchingChild, getLeadingTrivia, staticCtToTypeNode, staticDeclarations } from "../../util.js"

export function transformCallExpression(
	state: TransformState,
	expression: ts.CallExpression,
): ts.Expression | undefined {
	return transformQuery(state, expression)
}

function transformQuery(state: TransformState, expression: ts.CallExpression): ts.Expression | undefined {
	if (getLeadingTrivia(expression).includes("no-cache")) return
	const signature = state.typeChecker.getResolvedSignature(expression)
	if (!signature) return
	if (signature.getReturnType().aliasSymbol !== state.jecs.query.symbol) return
	let queryCreation: ts.CallExpression | undefined = expression
	if (!isQueryCreation(state, expression)) {
		queryCreation = findMatchingChild(expression, (node) => isQueryCreation(state, node))
	}
	if (!queryCreation) return

	const [valid, componentDecls, queryComponentsType] = parseQuery(state, queryCreation)
	if (!valid) {
		if (!state.config.silent) {
			console.warn(
				`'${componentDecls.getText()}' isn't simple. Query '${expression.getText()}' will not be cached.`,
			)
		}
		return
	}

	let world = queryCreation.expression
	if (!ts.isPropertyAccessExpression(world)) {
		console.warn(`Unsupported world.query access type: ${ts.SyntaxKind[world.kind]}`)
		return
	}
	world = world.expression

	const worldDecls = staticDeclarations(state, world)

	// Skip if world isn't statically declared (e.g., function parameter)
	// because we can't cache at file level without access to the world
	if (!worldDecls.length) {
		return
	}

	const cache = worldDecls.some((stmt) => stmt.parent.kind === ts.SyntaxKind.SourceFile)
		? state.fileCache()
		: state.currentCache()

	cache.require(worldDecls)
	cache.require(componentDecls)

	const queryIdentifier = ts.factory.createUniqueName("query")
	const archetypesIdentifier = ts.factory.createUniqueName("archetypes")

	const expressionCached = ts.factory.createCallExpression(
		ts.factory.createPropertyAccessExpression(expression, "cached"),
		undefined,
		undefined,
	)
	const queryArchetypes = ts.factory.createCallExpression(
		ts.factory.createPropertyAccessExpression(queryIdentifier, "archetypes"),
		undefined,
		undefined,
	)

	if (cache !== state.fileCache()) {
		const queryVarDecl = ts.factory.createVariableDeclaration(
			queryIdentifier,
			undefined,
			state.jecsType("CachedQuery", queryComponentsType()),
			undefined,
		)
		const archetypesVarDecl = ts.factory.createVariableDeclaration(
			archetypesIdentifier,
			undefined,
			ts.factory.createTypeReferenceNode("ReturnType", [
				ts.factory.createIndexedAccessTypeNode(
					ts.factory.createTypeQueryNode(queryIdentifier),
					ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral("archetypes")),
				),
			]),
		)
		cache.outerResult(
			ts.factory.createVariableStatement(
				undefined,
				ts.factory.createVariableDeclarationList([queryVarDecl, archetypesVarDecl], ts.NodeFlags.Let),
			),
		)

		cache.conditioned(world)

		const queryAssignment = ts.factory.createAssignment(queryIdentifier, expressionCached)
		const archetypesAssignment = ts.factory.createAssignment(archetypesIdentifier, queryArchetypes)
		cache.innerResult([
			ts.factory.createExpressionStatement(queryAssignment),
			ts.factory.createExpressionStatement(archetypesAssignment),
		])
	} else {
		const queryVarDecl = ts.factory.createVariableDeclaration(
			queryIdentifier,
			undefined,
			undefined,
			expressionCached,
		)
		const archetypesVarDecl = ts.factory.createVariableDeclaration(
			archetypesIdentifier,
			undefined,
			undefined,
			queryArchetypes,
		)
		cache.outerResult(
			ts.factory.createVariableStatement(
				undefined,
				ts.factory.createVariableDeclarationList([queryVarDecl, archetypesVarDecl], ts.NodeFlags.Const),
			),
		)
	}

	return queryIdentifier
}

function isQueryCreation(state: TransformState, node: ts.Node): node is ts.CallExpression {
	return (
		ts.isCallExpression(node) && state.typeChecker.getSymbolAtLocation(node.expression) === state.jecs.world.query
	)
}

function parseQuery(
	state: TransformState,
	expression: ts.CallExpression,
): [true, ts.Statement[], () => ts.TupleTypeNode] | [false, ts.Expression] {
	const declarationStmts = new Array<ts.Statement>()
	const queryCts = new Array<ts.Node>()

	const symbols = [state.jecs.world.query, state.jecs.query.with, state.jecs.query.without]

	const visit = (node: ts.Node): ts.Expression | undefined => {
		if (ts.isCallExpression(node)) {
			const symbol = state.typeChecker.getSymbolAtLocation(node.expression)
			if (!symbol) return node

			// FIXME: because Query is generic, the symbols will be different.
			// we compare the declarations because as far as i know there is no other way.
			const container = symbols.find(
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				(s) => s.declarations![0] === symbol.declarations![0],
			)
			if (container) {
				for (const ct of node.arguments) {
					const declarations = staticDeclarations(state, ct)
					if (!declarations.length) {
						return ct
					}
					declarationStmts.push(...declarations)

					if (symbol === state.jecs.world.query) {
						queryCts.push(ct)
					}
				}
			}
		}

		return ts.forEachChild(node, visit)
	}

	const fault = visit(expression)
	if (fault) return [false, fault]
	return [
		true,
		declarationStmts,
		() => ts.factory.createTupleTypeNode(queryCts.map((ct) => staticCtToTypeNode(state, ct))),
	]
}
