import ts from "typescript"
import type { TransformState } from "../index.js"
import {
	findMatchingChild,
	genericSymbolsAreEqual,
	getLeadingTrivia,
	staticCtToTypeNode,
	staticDeclarations,
} from "../../util.js"

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

	let parent = queryCreation.parent
	while (ts.isPropertyAccessExpression(parent) && ts.isCallExpression(parent.parent)) {
		const symbol = state.typeChecker.getSymbolAtLocation(parent)
		// if the query is manually cached, do not cache it again
		if (symbol && genericSymbolsAreEqual(symbol, state.jecs.query.cached)) return
		parent = parent.parent.parent
	}
	if (!ts.isForOfStatement(parent)) return

	const [valid, componentDecls, queryComponents] = parseQuery(state, queryCreation)
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

	const cache = worldDecls.some((stmt) => stmt.parent.kind === ts.SyntaxKind.SourceFile)
		? state.fileCache(world)
		: state.currentCache(world)

	cache.require(worldDecls)
	cache.require(componentDecls)

	const queryIdentifier = ts.factory.createUniqueName("query")
	const archetypesIdentifier = ts.factory.createUniqueName("archetypes")
	state.cachedQueries.set(queryIdentifier, { archetypes: archetypesIdentifier, components: queryComponents })

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

	if (worldDecls.length) {
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
	} else {
		const queryVarDecl = ts.factory.createVariableDeclaration(
			queryIdentifier,
			undefined,
			state.jecsType(
				"CachedQuery",
				ts.factory.createTupleTypeNode(queryComponents.map((ct) => staticCtToTypeNode(state, ct))),
			),
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
	}

	return queryIdentifier
}

function isQueryCreation(state: TransformState, node: ts.Node): node is ts.CallExpression {
	return (
		ts.isCallExpression(node) && state.typeChecker.getSymbolAtLocation(node.expression) === state.jecs.world.query
	)
}

export function parseQuery(
	state: TransformState,
	expression: ts.CallExpression,
): [true, ts.Statement[], ts.Expression[]] | [false, ts.Expression, ts.Expression[]] {
	const declarationStmts = new Array<ts.Statement>()
	const queryComponents = new Array<ts.Expression>()

	const symbols = [state.jecs.world.query, state.jecs.query.with, state.jecs.query.without]

	let fault: ts.Expression | undefined = undefined

	const visit = (node: ts.Node): ts.Node | undefined => {
		if (ts.isCallExpression(node)) {
			const symbol = state.typeChecker.getSymbolAtLocation(node.expression)
			// FIXME: because Query is generic, the symbols will be different.
			// we compare the declarations because as far as i know there is no other way.
			const container = symbol && symbols.find((s) => genericSymbolsAreEqual(s, symbol))
			if (container) {
				for (const ct of node.arguments) {
					const declarations = staticDeclarations(state, ct)
					if (!declarations.length) {
						fault = ct
					}
					declarationStmts.push(...declarations)

					if (symbol === state.jecs.world.query) {
						queryComponents.push(ct)
					}
				}
			}
		}

		return ts.forEachChild(node, visit)
	}

	visit(expression)
	if (fault) return [false, fault, queryComponents]
	return [true, declarationStmts, queryComponents]
}
