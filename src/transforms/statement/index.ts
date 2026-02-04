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
	const statements: ts.Statement[] = []
	const endIndices = new Map<ts.Statement, number>()

	const [, cache] = state.captureCache(node, () => {
		toTransform.forEach((originalStmt) => {
			const transformed = transformStatement(state, originalStmt)
			statements.push(...transformed)
			endIndices.set(originalStmt, statements.length)
		})
		return []
	})

	let insertIndex = 0
	for (const required of cache.requires) {
		const endIndex = endIndices.get(required) ?? 0
		if (endIndex > insertIndex) {
			insertIndex = endIndex
		}
	}

	return [...statements.slice(0, insertIndex), ...cache.toOuterResults(), ...statements.slice(insertIndex)]
}
