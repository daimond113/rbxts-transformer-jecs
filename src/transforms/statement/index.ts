import ts from "typescript"
import type { TransformState } from "../index.js"
import { toArray } from "../../util.js"
import { transformForOfStatement } from "./forOf.js"

const TRANSFORMERS = new Map<
	ts.SyntaxKind,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(state: TransformState, node: any) => ts.Statement | ts.Statement[] | undefined
>([[ts.SyntaxKind.ForOfStatement, transformForOfStatement]])

export function transformStatement(state: TransformState, statement: ts.Statement): ts.Statement[] {
	const [node, prereqs] = state.capture(
		() => TRANSFORMERS.get(statement.kind)?.(state, statement) ?? state.transform(statement),
	)

	return [...prereqs, ...toArray(node)]
}

export function transformStatementList(
	state: TransformState,
	node: ts.Node,
	toTransform: ReadonlyArray<ts.Statement>,
): ts.Statement[] {
	const endIndices = new Map<ts.Statement, number>()

	const [statements, caches] = state.captureCache(node, () => {
		const statements: ts.Statement[] = []
		toTransform.forEach((originalStmt) => {
			const transformed = transformStatement(state, originalStmt)
			statements.push(...transformed)
			endIndices.set(originalStmt, statements.length)
		})
		return statements
	})

	let result = statements
	let offset = 0

	for (const cache of caches) {
		if (cache.innerResultMarker) {
			result.forEach((stmt, i) => {
				const visit: ts.Visitor = (child) => {
					if (child === cache.innerResultMarker) return cache.toInnerResults()
					return ts.visitEachChild(child, visit, state.context)
				}
				result[i] = ts.visitEachChild(stmt, visit, state.context)
			})
		}

		const outerResults = cache.toOuterResults()

		let insertIndex = 0
		for (const required of cache.requires) {
			const endIndex = endIndices.get(required) ?? 0
			if (endIndex > insertIndex) {
				insertIndex = endIndex + offset
				offset += outerResults.length
			}
		}

		result = [...result.slice(0, insertIndex), ...outerResults, ...result.slice(insertIndex)]
	}

	return result
}
