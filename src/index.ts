import ts from "typescript"
import { findMatchingChild, getReturnType, getSymbolDeclStatement, getTrivia, isStatic, type Static } from "./util.js"
import assert from "node:assert"

type Config = { silent?: boolean; jecsPackage?: string }

const transformerInner = (
	program: ts.Program,
	context: ts.TransformationContext,
	sourceFile: ts.SourceFile,
	config?: Config,
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

	let insertIndex = -1
	const updateInsertIndex = (stmt: ts.Statement) => {
		const index = sourceFile.statements.indexOf(stmt)
		insertIndex = Math.max(insertIndex, index)
	}

	const decls = []
	const queryMap = new Map<ts.Symbol, { node: ts.Expression; name: ts.Identifier; components: Static[] }[]>()
	const worldGlobality = new Map<ts.Symbol, [ts.Identifier, ts.Block] | undefined>()

	const parseQuery = (full: ts.CallExpression) => {
		const components = [] as Static[]

		const visit = (node: ts.Node): ts.Expression | undefined => {
			if (ts.isCallExpression(node)) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const symbol = typeChecker.getSymbolAtLocation(node.expression)!
				if (
					// FIXME: because Query is generic, the symbols will be different.
					// we compare the declarations because as far as i know there is no other way.
					[queryMethodSymbol, queryWithSymbol, queryWithoutSymbol].some(
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						(s) => s.declarations![0] === symbol.declarations![0],
					)
				) {
					for (const ct of node.arguments) {
						if (!isStatic(typeChecker, sourceFile, ct, updateInsertIndex)) {
							return ct
						}

						if (symbol === queryMethodSymbol) {
							components.push(ct)
						}
					}
				}
			}
			return ts.forEachChild(node, visit)
		}

		return visit(full) ?? components
	}

	const ignoredNodes = new Set<ts.Node>()

	const findQuery: ts.Visitor = (node: ts.Node) => {
		const isQuery = (node: ts.Node): node is ts.CallExpression =>
			ts.isCallExpression(node) && typeChecker.getSymbolAtLocation(node.expression) === queryMethodSymbol

		if (ts.isCallExpression(node) && !getTrivia(node).includes("no-cache")) {
			let child: ts.CallExpression | undefined = node
			if (
				getReturnType(typeChecker, node).aliasSymbol === querySymbol &&
				(isQuery(child) || (child = findMatchingChild(child, isQuery)))
			) {
				if (ignoredNodes.has(child)) {
					return node
				}

				const faultOrComponents = parseQuery(node)
				if (!Array.isArray(faultOrComponents)) {
					ignoredNodes.add(child)
					if (!silent) {
						console.warn(
							`'${faultOrComponents.getText()}' isn't simple. Query '${node.getText()}' will not be cached.`,
						)
					}
					return node
				}

				let world = child.expression
				if (!ts.isPropertyAccessExpression(world)) {
					console.warn(`Unsupported world.query access type: ${ts.SyntaxKind[world.kind]}`)
					return node
				}
				world = world.expression
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const worldSymbol = typeChecker.getSymbolAtLocation(world)!
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
				queries.push({ node: call, name, components: faultOrComponents })
				return name
			}
		}

		return ts.visitEachChild(node, findQuery, context)
	}

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	sourceFile = ts.visitNode(sourceFile, findQuery, ts.isSourceFile)!

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

			const localDecls = queries.map(({ node, name, components }) =>
				ts.factory.createVariableDeclaration(
					name,
					undefined,
					jecsType(
						"CachedQuery",
						ts.factory.createTupleTypeNode(
							components.map((ct) =>
								jecsType(
									"InferComponent",
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
					),
					worldScopeInfo ? undefined : node,
				),
			)
			if (worldScopeInfo) {
				const [worldKey, block] = worldScopeInfo

				// FIXME: ugly hack to not have to iterate the whole tree twice
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				;(block as any).statements = block.statements.concat(
					queries.map(({ node, name }) =>
						ts.factory.createExpressionStatement(ts.factory.createAssignment(name, node)),
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

	return ts.factory.updateSourceFile(sourceFile, [
		...sourceFile.statements.slice(0, insertIndex + 1),
		...decls,
		...sourceFile.statements.slice(insertIndex + 1),
	])
}

const transformer: (program: ts.Program, config?: Config) => ts.TransformerFactory<ts.SourceFile> =
	(program, config) => (context) => (sourceFile) =>
		transformerInner(program, context, sourceFile, config)
export default transformer
