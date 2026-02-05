import ts from "typescript"
import { transformNode } from "./node.js"
import { toArray } from "../util.js"
import assert from "assert"

export type Config = { silent: boolean; jecsPackage: string }

const ok = <T>(item: T | undefined, msg: string): T => {
	assert(item, msg)
	return item
}

export class TransformState {
	public typeChecker: ts.TypeChecker
	public resolutionHost: ts.ModuleResolutionHost = ts.sys

	constructor(
		public program: ts.Program,
		public context: ts.TransformationContext,
		public config: Config,
	) {
		this.typeChecker = program.getTypeChecker()
	}

	public jecs: {
		query: {
			symbol: ts.Symbol
			with: ts.Symbol
			without: ts.Symbol
			cached: ts.Symbol
		}
		cachedQuery: {
			symbol: ts.Symbol
		}
		world: {
			symbol: ts.Symbol
			query: ts.Symbol
		}
	} = undefined as never

	private getPackageSymbol(sourceFile: ts.SourceFile, packageName: string): ts.Symbol | undefined {
		const typeChecker = this.program.getTypeChecker()

		const resolvedModule = ts.resolveModuleName(
			packageName,
			sourceFile.fileName,
			this.program.getCompilerOptions(),
			this.resolutionHost,
		)

		if (resolvedModule.resolvedModule) {
			const moduleSourceFile = this.program.getSourceFile(resolvedModule.resolvedModule.resolvedFileName)

			if (moduleSourceFile) {
				const moduleSymbol = typeChecker.getSymbolAtLocation(moduleSourceFile)
				return moduleSymbol
			}
		}

		return undefined
	}

	public loadJecsSymbols(sourceFile: ts.SourceFile) {
		if (this.jecs) return

		const jecsSymbol = ok(
			this.getPackageSymbol(sourceFile, this.config.jecsPackage),
			"Unable to extract type information from Jecs",
		)
		const jecsExports = this.typeChecker.getExportsOfModule(jecsSymbol)

		const querySymbol = ok(
			jecsExports.find((s) => s.getName() === "Query"),
			"Unable to find Query type information from Jecs",
		)
		const queryType = this.typeChecker.getDeclaredTypeOfSymbol(querySymbol)

		const worldSymbol = ok(
			jecsExports.find((s) => s.getName() === "World"),
			"Unable to find World type information from Jecs",
		)
		const worldType = this.typeChecker.getDeclaredTypeOfSymbol(worldSymbol)

		this.jecs = {
			query: {
				symbol: querySymbol,
				with: ok(queryType.getProperty("with"), "Unable to find Query.with type information from Jecs"),
				without: ok(
					queryType.getProperty("without"),
					"Unable to find Query.without type information from Jecs",
				),
				cached: ok(queryType.getProperty("cached"), "Unable to find Query.cached type information from Jecs"),
			},
			cachedQuery: {
				symbol: ok(
					jecsExports.find((s) => s.getName() === "CachedQuery"),
					"Unable to find CachedQuery type information from Jecs",
				),
			},
			world: {
				symbol: worldSymbol,
				query: ok(worldType.getProperty("query"), "Unable to find World.query type information from Jecs"),
			},
		}
	}

	private prereqStack = new Array<Array<ts.Statement>>()
	capture<T>(cb: () => T): [T, ts.Statement[]] {
		this.prereqStack.push([])
		const result = cb()
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return [result, this.prereqStack.pop()!]
	}

	prereq(stmts: ts.Statement | ts.Statement[]) {
		const stack = this.prereqStack[this.prereqStack.length - 1]
		if (stack) stack.push(...toArray(stmts))
	}

	transform<T extends ts.Node>(node: T): T {
		return ts.visitEachChild(node, (newNode) => transformNode(this, newNode), this.context)
	}

	private cacheStack = new Array<Cache>()
	captureCache<T>(node: ts.Node, cb: () => T): [T, Cache] {
		this.cacheStack.push(new Cache(this, node))
		const result = cb()
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return [result, this.cacheStack.pop()!]
	}

	currentCache(): Cache {
		return this.cacheStack[this.cacheStack.length - 1]
	}

	fileCache(): Cache {
		return this.cacheStack[0]
	}

	jecsType(typeName: "World"): ts.TypeNode
	jecsType(typeName: "InferComponent", ...args: [ts.TypeNode]): ts.TypeNode
	jecsType(typeName: "Pair", ...args: [ts.TypeNode, ts.TypeNode]): ts.TypeNode
	jecsType(typeName: "CachedQuery", ...args: ts.TypeNode[]): ts.TypeNode
	jecsType(typeName: "CachedQuery" | "World" | "Pair" | "InferComponent", ...args: ts.TypeNode[]): ts.TypeNode {
		return ts.factory.createImportTypeNode(
			ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(this.config.jecsPackage)),
			undefined,
			ts.factory.createIdentifier(typeName),
			args.length ? args : undefined,
			false,
		)
	}

	public cachedQueries = new Map<ts.Identifier, { archetypes: ts.Identifier; components: ts.Expression[] }>()
}

class Cache {
	public requires = new Array<ts.Statement>()
	private outerStatements = new Array<ts.Statement>()
	private innerStatements = new Array<ts.Statement>()
	private worldKey: ts.Identifier | undefined
	private condition: ts.Expression | undefined
	public innerResultMarker: ts.Statement | undefined

	constructor(
		private state: TransformState,
		public node: ts.Node,
	) {}

	require(toBeDeclared: ts.Statement | ts.Statement[]) {
		this.requires.push(...toArray(toBeDeclared))
	}

	outerResult(toBeInserted: ts.Statement | ts.Statement[]) {
		this.outerStatements.push(...toArray(toBeInserted))
	}

	innerResult(toBeInserted: ts.Statement | ts.Statement[]) {
		if (!this.innerResultMarker) {
			this.state.prereq((this.innerResultMarker = ts.factory.createEmptyStatement()))
		}
		this.innerStatements.push(...toArray(toBeInserted))
	}

	conditioned(world: ts.Expression) {
		if (this.condition) return

		this.condition = ts.factory.createStrictInequality(
			(this.worldKey ??= ts.factory.createUniqueName("worldKey")),
			world,
		)

		this.outerResult(
			ts.factory.createVariableStatement(
				undefined,
				ts.factory.createVariableDeclarationList(
					[ts.factory.createVariableDeclaration(this.worldKey, undefined, this.state.jecsType("World"))],
					ts.NodeFlags.Let,
				),
			),
		)

		this.innerResult(ts.factory.createExpressionStatement(ts.factory.createAssignment(this.worldKey, world)))
	}

	toOuterResults(): ts.Statement[] {
		return this.outerStatements
	}

	toInnerResults(): ts.Statement[] {
		const results = []
		if (this.condition) {
			results.push(
				ts.factory.createIfStatement(this.condition, ts.factory.createBlock(this.innerStatements, true)),
			)
		} else {
			results.push(...this.innerStatements)
		}
		return results
	}
}
