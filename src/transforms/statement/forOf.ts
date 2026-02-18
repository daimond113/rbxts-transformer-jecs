import ts from "typescript"
import { TransformState } from "../index.js"
import { genericSymbolsAreEqual, staticDeclarations } from "../../util.js"
import { transformExpression } from "../expression/index.js"

export function transformForOfStatement(
	state: TransformState,
	node: ts.ForOfStatement,
): ts.Statement | ts.Statement[] | undefined {
	return inlineQueryIterators(state, node)
}

function inlineQueryIterators(
	state: TransformState,
	node: ts.ForOfStatement,
): ts.Statement | ts.Statement[] | undefined {
	if (!ts.isVariableDeclarationList(node.initializer)) return
	const declaration = node.initializer.declarations[0]
	if (!ts.isArrayBindingPattern(declaration.name)) return

	if (ts.isCallExpression(node.expression)) {
		const signature = state.typeChecker.getResolvedSignature(node.expression)
		if (!signature) return
		const symbol = signature.getReturnType().aliasSymbol
		if (!symbol) return

		if (![state.jecs.query.symbol, state.jecs.cachedQuery.symbol].some((s) => genericSymbolsAreEqual(s, symbol)))
			return
	}

	const expression = transformExpression(state, node.expression)
	const cached = ts.isIdentifier(expression) ? state.cachedQueries.get(expression) : undefined

	const archetypes = cached
		? cached.archetypes
		: ts.isCallExpression(expression) || ts.isIdentifier(expression)
			? ts.factory.createCallExpression(
					ts.factory.createPropertyAccessExpression(expression, "archetypes"),
					undefined,
					[],
				)
			: undefined

	if (!archetypes) return

	const components = cached ? cached.components : findQueryComponents(state, expression)
	if (!components) return

	const archetype = ts.factory.createUniqueName("archetype")
	const entities = ts.factory.createUniqueName("entities")
	const field = ts.factory.createUniqueName("field")
	const row = ts.factory.createUniqueName("row")

	const [entity, ...componentIdentifiers] = declaration.name.elements

	const cts: Cts = [
		...componentIdentifiers
			.slice(0, components.length)
			.map((identifier, i) => [identifier, components[i]] as const)
			.flatMap(([identifier, componentInstance]) =>
				ts.isOmittedExpression(identifier) ? [] : [[identifier.name, componentInstance] as const],
			)
			.map(([identifier, componentInstance]) => {
				const componentValueListIdentifier = ts.factory.getGeneratedNameForNode(componentInstance)

				// roblox-ts would add + 1 here, so we cancel it out
				const normalizedRow = ts.factory.createBinaryExpression(
					row,
					ts.factory.createToken(ts.SyntaxKind.MinusToken),
					ts.factory.createNumericLiteral("1"),
				)
				// non-null to support noUncheckedIndexedAccess
				const componentValue = ts.factory.createNonNullExpression(
					ts.factory.createElementAccessExpression(componentValueListIdentifier, normalizedRow),
				)

				return [
					componentInstance,
					componentValueListIdentifier,
					ts.factory.createVariableDeclaration(identifier, undefined, undefined, componentValue),
				] as const
			}),
		...componentIdentifiers.slice(components.length).flatMap((identifier) => {
			if (ts.isOmittedExpression(identifier)) return []

			return [
				[
					undefined,
					undefined,
					ts.factory.createVariableDeclaration(
						identifier.name,
						undefined,
						undefined,
						ts.factory.createIdentifier("undefined"),
					),
				],
			] as const
		}),
	]

	let brokenVariable: ts.Identifier | undefined

	const fixBreak = (node: ts.Node) => {
		// breaks will target them
		if (ts.isIterationStatement(node, true) || ts.isSwitchStatement(node)) {
			return node
		}

		if (ts.isBreakStatement(node)) {
			brokenVariable ??= ts.factory.createUniqueName("broken")
			return ts.factory.createBlock([
				ts.factory.createExpressionStatement(
					ts.factory.createAssignment(brokenVariable, ts.factory.createTrue()),
				),
				ts.factory.createBreakStatement(),
			])
		}

		return ts.visitEachChild(node, fixBreak, state.context)
	}

	const statement = ts.visitEachChild(node.statement, fixBreak, state.context)

	return outerLoop(
		entities,
		archetype,
		archetypes,
		field,
		cts,
		innerLoop(row, entities, entity, cts, state.transform(statement)),
		brokenVariable,
	)
}

type Cts = ReadonlyArray<
	readonly [...([ts.Expression, ts.Identifier] | [undefined, undefined]), ts.VariableDeclaration]
>

function outerLoop(
	entities: ts.Identifier,
	archetype: ts.Identifier,
	archetypes: ts.Expression,
	field: ts.Identifier,
	cts: Cts,
	innerLoop: ts.Statement,
	brokenVariable: ts.Identifier | undefined,
): ts.Statement {
	const entitiesDecl = ts.factory.createVariableStatement(
		undefined,
		ts.factory.createVariableDeclarationList(
			[
				ts.factory.createVariableDeclaration(
					entities,
					undefined,
					undefined,
					ts.factory.createPropertyAccessExpression(archetype, ts.factory.createIdentifier("entities")),
				),
			],
			ts.NodeFlags.Const,
		),
	)

	const ctsDecls =
		cts.length &&
		ts.factory.createVariableStatement(
			undefined,
			ts.factory.createVariableDeclarationList(
				[
					ts.factory.createVariableDeclaration(
						field,
						undefined,
						undefined,
						ts.factory.createPropertyAccessExpression(
							archetype,
							ts.factory.createIdentifier("columns_map"),
						),
					),
					...cts.flatMap(([componentInstance, componentValueListIdentifier]) =>
						componentInstance
							? [
									ts.factory.createVariableDeclaration(
										componentValueListIdentifier,
										undefined,
										undefined,
										ts.factory.createNonNullExpression(
											ts.factory.createElementAccessExpression(field, componentInstance),
										),
									),
								]
							: [],
					),
				],
				ts.NodeFlags.Const,
			),
		)
	const brokenVariableDecl =
		brokenVariable &&
		ts.factory.createVariableStatement(
			undefined,
			ts.factory.createVariableDeclarationList(
				[ts.factory.createVariableDeclaration(brokenVariable, undefined, undefined, ts.factory.createFalse())],
				ts.NodeFlags.Let,
			),
		)

	return ts.factory.createForOfStatement(
		undefined,
		ts.factory.createVariableDeclarationList(
			[ts.factory.createVariableDeclaration(archetype, undefined, undefined, undefined)],
			ts.NodeFlags.Const,
		),
		archetypes,
		ts.factory.createBlock(
			[
				entitiesDecl,
				...(ctsDecls ? [ctsDecls] : []),
				...(brokenVariableDecl ? [brokenVariableDecl] : []),
				innerLoop,
				...(brokenVariable
					? [ts.factory.createIfStatement(brokenVariable, ts.factory.createBreakStatement())]
					: []),
			],
			true,
		),
	)
}

function innerLoop(
	row: ts.Identifier,
	entities: ts.Identifier,
	entity: ts.ArrayBindingElement,
	cts: Cts,
	statements: ts.Statement | ts.Statement[],
): ts.Statement {
	const rowDecl = ts.factory.createVariableDeclarationList(
		[ts.factory.createVariableDeclaration(row, undefined, undefined, undefined)],
		ts.NodeFlags.Const,
	)
	// iterate in reverse to prevent iterator invalidation
	const rangeExpr = ts.factory.createCallExpression(ts.factory.createIdentifier("$range"), undefined, [
		ts.factory.createCallExpression(
			ts.factory.createPropertyAccessExpression(entities, ts.factory.createIdentifier("size")),
			undefined,
			[],
		),
		ts.factory.createNumericLiteral("1"),
		ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, ts.factory.createNumericLiteral("1")),
	])

	const entityDecl =
		!ts.isOmittedExpression(entity) &&
		ts.factory.createVariableStatement(
			undefined,
			ts.factory.createVariableDeclarationList(
				[
					ts.factory.createVariableDeclaration(
						entity.name,
						undefined,
						undefined,
						ts.factory.createNonNullExpression(
							ts.factory.createElementAccessExpression(
								entities,
								ts.factory.createBinaryExpression(
									row,
									ts.factory.createToken(ts.SyntaxKind.MinusToken),
									ts.factory.createNumericLiteral("1"),
								),
							),
						),
					),
				],
				ts.NodeFlags.Const,
			),
		)

	const ctsDecls = cts.length
		? ts.factory.createVariableStatement(
				undefined,
				ts.factory.createVariableDeclarationList(
					cts.map(([, , decl]) => decl),
					ts.NodeFlags.Const,
				),
			)
		: undefined

	const unpackedStatements = Array.isArray(statements) && statements.length === 1 ? statements[0] : statements

	return ts.factory.createForOfStatement(
		undefined,
		rowDecl,
		rangeExpr,
		ts.factory.createBlock(
			[
				...(entityDecl ? [entityDecl] : []),
				...(ctsDecls ? [ctsDecls] : []),
				Array.isArray(unpackedStatements)
					? ts.factory.createBlock(unpackedStatements, true)
					: unpackedStatements,
			],
			true,
		),
	)
}

// different from callExpression's parseQuery in that it follows identifiers to their declarations, since the query components aren't directly present on the for-of expression's query
function findQueryComponents(
	state: TransformState,
	expression: ts.Expression,
	visited = new Set<ts.Node>(),
): ts.Expression[] | undefined {
	if (visited.has(expression)) return
	visited.add(expression)

	if (ts.isCallExpression(expression)) {
		if (ts.isPropertyAccessExpression(expression.expression)) {
			const symbol = state.typeChecker.getSymbolAtLocation(expression.expression)
			if (
				symbol &&
				[state.jecs.query.with, state.jecs.query.without, state.jecs.query.cached].some((s) =>
					genericSymbolsAreEqual(s, symbol),
				)
			) {
				return findQueryComponents(state, expression.expression.expression, visited)
			}
		}
		const symbol = state.typeChecker.getSymbolAtLocation(expression.expression)
		if (symbol && genericSymbolsAreEqual(state.jecs.world.query, symbol)) {
			const cts = new Array<ts.Expression>()
			for (const ct of expression.arguments) {
				const decls = staticDeclarations(state, ct)
				if (!decls.length) return
				cts.push(ct)
			}
			return cts
		}
	} else if (ts.isIdentifier(expression)) {
		const symbol = state.typeChecker.getSymbolAtLocation(expression)
		if (!symbol) return

		const declaration = symbol.valueDeclaration
		if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer) return
		return findQueryComponents(state, declaration.initializer, visited)
	}
}
