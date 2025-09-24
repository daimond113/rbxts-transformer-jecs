import ts from "typescript"
import {
	findMatchingChild,
	getReturnType,
	getSymbolDeclStatement,
	getTrivia,
	isStatic,
	NOOP,
	type Static,
} from "./util.js"
import assert from "node:assert"

type Config = { silent: boolean; jecsPackage: string }
type Transformer = (sourceFile: ts.SourceFile) => ts.SourceFile

const transformerInner = (
	program: ts.Program,
	context: ts.TransformationContext,
	sourceFile: ts.SourceFile,
	config?: Partial<Config>,
) => {
	const { silent = false, jecsPackage = "@rbxts/jecs" } = config ?? {}
	const typeChecker = program.getTypeChecker()

	const resolvedJecsPackage = ts.nodeModuleNameResolver(jecsPackage, sourceFile.fileName, { allowJs: true }, ts.sys)
	assert(resolvedJecsPackage?.resolvedModule, `Unable to resolve package '${jecsPackage}'`)

	const jecsSource = program.getSourceFile(resolvedJecsPackage.resolvedModule.resolvedFileName)
	assert(jecsSource, `Unable to find source file at '${resolvedJecsPackage.resolvedModule.resolvedFileName}'`)

	const jecsSymbol = typeChecker.getSymbolAtLocation(jecsSource)
	assert(
		jecsSymbol,
		`Unable to extract type information from Jecs at '${resolvedJecsPackage.resolvedModule.resolvedFileName}'`,
	)

	const jecsExports = typeChecker.getExportsOfModule(jecsSymbol)
	const querySymbol = jecsExports.find((s) => s.getName() === "Query")
	assert(
		querySymbol,
		`Unable to find Query type information from Jecs at '${resolvedJecsPackage.resolvedModule.resolvedFileName}'`,
	)
	const queryType = typeChecker.getDeclaredTypeOfSymbol(querySymbol)
	const cachedQuerySymbol = jecsExports.find((s) => s.getName() === "CachedQuery")
	assert(
		cachedQuerySymbol,
		`Unable to find CachedQuery type information from Jecs at '${resolvedJecsPackage.resolvedModule.resolvedFileName}'`,
	)
	const queryWithSymbol = queryType.getProperty("with")
	assert(
		queryWithSymbol,
		`Unable to find Query.with type information from Jecs at '${resolvedJecsPackage.resolvedModule.resolvedFileName}'`,
	)
	const queryWithoutSymbol = queryType.getProperty("without")
	assert(
		queryWithoutSymbol,
		`Unable to find Query.without type information from Jecs at '${resolvedJecsPackage.resolvedModule.resolvedFileName}'`,
	)
	const worldSymbol = jecsExports.find((s) => s.getName() === "World")
	assert(
		worldSymbol,
		`Unable to find World type information from Jecs at '${resolvedJecsPackage.resolvedModule.resolvedFileName}'`,
	)
	const worldType = typeChecker.getDeclaredTypeOfSymbol(worldSymbol)
	const queryMethodSymbol = worldType.getProperty("query")
	assert(
		queryMethodSymbol,
		`Unable to find World.query type information from Jecs at '${resolvedJecsPackage.resolvedModule.resolvedFileName}'`,
	)

	const parseQuery = (full: ts.CallExpression, updateInsertIndex: (stmt: ts.Statement) => void = NOOP) => {
		const components = {
			queried: [] as Static[],
			with: [] as Static[],
			without: [] as Static[],
		}

		const visit = (node: ts.Node): ts.Expression | undefined => {
			if (ts.isCallExpression(node)) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const symbol = typeChecker.getSymbolAtLocation(node.expression)!
				// FIXME: because Query is generic, the symbols will be different.
				// we compare the declarations because as far as i know there is no other way.
				const ctContainer = (
					[
						[queryMethodSymbol, components.queried],
						[queryWithSymbol, components.with],
						[queryWithoutSymbol, components.without],
					] as const
				).find(
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					([s]) => s.declarations![0] === symbol.declarations![0],
				)
				if (ctContainer) {
					for (const ct of node.arguments) {
						if (!isStatic(typeChecker, sourceFile, ct, updateInsertIndex)) {
							return ct
						}

						if (symbol === queryMethodSymbol) {
							ctContainer[1].push(ct)
						}
					}
				}
			}
			return ts.forEachChild(node, visit)
		}

		return visit(full) ?? components
	}

	/** world(symbol) -> queries */
	const queryMap = new Map<
		ts.Symbol,
		{ node: ts.Expression; archetypes: ts.Identifier; name: ts.Identifier; components: Static[] }[]
	>()

	const queryCacher: Transformer = (sourceFile) => {
		let insertIndex = -1
		const updateInsertIndex = (stmt: ts.Statement) => {
			const index = sourceFile.statements.indexOf(stmt)
			insertIndex = Math.max(insertIndex, index)
		}

		const decls = []
		/** world(symbol) -> declaration (usually import) or undefined if scoped */
		const worldGlobality = new Map<ts.Symbol, [ts.Identifier, ts.Block] | undefined>()

		const isQueryConstruction = (node: ts.Node): node is ts.CallExpression =>
			ts.isCallExpression(node) && typeChecker.getSymbolAtLocation(node.expression) === queryMethodSymbol

		const replacementQueue = new Map<ts.Node, ts.Node>()
		const complicatedQueries = new Set<ts.Node>()

		const parseSimple = (node: ts.CallExpression, queryConstruction?: ts.Node) => {
			if (!queryConstruction) {
				if (isQueryConstruction(node)) queryConstruction = node
				else queryConstruction = findMatchingChild(node, isQueryConstruction)
			}

			if (!queryConstruction) return undefined

			if (complicatedQueries.has(queryConstruction)) {
				return undefined
			}

			const faultOrComponents = parseQuery(node, updateInsertIndex)
			if (!("queried" in faultOrComponents)) {
				complicatedQueries.add(queryConstruction)
				if (!silent) {
					console.warn(
						`'${faultOrComponents.getText()}' isn't simple. Query '${node.getText()}' will not be cached.`,
					)
				}
				return undefined
			}

			return faultOrComponents
		}

		const cacheQueries = (node: ts.Node) => {
			if (ts.isCallExpression(node) && !getTrivia(node).includes("no-cache")) {
				let queryConstruction: ts.CallExpression | undefined = node
				if (
					getReturnType(typeChecker, node).aliasSymbol === querySymbol &&
					(isQueryConstruction(queryConstruction) ||
						(queryConstruction = findMatchingChild(queryConstruction, isQueryConstruction)))
				) {
					const components = parseSimple(node, queryConstruction)
					if (!components) return node

					let world = queryConstruction.expression
					if (!ts.isPropertyAccessExpression(world)) {
						console.warn(`Unsupported world.query access type: ${ts.SyntaxKind[world.kind]}`)
						return node
					}
					world = world.expression
					const worldSymbol = typeChecker.getSymbolAtLocation(world)
					assert(worldSymbol, "Cannot resolve type of world")
					if (!worldGlobality.has(worldSymbol)) {
						const worldKey = isStatic(typeChecker, sourceFile, world)
							? undefined
							: ts.factory.createUniqueName("worldKey")
						if (worldKey) {
							const block = ts.factory.createBlock([
								ts.factory.createExpressionStatement(ts.factory.createAssignment(worldKey, world)),
							])

							context.addInitializationStatement(
								ts.factory.createIfStatement(
									ts.factory.createStrictInequality(worldKey, world),
									block,
									undefined,
								),
							)
							worldGlobality.set(worldSymbol, [worldKey, block])
						} else {
							worldGlobality.set(worldSymbol, undefined)
							const stmt = getSymbolDeclStatement(worldSymbol)
							if (stmt) updateInsertIndex(stmt)
						}
					}

					let queries = queryMap.get(worldSymbol)
					if (!queries) {
						queries = []
						queryMap.set(worldSymbol, queries)
					}

					const name = ts.factory.createUniqueName("query")
					const call = ts.factory.createCallExpression(
						ts.factory.createPropertyAccessExpression(node, "cached"),
						undefined,
						undefined,
					)
					const archetypes = ts.factory.createUniqueName("archetypes")
					queries.push({ node: call, name, archetypes, components: components.queried })
					return name
				}
			}

			return ts.visitEachChild(node, cacheQueries, context)
		}

		sourceFile = ts.visitNode(sourceFile, cacheQueries, ts.isSourceFile)

		if (queryMap.size > 0) {
			for (const [world, queries] of queryMap) {
				const worldScopeInfo = worldGlobality.get(world)

				const jecsType = (name: string, ...args: ts.TypeNode[]) =>
					ts.factory.createImportTypeNode(
						ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(jecsPackage)),
						undefined,
						ts.factory.createIdentifier(name),
						args,
						false,
					)

				const localDecls = queries.flatMap(({ node, name, archetypes, components }) => [
					ts.factory.createVariableDeclaration(
						name,
						undefined,
						jecsType(
							"CachedQuery",
							ts.factory.createTupleTypeNode(
								components.map((ct) =>
									ts.isIdentifier(ct)
										? ts.factory.createTypeQueryNode(ct)
										: jecsType(
												"Pair",
												jecsType(
													"InferComponent",
													ts.factory.createTypeQueryNode(ct.arguments[0]),
												),
												jecsType(
													"InferComponent",
													ts.factory.createTypeQueryNode(ct.arguments[1]),
												),
											),
								),
							),
						),
						worldScopeInfo ? undefined : node,
					),
					ts.factory.createVariableDeclaration(
						archetypes,
						undefined,
						ts.factory.createTypeReferenceNode("ReturnType", [
							ts.factory.createIndexedAccessTypeNode(
								ts.factory.createTypeQueryNode(name),
								ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral("archetypes")),
							),
						]),
						worldScopeInfo
							? undefined
							: ts.factory.createCallExpression(
									ts.factory.createPropertyAccessExpression(name, "archetypes"),
									undefined,
									undefined,
								),
					),
				])
				if (worldScopeInfo) {
					const [worldKey, block] = worldScopeInfo

					replacementQueue.set(
						block,
						ts.factory.createBlock(
							block.statements.concat(
								queries.flatMap(({ node, name, archetypes }) => [
									ts.factory.createExpressionStatement(ts.factory.createAssignment(name, node)),
									ts.factory.createExpressionStatement(
										ts.factory.createAssignment(
											archetypes,
											ts.factory.createCallExpression(
												ts.factory.createPropertyAccessExpression(name, "archetypes"),
												undefined,
												undefined,
											),
										),
									),
								]),
							),
						),
					)

					localDecls.push(
						ts.factory.createVariableDeclaration(
							worldKey,
							undefined,
							ts.factory.createImportTypeNode(
								ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(jecsPackage)),
								undefined,
								ts.factory.createIdentifier("World"),
								undefined,
								false,
							),
							undefined,
						),
					)
				}

				decls.push(
					ts.factory.createVariableStatement(
						undefined,
						ts.factory.createVariableDeclarationList(
							localDecls,
							worldScopeInfo ? ts.NodeFlags.Let : ts.NodeFlags.Const,
						),
					),
				)
			}
		}

		const flushReplacements = (currentNode: ts.Node) => {
			const replacement = replacementQueue.get(currentNode)
			if (replacement) {
				replacementQueue.delete(currentNode)
				return ts.visitEachChild(replacement, flushReplacements, context)
			}

			return ts.visitEachChild(currentNode, flushReplacements, context)
		}

		sourceFile = ts.visitNode(sourceFile, flushReplacements, ts.isSourceFile)

		return ts.factory.updateSourceFile(sourceFile, [
			...sourceFile.statements.slice(0, insertIndex + 1),
			...decls,
			...sourceFile.statements.slice(insertIndex + 1),
		])
	}

	const iteratorInliner: Transformer = (sourceFile) => {
		const cachedQueries = new Map(
			Array.from(queryMap.values())
				.flat()
				.map(({ name, ...parts }) => [name, parts] as const),
		)

		const inlineIterators = (node: ts.Node) => {
			if (
				ts.isForOfStatement(node) &&
				(ts.isCallExpression(node.expression) ||
					(ts.isIdentifier(node.expression) && cachedQueries.has(node.expression))) &&
				ts.isVariableDeclarationList(node.initializer) &&
				ts.isVariableDeclaration(node.initializer.declarations[0]) &&
				ts.isArrayBindingPattern(node.initializer.declarations[0].name)
			) {
				let valid = ts.isIdentifier(node.expression)
				if (!valid) {
					const expressionSymbol = typeChecker.getTypeAtLocation(node.expression).aliasSymbol
					// FIXME: because Query is generic, the symbols will be different.
					// we compare the declarations because as far as i know there is no other way.
					if (expressionSymbol) {
						valid = [querySymbol, cachedQuerySymbol].some(
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							(s) => s.declarations![0] === expressionSymbol.declarations![0],
						)
					}
				}

				if (valid) {
					let queriedCts, archetypesList
					if (ts.isIdentifier(node.expression)) {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const { components, archetypes } = cachedQueries.get(node.expression)!
						queriedCts = components
						archetypesList = archetypes
					} else {
						const result = parseQuery(node.expression)
						if ("queried" in result) {
							queriedCts = result.queried
							archetypesList = ts.factory.createCallExpression(
								ts.factory.createPropertyAccessExpression(node.expression, "archetypes"),
								undefined,
								undefined,
							)
						}
					}
					if (queriedCts && archetypesList) {
						const archetype = ts.factory.createUniqueName("archetype")
						const entities = ts.factory.createUniqueName("entities")
						const field = ts.factory.createUniqueName("field")
						const row = ts.factory.createUniqueName("row")

						const [entity, ...cts] = node.initializer.declarations[0].name.elements

						const ctsDecls = cts
							.map((el, i) => [el, queriedCts[i]] as const)
							.flatMap(([el, ct]) => (ts.isOmittedExpression(el) ? [] : [[el.name, ct] as const]))
							.map(([el, ct]) => {
								const key = ts.factory.getGeneratedNameForNode(ct)
								return [
									ct,
									key,
									ts.factory.createVariableDeclaration(
										el,
										undefined,
										undefined,
										ts.factory.createNonNullExpression(
											ts.factory.createElementAccessExpression(
												key,
												ts.factory.createBinaryExpression(
													row,
													ts.factory.createToken(ts.SyntaxKind.MinusToken),
													ts.factory.createNumericLiteral("1"),
												),
											),
										),
									),
								] as const
							})

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

							return ts.visitEachChild(node, fixBreak, context)
						}

						const statement = ts.visitEachChild(node.statement, fixBreak, context)

						return (
							ts.factory.createVariableStatement(
								undefined,
								ts.factory.createVariableDeclarationList(
									[
										ts.factory.createVariableDeclaration(
											row,
											undefined,
											ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword),
											undefined,
										),
									],
									ts.NodeFlags.Let,
								),
							),
							ts.factory.createForOfStatement(
								undefined,
								ts.factory.createVariableDeclarationList(
									[ts.factory.createVariableDeclaration(archetype, undefined, undefined, undefined)],
									ts.NodeFlags.Const,
								),
								archetypesList,
								ts.factory.createBlock(
									[
										ts.factory.createVariableStatement(
											undefined,
											ts.factory.createVariableDeclarationList(
												[
													ts.factory.createVariableDeclaration(
														entities,
														undefined,
														undefined,
														ts.factory.createPropertyAccessExpression(
															archetype,
															ts.factory.createIdentifier("entities"),
														),
													),
												],
												ts.NodeFlags.Const,
											),
										),

										...(ctsDecls.length
											? [
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
																...ctsDecls.map(([ct, key]) =>
																	ts.factory.createVariableDeclaration(
																		key,
																		undefined,
																		undefined,
																		ts.factory.createNonNullExpression(
																			ts.factory.createElementAccessExpression(
																				field,
																				ct,
																			),
																		),
																	),
																),
															],
															ts.NodeFlags.Const,
														),
													),
												]
											: []),
										...(brokenVariable
											? [
													ts.factory.createVariableStatement(
														undefined,
														ts.factory.createVariableDeclarationList(
															[
																ts.factory.createVariableDeclaration(
																	brokenVariable,
																	undefined,
																	undefined,
																	ts.factory.createFalse(),
																),
															],
															ts.NodeFlags.Let,
														),
													),
												]
											: []),
										ts.factory.createForOfStatement(
											undefined,
											ts.factory.createVariableDeclarationList(
												[
													ts.factory.createVariableDeclaration(
														row,
														undefined,
														undefined,
														undefined,
													),
												],
												ts.NodeFlags.Const,
											),
											ts.factory.createCallExpression(
												ts.factory.createIdentifier("$range"),
												undefined,
												[
													ts.factory.createCallExpression(
														ts.factory.createPropertyAccessExpression(
															entities,
															ts.factory.createIdentifier("size"),
														),
														undefined,
														[],
													),
													ts.factory.createNumericLiteral("1"),
													ts.factory.createPrefixUnaryExpression(
														ts.SyntaxKind.MinusToken,
														ts.factory.createNumericLiteral("1"),
													),
												],
											),
											ts.factory.createBlock(
												[
													...(ts.isOmittedExpression(entity)
														? []
														: [
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
																							ts.factory.createToken(
																								ts.SyntaxKind
																									.MinusToken,
																							),
																							ts.factory.createNumericLiteral(
																								"1",
																							),
																						),
																					),
																				),
																			),
																		],
																		ts.NodeFlags.Const,
																	),
																),
															]),
													...(ctsDecls.length
														? [
																ts.factory.createVariableStatement(
																	undefined,
																	ts.factory.createVariableDeclarationList(
																		ctsDecls.map(([, , decl]) => decl),
																		ts.NodeFlags.Const,
																	),
																),
															]
														: []),
													ts.visitEachChild(statement, inlineIterators, context),
												],
												true,
											),
										),
										...(brokenVariable
											? [
													ts.factory.createIfStatement(
														brokenVariable,
														ts.factory.createBreakStatement(),
													),
												]
											: []),
									],
									true,
								),
							)
						)
					}
				}
			}

			return ts.visitEachChild(node, inlineIterators, context)
		}

		return ts.visitNode(sourceFile, inlineIterators, ts.isSourceFile)
	}

	for (const transform of [queryCacher, iteratorInliner]) {
		sourceFile = transform(sourceFile)
	}
	return sourceFile
}

const transformer: (program: ts.Program, config?: Config) => ts.TransformerFactory<ts.SourceFile> =
	(program, config) => (context) => (sourceFile) =>
		transformerInner(program, context, sourceFile, config)
export default transformer
