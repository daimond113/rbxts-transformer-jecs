import ts from "typescript"
import type { TransformState } from "../index.js"
import { toArray } from "../../util.js"

const TRANSFORMERS = new Map<
	ts.SyntaxKind,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(state: TransformState, node: any) => ts.Statement | ts.Statement[] | undefined
>([])

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
	const [statements, cache] = state.captureCache(node, () =>
		toTransform.flatMap((stmt) => transformStatement(state, stmt)),
	)

	let insertIndex = 0
	for (const requires of cache.requires) {
		insertIndex = Math.max(insertIndex, statements.indexOf(requires) + 1)
	}

	return [...statements.slice(0, insertIndex), ...cache.toOuterResults(), ...statements.slice(insertIndex)]
}
